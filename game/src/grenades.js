// Frag grenades: a thrown sphere with gravity that explodes on a fuse,
// damaging everyone in radius with falloff. One pooled visual per grenade.
import * as THREE from 'three';

const FUSE = 1.4;
const RADIUS = 5.5;
const MAX_DAMAGE = 120;
const GRAVITY = 14;

export function createGrenades(scene, onExplode) {
  const geometry = new THREE.SphereGeometry(0.09, 10, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.5, metalness: 0.5 });
  const ringGeometry = new THREE.SphereGeometry(1, 20, 14);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.55, depthWrite: false });
  const live = [];

  function throwGrenade(origin, direction, power = 13) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      mesh,
      velocity: direction.clone().multiplyScalar(power).add(new THREE.Vector3(0, 3.5, 0)),
      fuse: FUSE,
    });
  }

  function step(dt, colliders) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      if (next.y <= 0.09) {
        next.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) > 2 ? -g.velocity.y * 0.35 : 0;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      for (const collider of colliders) {
        if (collider.containsPoint(next)) {
          if (Math.abs(g.velocity.x) > 1) g.velocity.x *= -0.4;
          if (Math.abs(g.velocity.z) > 1) g.velocity.z *= -0.4;
          if (g.velocity.y < 0) g.velocity.y = Math.abs(g.velocity.y) * 0.35;
          next.copy(g.mesh.position);
          break;
        }
      }
      g.mesh.position.copy(next);
      if (g.fuse <= 0) {
        explode(g);
        live.splice(i, 1);
      }
    }
  }

  function explode(g) {
    const center = g.mesh.position.clone();
    scene.remove(g.mesh);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    ring.position.copy(center);
    ring.scale.setScalar(0.2);
    scene.add(ring);
    let life = 0.35;
    const grow = (dt) => {
      life -= dt;
      ring.scale.setScalar(ring.scale.x + dt * 26);
      ring.material.opacity = Math.max(0, life / 0.35) * 0.55;
      if (life <= 0) scene.remove(ring);
      else requestAnimationFrame(() => grow(1 / 60));
    };
    grow(1 / 60);
    onExplode(center, RADIUS, MAX_DAMAGE);
  }

  return { throwGrenade, step, count: () => live.length };
}
