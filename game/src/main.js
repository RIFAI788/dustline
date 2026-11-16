// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. window.__dustline exposes the state for debugging.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, range } from './rng.js';
import { createWorld } from './world.js';
import { createMover } from './mover.js';
import { createInput } from './input.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createEconomy } from './economy.js';
import { createMatch } from './match.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const random = mulberry32(seed);
const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const grenades = createGrenades(scene, onGrenadeExplode);
const bomb = createBomb(scene);
const weapons = createWeapons(camera, audio);

const state = {
  random,
  time: 0,
  phase: 'menu',
  timer: 0,
  round: 0,
  score: { van: 0, jac: 0 },
  money: 800,
  lossStreak: 0,
  kills: 0,
  deaths: 0,
  grenades: 0,
  playerAlive: true,
  playerHealth: 100,
  playerArmor: 0,
  playerPos: new THREE.Vector3(0, 0, 17.5),
  playerYaw: 0,
  spike: bomb.spike,
  bots: [],
  visibleEnemies: new Set(),
  plantT: 0,
  matchOver: false,
  shot: !!shot,
};
const economy = createEconomy(state);

const player = createMover(world.colliders, 0, 17.5, { speed: 5.2 });
const body = player.state;
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const stats = { playerShots: 0, playerHits: 0, botShots: 0, botHits: 0, playerHitsTaken: 0, wallHits: 0 };
let bloom = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepCounter = 0;
let spectateBot = null;

const hud = createHud({
  onBuy: (kind) => buyItem(kind),
  money: () => state.money,
  owned: (kind) => kind === 'kevlar' ? state.playerArmor > 0 : kind === 'frag' ? state.grenades > 0 : !!weapons.owned[kind],
});
const minimap = createMinimap(document.getElementById('minimap'), world);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.matchOver) {
    match.startMatch();
    state.matchOver = false;
  }
  if (state.phase === 'menu') {
    match.startMatch();
  }
  input.requestLock();
});

const bots = createBots(scene, world, random, botContext());
state.bots = bots.bots;

const match = createMatch({
  state,
  bots,
  bomb,
  weapons,
  economy,
  hud,
  audio,
  world,
  playerReset: (spawn) => resetPlayer(spawn),
  onMatchEnd: () => { state.matchOver = true; },
});

function botContext() {
  return {
    get time() { return state.time; },
    get spike() { return bomb.spike; },
    get phase() { return state.phase; },
    hasLOS,
    shoot: botShoot,
    enemiesOf(bot) {
      const list = [];
      if (bot.team === 'jac') {
        if (state.playerAlive) {
          list.push({ ref: 'player', pos: body.position, speed: player.groundSpeed(), alive: true });
        }
        for (const other of bots.bots) {
          if (other.team === 'van' && other.alive) {
            list.push({ ref: other, pos: other.mover.state.position, speed: other.mover.groundSpeed(), alive: true });
          }
        }
      } else {
        for (const other of bots.bots) {
          if (other.team === 'jac' && other.alive) {
            list.push({ ref: other, pos: other.mover.state.position, speed: other.mover.groundSpeed(), alive: true });
          }
        }
      }
      return list;
    },
    spikePlanted(bot, site) {
      bomb.plant(site, bot.mover.state.position);
      economy.objectiveReward();
      hud.killfeed(`${bot.name} planted the spike at ${site}`, 'good');
      hud.setBomb(`Spike planted at ${site} — defend it!`, true);
      audio.plant();
    },
    spikeDefused(bot) {
      bomb.spike.status = 'defused';
      hud.killfeed(`${bot.name} defused the spike`, 'bad');
      match.endRound('jac', 'defused');
    },
  };
}

function hasLOS(from, to, dist) {
  direction.copy(to).sub(from);
  const length = direction.length() || 1;
  direction.divideScalar(length);
  scene.updateMatrixWorld(true);
  raycaster.set(from, direction);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  raycaster.far = 120;
  return !hit || hit.distance >= dist - 0.3;
}

