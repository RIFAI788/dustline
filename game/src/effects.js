// Pooled tracers and impact flashes: no new objects in the hot loop.
// A tracer is a short-lived line from muzzle to hit point; an impact is a
// small fading spark at the hit.
import * as THREE from 'three';

const POOL = 24;
const TRACER_LIFE = 0.09;

export function createEffects(scene) {
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let cursor = 0;

  const impactGeometry = new THREE.SphereGeometry(0.07, 8, 6);
  const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.9 });
  const impacts = [];
  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(impactGeometry, impactMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactCursor = 0;

  return {
    tracer(from, to) {
      const slot = tracers[cursor];
      cursor = (cursor + 1) % POOL;
      const positions = slot.line.geometry.attributes.position.array;
      positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
      positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.visible = true;
      slot.line.material.opacity = 0.9;
      slot.life = TRACER_LIFE;
    },
    impact(point) {
      const slot = impacts[impactCursor];
      impactCursor = (impactCursor + 1) % POOL;
      slot.mesh.position.copy(point);
      slot.mesh.visible = true;
      slot.mesh.material.opacity = 0.9;
      slot.mesh.scale.setScalar(1);
      slot.life = 0.16;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / TRACER_LIFE) * 0.9;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of impacts) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.mesh.material.opacity = Math.max(0, slot.life / 0.16) * 0.9;
        slot.mesh.scale.setScalar(1 + (0.16 - slot.life) * 6);
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
  };
}
