// Bot AI: nine bots on two teams. A bot patrols its lane on a waypoint graph,
// holds its site, investigates gunfire it hears, and engages what it sees.
// In a fight it strafes, fires in bursts with a reaction delay, and its spread
// grows with distance and target speed, so stopping to aim pays for both sides.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { PALETTE } from './palette.js';
import { pick, range, chance } from './rng.js';

const BOT_HEALTH = 100;
const VISION_RANGE = 42;
const HEAR_RANGE = 26;
const ENGAGE_FOV = 0.35;

const VAN_NAMES = ['Rook', 'Sable', 'Iris', 'Moss'];
const JAC_NAMES = ['Dune', 'Vex', 'Hale', 'Brink', 'Onyx'];

function buildBotMesh(scene, team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'van' ? '#2f6f6a' : '#7a5a26'), roughness: 0.8 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'van' ? PALETTE.accent : PALETTE.enemy), roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.4 });
  const add = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(0.16, 0.75, 0.16, -0.12, 0.38, 0, cloth);
  add(0.16, 0.75, 0.16, 0.12, 0.38, 0, cloth);
  const torso = add(0.52, 0.62, 0.3, 0, 1.08, 0, cloth);
  add(0.54, 0.2, 0.32, 0, 1.22, 0, vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.y = 1.56;
  head.castShadow = true;
  group.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), vest);
  band.position.y = 1.62;
  group.add(band);
  const gun = add(0.06, 0.09, 0.62, 0.24, 1.15, -0.2, gunMat);
  gun.visible = true;
  scene.add(group);
  torso.userData.part = 'torso';
  head.userData.part = 'head';
  return { group, torso, head };
}

function bfsPath(nodes, edges, from, to) {
  if (from === to) return [to];
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const previous = new Array(nodes.length).fill(-1);
  const queue = [from];
  previous[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) break;
    for (const next of adjacency[current]) {
      if (previous[next] === -1) {
        previous[next] = current;
        queue.push(next);
      }
    }
  }
  if (previous[to] === -1) return [to];
  const path = [];
  let node = to;
  while (node !== from) {
    path.unshift(node);
    node = previous[node];
  }
  return path;
}