function resetPlayer(spawn) {
  body.position.set(spawn[0], 0, spawn[1]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  body.eye = 1.6;
  state.playerAlive = true;
  state.playerHealth = 100;
  state.playerArmor = state.playerArmor; // kevlar kept if bought and survived; reset on death
  state.plantT = 0;
  spectateBot = null;
  hud.hideOverlay();
  hud.setHealth(state.playerHealth, state.playerArmor);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (started && !state.matchOver && state.phase !== 'roundEnd') {
    hud.showBuy(false);
    hud.showOverlay('paused');
  }
}

function buyItem(kind) {
  if (state.phase !== 'buy') return;
  if (kind === 'kevlar') {
    if (state.playerArmor >= 100 || !economy.spend('kevlar')) { audio.deny(); return; }
    state.playerArmor = 100;
    audio.buy();
    hud.setHealth(state.playerHealth, state.playerArmor);
    hud.showBuy(true);
    return;
  }
  if (kind === 'frag') {
    if (state.grenades >= 1 || !economy.spend('frag')) { audio.deny(); return; }
    state.grenades = 1;
    audio.buy();
    hud.setGrenades(1);
    hud.showBuy(true);
    return;
  }
  if (weapons.owned[kind]) {
    weapons.switchTo(kind);
    hud.setAmmo(weapons.owned[kind].mag, weapons.owned[kind].reserve, WEAPONS[kind].name);
    return;
  }
  if (!economy.spend(kind)) { audio.deny(); return; }
  weapons.buy(kind);
  audio.buy();
  hud.setAmmo(weapons.owned[kind].mag, weapons.owned[kind].reserve, WEAPONS[kind].name);
  hud.showBuy(true);
}

function applyDamageToPlayer(amount, attackerName) {
  if (!state.playerAlive) return;
  // Captures are staged: the player cannot die mid-shot.
  if (state.shot) return;
  let remaining = amount;
  if (state.playerArmor > 0) {
    const absorbed = Math.min(state.playerArmor, remaining * 0.5);
    state.playerArmor -= absorbed;
    remaining -= absorbed;
  }
  state.playerHealth -= remaining;
  hud.damageFlash();
  audio.hurt();
  hud.setHealth(state.playerHealth, state.playerArmor);
  if (state.playerHealth <= 0) {
    state.playerHealth = 0;
    state.playerAlive = false;
    state.deaths += 1;
    hud.setKills(state.kills, state.deaths);
    hud.killfeed(`${attackerName || 'Jackal'} ▸ You`, 'bad');
    if (document.pointerLockElement) document.exitPointerLock();
    if (bomb.spike.status === 'carried' && bomb.spike.carrier === 'player') {
      const carrier = bots.bots.filter((b) => b.alive && b.team === 'van')
        .sort((a, b) => a.mover.state.position.distanceTo(body.position) - b.mover.state.position.distanceTo(body.position))[0];
      bomb.drop(body.position);
      if (carrier) bomb.spike.carrier = carrier;
    }
    spectateBot = bots.bots.find((b) => b.alive && b.team === 'van') || null;
    hud.showOverlay('dead');
  }
}

function rayPlayerHit(origin, dir, maxDist) {
  const px = body.position.x;
  const pz = body.position.z;
  const dx = dir.x;
  const dz = dir.z;
  const denom = dx * dx + dz * dz;
  if (denom < 1e-8) return null;
  const t = ((px - origin.x) * dx + (pz - origin.z) * dz) / denom;
  if (t < 0 || t > maxDist) return null;
  const hx = origin.x + dx * t;
  const hz = origin.z + dz * t;
  const hy = origin.y + dir.y * t;
  const horizontal = Math.hypot(px - hx, pz - hz);
  if (horizontal > 0.45) return null;
  const y0 = body.position.y;
  const y1 = body.position.y + body.height;
  if (hy < y0 || hy > y1) return null;
  return { t, point: new THREE.Vector3(hx, hy, hz), part: hy > y1 - 0.35 ? 'head' : 'torso' };
}

function resolveShot(origin, dir, maxDist, shooterTeam, shooterRef, weaponDef) {
  scene.updateMatrixWorld(true);
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  // The shooter's own head and torso never block its own bullet: the eye
  // sits inside its own head sphere, so without this every bot shot stops
  // at point-blank range on itself.
  const targets = world.shootables.concat(bots.hitMeshes().filter((mesh) => mesh.userData.bot !== shooterRef));
  const hit = raycaster.intersectObjects(targets, false)[0];
  raycaster.far = 120;
  const playerHit = shooterTeam !== 'van' && state.playerAlive ? rayPlayerHit(origin, dir, maxDist) : null;
  const wallDist = hit ? hit.distance : Infinity;
  const playerDist = playerHit ? playerHit.t : Infinity;
  if (playerHit && playerDist < wallDist) {
    return { kind: 'player', point: playerHit.point, part: playerHit.part, dist: playerDist };
  }
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot && bot.alive && bot.team !== shooterTeam) {
      return { kind: 'bot', bot, point: hit.point, part: hit.object.userData.part || 'torso', dist: hit.distance };
    }
    return { kind: 'wall', point: hit.point, dist: hit.distance };
  }
  return { kind: 'none', point: origin.clone().addScaledVector(dir, maxDist), dist: maxDist };
}

