// Dustline Yard: an original desert-industrial map, 56 x 40 m. Vanguard spawn
// south, Jackal spawn north. Site A "Foundry" west, site B "Silos" east, a mid
// lane between them, and long lanes on both flanks. Built from boxes and
// cylinders only; every solid is a collider and a surface bullets stop on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(radius, height, x, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), materials[material]);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = radius * 0.72;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - half, 0, z - half), new THREE.Vector3(x + half, height, z + half)));
    shootables.push(mesh);
    return mesh;
  }

  function letterTexture(letter, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 136);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  function siteMarker(letter, x, z, color) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, 0.03, z);
    group.add(decal);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 8), materials.steel);
    pole.position.set(x + 3.4, 2.2, z - 3.4);
    pole.castShadow = true;
    group.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.9),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, side: THREE.DoubleSide }),
    );
    flag.position.set(x + 2.6, 3.9, z - 3.4);
    group.add(flag);
  }

  // Ground and perimeter, 5 m walls, open sky.
  box(56.8, 0.4, 40.8, 0, -0.2, 0, 'groundDark');
  box(0.6, 5, 40.8, -28.3, 2.5, 0, 'concrete');
  box(0.6, 5, 40.8, 28.3, 2.5, 0, 'concrete');
  box(56.8, 5, 0.6, 0, 2.5, -20.3, 'concrete');
  box(56.8, 5, 0.6, 0, 2.5, 20.3, 'concrete');

  // Site A "Foundry": a U-shaped works on the west, open to the south.
  box(0.8, 3.4, 10, -24, 1.7, -12, 'concreteDark');
  box(10, 3.4, 0.8, -19.4, 1.7, -16.6, 'concreteDark');
  box(4.4, 2.2, 0.8, -17.2, 1.1, -7.6, 'concrete');
  box(1.4, 1.1, 1.4, -21.5, 0.55, -9.5, 'crate');
  box(1.4, 1.1, 1.4, -17.5, 0.55, -13.5, 'crate');
  box(2.2, 0.8, 1.2, -19, 0.4, -10.5, 'steel');
  cylinder(0.9, 3.8, -23.5, -15.5, 'steel');

  // Site B "Silos": twin silos on the east, crates for cover.
  cylinder(2.1, 6.5, 22.5, -14.5, 'concrete');
  cylinder(2.1, 5.2, 18.2, -16.2, 'concreteDark');
  box(1.4, 1.1, 1.4, 15.5, 0.55, -10.5, 'crate');
  box(1.4, 1.1, 1.4, 21.5, 0.55, -9.5, 'crate');
  box(2.4, 0.9, 1.2, 18.5, 0.45, -13.5, 'steel');
  box(0.8, 3.0, 8, 24.5, 1.5, -10, 'concreteDark');

  // Mid: a low tower with a ramp, crates splitting the lane.
  box(4.4, 2.6, 4.4, 0, 1.3, -2, 'concrete');
  box(4.4, 0.5, 4.4, 0, 2.85, -2, 'concreteDark');
  box(1.2, 1.1, 1.2, -4.6, 0.55, 0.5, 'crate');
  box(1.2, 1.1, 1.2, 4.6, 0.55, -5.6, 'crate');
  box(1.2, 1.1, 1.2, -2.2, 0.55, 7.6, 'crate');
  box(1.2, 1.1, 1.2, 2.6, 0.55, -9.6, 'crate');

  // Long lanes: cover crates and a pipe bridge on each flank.
  box(1.4, 1.1, 1.4, -24.5, 0.55, 2, 'crate');
  box(1.4, 1.1, 1.4, -24.5, 0.55, 8.5, 'crate');
  box(3.2, 0.9, 1.2, -21, 0.45, 5.5, 'steel');
  box(1.4, 1.1, 1.4, 24.5, 0.55, 2, 'crate');
  box(1.4, 1.1, 1.4, 24.5, 0.55, 8.5, 'crate');
  box(3.2, 0.9, 1.2, 21, 0.45, 5.5, 'steel');

  // Connector walls: corners that break sightlines between mid and the flanks.
  box(0.8, 3.2, 7, -12, 1.6, 2, 'concrete');
  box(0.8, 3.2, 7, 12, 1.6, 2, 'concrete');
  box(6, 3.2, 0.8, -9, 1.6, -8, 'concrete');
  box(6, 3.2, 0.8, 9, 1.6, -8, 'concrete');

  // Scrub bushes: small dark-green cones, decoration only, no collision.
  const bushMaterial = materials.leaf;
  for (const [x, z, s] of [[-26, 18, 1.1], [-14, 18.5, 0.9], [14, 18.5, 1.0], [26, 18, 1.2], [-26, -18, 1.0], [26, -18, 0.9], [-6, -18.5, 1.1], [6, -18.5, 0.8]]) {
    const bush = new THREE.Mesh(new THREE.ConeGeometry(0.7 * s, 1.1 * s, 8), bushMaterial);
    bush.position.set(x, 0.55 * s, z);
    bush.castShadow = true;
    group.add(bush);
  }

  siteMarker('A', -19, -12, PALETTE.accent);
  siteMarker('B', 19, -12, PALETTE.enemy);

  // Light: low dusk sun from the west, cool fill, warm sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#e8c9a0'), new THREE.Color(PALETTE.groundDark), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.9);
  sun.position.set(-24, 18, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8ba8'), 0.5);
  fill.position.set(18, 12, -14);
  scene.add(fill);

  const sites = {
    A: { name: 'A', center: new THREE.Vector3(-19, 0, -12), radius: 5 },
    B: { name: 'B', center: new THREE.Vector3(19, 0, -12), radius: 5 },
  };
  const spawns = {
    van: [[-4, 16.5], [0, 17.5], [4, 16.5], [-8, 15], [8, 15]],
    jac: [[-4, -16.5], [0, -17.5], [4, -16.5], [-8, -15], [8, -15]],
  };
  // Waypoint graph for bot routes: [x, z] nodes and their edges. Every edge
  // is a straight line clear of walls and crates, so a bot walking it never
  // gets stuck pushing against a solid. The tower is rounded via (+-6, 2)
  // and (+-6, -6); the sites are entered from the east, past the site walls.
  const nodes = [
    [-14, 12], [0, 12], [14, 12],
    [-14, 6.5], [0, 6.5], [14, 6.5],
    [-26.5, 11], [-26.5, 0], [-26.5, -8],
    [26.5, 11], [26.5, 0], [26.5, -8],
    [-6, 2], [6, 2],
    [-6, -6], [6, -6],
    [0, -10],
    [-19, -12], [19, -12],
    [-14, -12], [14, -12],
    [-14, -16], [0, -16], [14, -16],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const edges = [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5],
    [0, 6], [6, 7], [7, 8], [3, 6], [7, 12], [8, 14],
    [2, 9], [9, 10], [10, 11], [5, 9], [10, 13], [11, 15],
    [4, 12], [4, 13], [12, 14], [13, 15], [12, 13], [14, 15],
    [14, 16], [15, 16], [16, 19], [16, 20], [19, 17], [20, 18],
    [21, 22], [22, 23], [21, 8], [23, 11], [22, 16],
  ];

  return { colliders, shootables, group, sites, spawns, nodes, edges, bounds: BOUNDS };
}