function nearestNode(nodes, x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const dx = nodes[i].x - x;
    const dz = nodes[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function createBots(scene, world, random, ctx) {
  const bots = [];
  const temp = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  function spawnBot(team, name, x, z, role) {
    const mover = createMover(world.colliders, x, z, { speed: 4.6, accel: 36 });
    const mesh = buildBotMesh(scene, team);
    const bot = {
      id: `${team}-${name}`,
      team,
      name,
      role,
      mover,
      mesh: mesh.group,
      torso: mesh.torso,
      head: mesh.head,
      health: BOT_HEALTH,
      armor: 0,
      alive: true,
      weapon: 'rifle',
      state: 'patrol',
      node: nearestNode(world.nodes, x, z),
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: null,
      lastSeenTime: -99,
      hearPos: null,
      hearTime: -99,
      reaction: 0,
      burstLeft: 0,
      burstPause: 0,
      fireCooldown: 0,
      strafeDir: 1,
      strafeTimer: 0,
      holdYaw: 0,
      scanTime: random() * 6,
      fall: 0,
      deadTime: 0,
      skill: range(random, 0.85, 1.2),
      plantT: 0,
      defuseT: 0,
      site: role === 'A' ? 'A' : role === 'B' ? 'B' : null,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function reset(team) {
    for (const bot of bots) {
      bot.alive = true;
      bot.health = BOT_HEALTH;
      bot.armor = 0;
      bot.state = 'patrol';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.fall = 0;
      bot.deadTime = 0;
      bot.plantT = 0;
      bot.defuseT = 0;
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.visible = true;
      const spawn = pick(random, world.spawns[bot.team]);
      bot.mover.state.position.set(spawn[0], 0, spawn[1]);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.mover.state.yaw = bot.team === 'van' ? Math.PI : 0;
      bot.node = nearestNode(world.nodes, spawn[0], spawn[1]);
      assignOrders(bot);
    }
  }

  function assignOrders(bot) {
    if (bot.team === 'jac') {
      if (bot.role === 'roam') {
        bot.state = 'patrol';
        bot.path = bfsPath(world.nodes, world.edges, bot.node, pick(random, [12, 13, 22]));
        bot.pathIndex = 0;
      } else {
        bot.state = 'hold';
        const siteNode = bot.site === 'A' ? 17 : 18;
        bot.path = bfsPath(world.nodes, world.edges, bot.node, siteNode);
        bot.pathIndex = 0;
        bot.holdYaw = bot.site === 'A' ? Math.PI * 0.75 : Math.PI * 0.25;
      }
    } else {
      bot.state = 'patrol';
      const siteNode = bot.site === 'A' ? 17 : 18;
      bot.path = bfsPath(world.nodes, world.edges, bot.node, siteNode);
      bot.pathIndex = 0;
    }
  }

  function setPath(bot, nodeIndex) {
    bot.path = bfsPath(world.nodes, world.edges, bot.node, nodeIndex);
    bot.pathIndex = 0;
  }

  function visibleEnemy(bot, time) {
    const eye = eyePos.set(bot.mover.state.position.x, bot.mover.state.position.y + bot.mover.state.eye, bot.mover.state.position.z);
    let best = null;
    let bestDist = Infinity;
    for (const other of ctx.enemiesOf(bot)) {
      if (!other.alive) continue;
      const dx = other.pos.x - eye.x;
      const dy = (other.pos.y + 1.2) - eye.y;
      const dz = other.pos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > VISION_RANGE) continue;
      temp.set(dx / dist, dy / dist, dz / dist);
      const forward = new THREE.Vector3(-Math.sin(bot.mover.state.yaw), 0, -Math.cos(bot.mover.state.yaw));
      if (temp.dot(forward) < ENGAGE_FOV && dist > 4) continue;
      if (!ctx.hasLOS(eye, targetPos.set(other.pos.x, other.pos.y + 1.2, other.pos.z), dist)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = { ref: other, dist, chest: targetPos.clone() };
      }
    }
    return best;
  }

  function aimAt(bot, point, dt) {
    const p = bot.mover.state.position;
    const dx = point.x - p.x;
    const dy = point.y - (p.y + bot.mover.state.eye);
    const dz = point.z - p.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
    let dyaw = wantYaw - bot.mover.state.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = Math.min(1, dt * 7);
    bot.mover.state.yaw += dyaw * turn;
    bot.mover.state.pitch += (wantPitch - bot.mover.state.pitch) * turn;
  }

  function fireAt(bot, seen, dt) {
    bot.fireCooldown -= dt;
    if (bot.reaction > 0) {
      bot.reaction -= dt;
      return;
    }
    if (bot.burstLeft > 0) {
      if (bot.fireCooldown <= 0) {
        bot.fireCooldown = 0.14;
        bot.burstLeft -= 1;
        const target = seen.ref;
        const speed = target.speed || 0;
        const spread = (0.02 + seen.dist * 0.0011 + speed * 0.0035) * bot.skill;
        const head = chance(random, 0.1);
        const aim = targetPos.copy(seen.chest);
        if (head) aim.y += 0.35;
        ctx.shoot(bot, aim, spread, head);
      }
    } else {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) {
        bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.burstPause = range(random, 0.6, 1.3);
      }
    }
  }

  function moveAlongPath(bot, dt, time) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = world.nodes[bot.path[bot.pathIndex]];
    const p = bot.mover.state.position;
    const dx = node.x - p.x;
    const dz = node.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.node = bot.path[bot.pathIndex];
      bot.pathIndex += 1;
      bot.stuckT = 0;
      return bot.pathIndex >= bot.path.length;
    }
    // Stuck guard: a bot that makes no progress for 2 s skips the node
    // instead of pushing against a wall forever.
    const moved = Math.hypot(p.x - (bot.lastX ?? p.x), p.z - (bot.lastZ ?? p.z));
    bot.lastX = p.x;
    bot.lastZ = p.z;
    if (moved < 0.02) {
      bot.stuckT = (bot.stuckT ?? 0) + dt;
      if (bot.stuckT > 2) {
        bot.stuckT = 0;
        bot.pathIndex += 1;
        return bot.pathIndex >= bot.path.length;
      }
    } else {
      bot.stuckT = 0;
    }
    const wantYaw = Math.atan2(-dx, -dz);
    let dyaw = wantYaw - bot.mover.state.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.mover.state.yaw += dyaw * Math.min(1, dt * 6);
    bot.mover.step(dt, { f: 1, s: 0, jump: false, crouch: false });
    return false;
  }

  function stepBot(bot, dt, time) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.rotation.x = -bot.fall * 1.45;
      } else {
        bot.deadTime += dt;
        if (bot.deadTime > 3) bot.mesh.visible = false;
      }
      return;
    }
    const seen = ctx.phase === 'live' ? visibleEnemy(bot, time) : null;
    if (seen) {
      if (bot.target !== seen.ref) {
        bot.target = seen.ref;
        // The reaction delay applies once, when the bot first enters a
        // fight — not on every target switch, or the bot never fires.
        if (bot.state !== 'engage') {
          bot.reaction = range(random, 0.35, 0.65);
          bot.burstLeft = 0;
          bot.burstPause = 0;
        }
      }
      bot.lastSeen = seen.chest.clone();
      bot.lastSeenTime = time;
      bot.state = 'engage';
    } else if (bot.target && time - bot.lastSeenTime > 1.2) {
      bot.target = null;
      bot.state = bot.team === 'jac' && bot.site ? 'hold' : 'patrol';
      if (bot.state === 'patrol') assignOrders(bot);
    }

    // Spike duties override movement when the spike is planted or dropped.
    if (ctx.spike.status === 'planted' && bot.team === 'jac' && bot.state !== 'engage') {
      const siteNode = ctx.spike.site === 'A' ? 17 : 18;
      if (bot.state !== 'defuse') {
        bot.state = 'defuse';
        setPath(bot, siteNode);
      }
      if (moveAlongPath(bot, dt, time)) {
        const spikePos = ctx.spike.pos;
        const d = Math.hypot(bot.mover.state.position.x - spikePos.x, bot.mover.state.position.z - spikePos.z);
        if (d < 2.2) {
          bot.defuseT += dt;
          aimAt(bot, spikePos, dt);
          if (bot.defuseT >= 5) ctx.spikeDefused(bot);
        } else {
          bot.defuseT = 0;
        }
      }
      return;
    }
    if (ctx.spike.status === 'dropped' && ctx.spike.carrier === bot) {
      const spikePos = ctx.spike.pos;
      const dSpike = Math.hypot(bot.mover.state.position.x - spikePos.x, bot.mover.state.position.z - spikePos.z);
      if (dSpike > 1.6) {
        // Walk straight to the dropped spike first; it lies on open ground.
        const dx = spikePos.x - bot.mover.state.position.x;
        const dz = spikePos.z - bot.mover.state.position.z;
        bot.mover.state.yaw = Math.atan2(-dx, -dz);
        bot.mover.step(dt, { f: 1, s: 0, jump: false, crouch: false });
        return;
      }
      const siteNode = bot.site === 'A' ? 17 : 18;
      if (bot.state !== 'plant') {
        bot.state = 'plant';
        setPath(bot, siteNode);
      }
      if (moveAlongPath(bot, dt, time)) {
        const site = world.sites[bot.site];
        const d = Math.hypot(bot.mover.state.position.x - site.center.x, bot.mover.state.position.z - site.center.z);
        if (d < site.radius) {
          bot.plantT += dt;
          if (bot.plantT >= 3) ctx.spikePlanted(bot, bot.site);
        } else {
          bot.plantT = 0;
        }
      }
      return;
    }

    if (bot.state === 'engage' && seen) {
      aimAt(bot, seen.chest, dt);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = range(random, 0.5, 1.1);
        bot.strafeDir = chance(random, 0.5) ? 1 : -1;
      }
      bot.mover.step(dt, { f: 0, s: bot.strafeDir, jump: false, crouch: chance(random, 0.2) });
      fireAt(bot, seen, dt);
      return;
    }

    if (bot.state === 'hold') {
      if (bot.pathIndex < bot.path.length) {
        if (moveAlongPath(bot, dt, time)) bot.holdYaw = bot.mover.state.yaw;
      } else {
        bot.scanTime += dt;
        bot.mover.state.yaw = bot.holdYaw + Math.sin(bot.scanTime * 0.5) * 0.7;
        bot.mover.step(dt, { f: 0, s: 0, jump: false, crouch: false });
      }
      return;
    }

    // patrol / investigate: walk the path, re-path when done.
    if (bot.hearPos && time - bot.hearTime < 6 && bot.state !== 'engage') {
      bot.state = 'investigate';
      setPath(bot, nearestNode(world.nodes, bot.hearPos.x, bot.hearPos.z));
      bot.hearPos = null;
    }
    if (bot.pathIndex >= bot.path.length) {
      if (bot.team === 'jac' && bot.role === 'roam') {
        bot.path = bfsPath(world.nodes, world.edges, bot.node, pick(random, [12, 13, 22]));
        bot.pathIndex = 0;
      } else if (bot.team === 'van') {
        assignOrders(bot);
      } else {
        bot.state = 'hold';
      }
      return;
    }
    moveAlongPath(bot, dt, time);
  }

  function hearShot(pos, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const d = Math.hypot(bot.mover.state.position.x - pos.x, bot.mover.state.position.z - pos.z);
      if (d < HEAR_RANGE) {
        bot.hearPos = { x: pos.x, z: pos.z };
        bot.hearTime = ctx.time;
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, remaining * 0.5);
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.fall = 0;
      bot.deadTime = 0;
      bot.target = null;
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function hitMeshes() {
    const meshes = [];
    for (const bot of bots) {
      if (bot.alive) meshes.push(bot.torso, bot.head);
    }
    return meshes;
  }

  // Create the teams: 4 Vanguard with the player, 5 Jackals.
  spawnBot('van', VAN_NAMES[0], -4, 16.5, 'A');
  spawnBot('van', VAN_NAMES[1], 4, 16.5, 'B');
  spawnBot('van', VAN_NAMES[2], -8, 15, 'A');
  spawnBot('van', VAN_NAMES[3], 8, 15, 'B');
  spawnBot('jac', JAC_NAMES[0], -4, -16.5, 'A');
  spawnBot('jac', JAC_NAMES[1], 4, -16.5, 'B');
  spawnBot('jac', JAC_NAMES[2], -8, -15, 'A');
  spawnBot('jac', JAC_NAMES[3], 8, -15, 'B');
  spawnBot('jac', JAC_NAMES[4], 0, -17.5, 'roam');

  return {
    bots,
    reset,
    hearShot,
    damage,
    aliveCount,
    hitMeshes,
    step(dt, time) {
      for (const bot of bots) stepBot(bot, dt, time);
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.mesh.position.copy(bot.mover.state.position);
        bot.mesh.rotation.y = bot.mover.state.yaw + Math.PI;
      }
    },
  };
}