function damageFalloff(amount, dist, range) {
  return amount * (1 - 0.5 * Math.min(1, dist / range));
}

function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.reload();
    return;
  }
  camera.getWorldDirection(direction);
  const speed = player.groundSpeed();
  const spread = weapons.spread(speed) + bloom + (weapons.state.scoped ? -0.001 : 0);
  const pellets = def.pellets || 1;
  stats.playerShots += 1;
  let anyHit = false;
  let killed = false;
  for (let p = 0; p < pellets; p += 1) {
    const jitter = new THREE.Vector3(
      (random() * 2 - 1) * spread,
      (random() * 2 - 1) * spread,
      (random() * 2 - 1) * spread,
    );
    const dir = direction.clone().add(jitter).normalize();
    camera.getWorldPosition(muzzle);
    const result = resolveShot(camera.position, dir, def.range, 'van', 'player', def);
    const end = result.point;
    effects.tracer(muzzle.clone().addScaledVector(direction, 0.5), end);
    if (result.kind === 'bot') {
      stats.playerHits += 1;
      const amount = damageFalloff(def.damage, result.dist, def.range) * (result.part === 'head' ? def.headMult : 1);
      const wasKilled = bots.damage(result.bot, amount, result.part);
      effects.impact(result.point);
      hud.hitMarker(wasKilled, shot ? 4000 : 90);
      audio.hit(wasKilled);
      anyHit = true;
      if (wasKilled) {
        killed = true;
        state.kills += 1;
        economy.killReward();
        hud.setMoney(state.money);
        hud.setKills(state.kills, state.deaths);
        hud.killfeed(`You ▸ ${result.bot.name}${result.part === 'head' ? ' ☠' : ''}`, 'good');
        bots.hearShot(result.bot.mover.state.position, 'jac');
      }
    } else if (result.kind === 'wall') {
      effects.impact(result.point);
    }
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  bloom = Math.min(0.02, bloom + 0.0016);
  audio.shot(def.sound);
  bots.hearShot(body.position, 'van');
  hud.setAmmo(weapons.owned[weapons.current].mag, weapons.owned[weapons.current].reserve, def.name);
}

function botShoot(bot, aim, spread, head) {
  const eye = new THREE.Vector3(bot.mover.state.position.x, bot.mover.state.position.y + bot.mover.state.eye, bot.mover.state.position.z);
  const dir = aim.clone().sub(eye).normalize();
  dir.x += (random() * 2 - 1) * spread;
  dir.y += (random() * 2 - 1) * spread;
  dir.z += (random() * 2 - 1) * spread;
  dir.normalize();
  const muzzlePos = eye.clone().addScaledVector(dir, 0.5);
  const result = resolveShot(eye, dir, 70, bot.team, bot, WEAPONS.rifle);
  stats.botShots += 1;
  effects.tracer(muzzlePos, result.point);
  const distToPlayer = state.playerAlive ? eye.distanceTo(body.position) : 99;
  audio.shot('enemy', distToPlayer > 15);
  if (result.kind === 'player') {
    stats.playerHitsTaken += 1;
    const amount = damageFalloff(30, result.dist, 70) * (result.part === 'head' ? 4 : 1);
    applyDamageToPlayer(amount, bot.name);
  } else if (result.kind === 'bot') {
    stats.botHits += 1;
    const amount = damageFalloff(30, result.dist, 70) * (result.part === 'head' ? 4 : 1);
    const wasKilled = bots.damage(result.bot, amount, result.part);
    effects.impact(result.point);
    if (wasKilled) {
      hud.killfeed(`${bot.name} ▸ ${result.bot.name}${result.part === 'head' ? ' ☠' : ''}`, result.bot.team === 'jac' ? 'good' : 'bad');
      if (result.bot.team === 'jac') {
        state.kills += 0;
      }
    }
  } else if (result.kind === 'wall') {
    stats.wallHits += 1;
    effects.impact(result.point);
  }
}

function onGrenadeExplode(center, radius, maxDamage) {
  audio.grenade();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.mover.state.position.distanceTo(center);
    if (d < radius) {
      const amount = maxDamage * (1 - d / radius);
      const wasKilled = bots.damage(bot, amount, 'torso');
      if (wasKilled) {
        hud.killfeed(`Frag ▸ ${bot.name}`, bot.team === 'jac' ? 'good' : 'bad');
        if (bot.team === 'jac') {
          state.kills += 1;
          economy.killReward();
          hud.setMoney(state.money);
          hud.setKills(state.kills, state.deaths);
        }
      }
    }
  }
  if (state.playerAlive) {
    const d = body.position.distanceTo(center);
    if (d < radius) {
      applyDamageToPlayer(maxDamage * (1 - d / radius) * 0.7, 'Frag');
    }
  }
}

function syncCamera() {
  if (!state.playerAlive && spectateBot) {
    const s = spectateBot.mover.state;
    camera.position.set(s.position.x, s.position.y + s.eye, s.position.z);
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAtPoint(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  state.time += dt;
  elapsed += dt;
  bloom = Math.max(0, bloom - dt * 0.03);
  match.step(dt);
  bomb.step(dt, (pos) => {
    onGrenadeExplode(pos, 12, 200);
    hud.setBomb('Spike detonated!');
  }, (final) => audio.beep(final));

  if (state.phase === 'live' || state.phase === 'buy') {
    const keys = input.state.keys;
    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const moveInput = {
      f: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      s: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      jump: keys.has('Space'),
      crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    };
    if (state.playerAlive) {
      player.step(dt, moveInput);
      if (walking) {
        body.velocity.x *= 0.55;
        body.velocity.z *= 0.55;
      }
      // Spike pickup.
      if (bomb.spike.status === 'dropped' && bomb.spike.carrier !== 'player') {
        const d = Math.hypot(body.position.x - bomb.spike.pos.x, body.position.z - bomb.spike.pos.z);
        if (d < 1.4) {
          bomb.spike.status = 'carried';
          bomb.spike.carrier = 'player';
          hud.setBomb('Spike with you — plant at A or B');
          hud.killfeed('You picked up the spike', 'good');
        }
      }
      // Spike plant channel.
      if (bomb.spike.status === 'carried' && bomb.spike.carrier === 'player' && state.phase === 'live') {
        let site = null;
        for (const s of Object.values(world.sites)) {
          const d = Math.hypot(body.position.x - s.center.x, body.position.z - s.center.z);
          if (d < s.radius) site = s;
        }
        if (site && keys.has('KeyE')) {
          state.plantT += dt;
          hud.setPlant(state.plantT / bomb.plantSeconds, `Planting at ${site.name}…`);
          if (state.plantT >= bomb.plantSeconds) {
            bomb.plant(site.name, body.position);
            economy.objectiveReward();
            hud.setMoney(state.money);
            hud.killfeed(`You planted the spike at ${site.name}`, 'good');
            hud.setBomb(`Spike planted at ${site.name} — defend it!`, true);
            hud.setPlant(0, '');
            audio.plant();
            state.plantT = 0;
          }
        } else {
          state.plantT = Math.max(0, state.plantT - dt * 2);
          hud.setPlant(state.plantT > 0 ? state.plantT / bomb.plantSeconds : 0, site ? 'Hold E to plant' : '');
        }
      }
    }
    bots.step(dt, state.time);
    grenades.step(dt, world.colliders);
    effects.step(dt);
    weapons.step(dt);
    // Visible enemies for the minimap: seen by the player recently or just fired.
    state.visibleEnemies.clear();
    if (state.playerAlive) {
      for (const bot of bots.bots) {
        if (bot.team !== 'jac' || !bot.alive) continue;
        const eye = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
        const target = new THREE.Vector3(bot.mover.state.position.x, bot.mover.state.position.y + 1.2, bot.mover.state.position.z);
        const dist = eye.distanceTo(target);
        if (dist < 42 && hasLOS(eye, target, dist)) state.visibleEnemies.add(bot.id);
      }
    }
  }
}

function syncHud() {
  hud.setTimer(state.timer, state.phase);
  hud.setMoney(state.money);
  if (state.playerAlive) {
    hud.setHealth(state.playerHealth, state.playerArmor);
    const slot = weapons.owned[weapons.current];
    hud.setAmmo(slot.mag, slot.reserve, weapons.def().name);
    hud.setCrosshairGap(6 + weapons.spread(player.groundSpeed()) * 900 + bloom * 900);
  }
  hud.setScore(state.score.van, state.score.jac, state.round);
  hud.setKills(state.kills, state.deaths);
  hud.setGrenades(state.grenades);
  state.playerPos.copy(body.position);
  state.playerYaw = body.yaw;
  minimap.draw(state);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (state.playerAlive && input.state.locked) player.look(look.x, look.y);
    const actions = input.takeActions();
    for (const code of actions) {
      if (code === 'KeyB' && state.phase === 'buy') {
        const open = document.getElementById('buy-panel').hidden;
        hud.showBuy(open);
        if (open && document.pointerLockElement) document.exitPointerLock();
        else if (!open) input.requestLock();
      } else if (code === 'KeyG' && state.phase === 'live' && state.playerAlive && state.grenades > 0) {
        camera.getWorldDirection(direction);
        grenades.throwGrenade(camera.position.clone(), direction.clone());
        state.grenades = 0;
        hud.setGrenades(0);
        audio.buy();
      } else if (code === 'KeyQ') {
        const ownedKinds = Object.keys(weapons.owned);
        const index = ownedKinds.indexOf(weapons.current);
        const next = ownedKinds[(index + 1) % ownedKinds.length];
        weapons.switchTo(next);
        hud.setAmmo(weapons.owned[next].mag, weapons.owned[next].reserve, WEAPONS[next].name);
      } else if (code === 'KeyM') {
        audio.setMuted(true);
      } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4' || code === 'Digit5' || code === 'Digit6') {
        const buyOpen = !document.getElementById('buy-panel').hidden;
        if (buyOpen && state.phase === 'buy') {
          const kinds = ['rifle', 'smg', 'shotgun', 'dmr', 'kevlar', 'frag'];
          buyItem(kinds[Number(code.slice(5)) - 1]);
        } else if (code === 'Digit1') {
          const primary = Object.keys(weapons.owned).find((k) => WEAPONS[k].slot === 1);
          if (primary) weapons.switchTo(primary);
        } else if (code === 'Digit2') {
          weapons.switchTo('pistol');
        }
      }
    }
    if (input.state.firing && state.playerAlive && state.phase === 'live' && weapons.ready()) {
      if (weapons.def().auto || !input.state.firingHeld) playerShoot();
    }
    input.state.firingHeld = input.state.firing;
    if (input.state.keys.has('KeyR') && state.playerAlive) weapons.reload();
    weapons.setScoped(input.state.aiming && state.playerAlive);
    const targetFov = weapons.state.scoped ? 74 / weapons.def().zoom : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  body.pitch = 0;
  body.yaw = 0;
  match.startMatch();
  hud.showBuy(false);
  if (name === 'start') {
    body.position.set(0, 0, 17.5);
    body.yaw = 0;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    state.money = 3250;
    hud.setMoney(3250);
    body.position.set(0, 0, 16);
    body.yaw = 0.3;
    settle(20);
    hud.showBuy(true);
  } else if (name === 'play') {
    state.phase = 'live';
    state.timer = 82;
    body.position.set(0, 0, 9);
    const jackals = bots.bots.filter((b) => b.team === 'jac');
    const target1 = jackals[0];
    const target2 = jackals[1];
    // Open ground south of the tower: neither target can strafe behind cover.
    target1.mover.state.position.set(-5, 0, 2);
    target2.mover.state.position.set(5, 0, 2);
    // Hold both targets in place so the scripted shots land where aimed.
    for (const target of [target1, target2]) {
      target.state = 'hold';
      target.path = [];
      target.pathIndex = 0;
      target.holdYaw = Math.PI;
    }
    const van = bots.bots.find((b) => b.team === 'van');
    van.mover.state.position.set(-10, 0, 12);
    settle(20);
    const chestOf = (bot) => new THREE.Vector3(bot.mover.state.position.x, bot.mover.state.position.y + 1.3, bot.mover.state.position.z);
    const headOf = (bot) => new THREE.Vector3(bot.mover.state.position.x, bot.mover.state.position.y + 1.56, bot.mover.state.position.z);
    // Five pistol rounds at falloff distance finish the first Jackal; the
    // first is a headshot so the kill lands before a teammate can steal it.
    aimAtPoint(headOf(target1));
    if (weapons.ready()) playerShoot();
    settle(12);
    for (let round = 0; round < 4; round += 1) {
      aimAtPoint(chestOf(target1));
      if (weapons.ready()) playerShoot();
      settle(12);
    }
    aimAtPoint(chestOf(target2));
    if (weapons.ready()) playerShoot();
    settle(10);
  } else if (name === 'end') {
    state.score = { van: 3, jac: 1 };
    state.round = 4;
    state.phase = 'live';
    state.timer = 82;
    const jackals = bots.bots.filter((b) => b.team === 'jac');
    const dead = jackals[0];
    bots.damage(dead, 500, 'torso');
    dead.mesh.rotation.x = -1.45;
    dead.mesh.position.set(-17, 0, -10);
    dead.mover.state.position.set(-17, 0, -10);
    body.position.set(-14, 0, -6);
    settle(10);
    aimAtPoint(new THREE.Vector3(-19, 1.2, -12));
    hud.setBomb('Spike detonated at A — Vanguard leads 3 – 1');
    hud.showBanner('Round won', 'Spike detonated at A. Vanguard leads 3 – 1.', 4000);
  }
  hud.setScore(state.score.van, state.score.jac, state.round);
  hud.setMoney(state.money);
  hud.setKills(state.kills, state.deaths);
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__dustline = {
  state, weapons, bots, bomb, stats, version: 'dustline-1',
  // Test hook: unfreeze a ?shot capture and let the live loop run.
  resume() {
    frozen = false;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  },
};

hud.setAmmo(weapons.owned.pistol.mag, weapons.owned.pistol.reserve, WEAPONS.pistol.name);
hud.setHealth(100, 0);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setKills(0, 0);
hud.setGrenades(0);
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
