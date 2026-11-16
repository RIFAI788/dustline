// Weapons: the buy menu's catalogue and the first-person view models.
// Each weapon owns its numbers; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', price: 0, slot: 2, auto: false, mag: 12, reserve: 48, gap: 0.18, reload: 1.3, damage: 26, headMult: 4, spreadStill: 0.002, spreadMove: 0.02, range: 45, kick: 0.008, sound: 'pistol', zoom: 1 },
  rifle: { name: 'VK-47 Rifle', price: 2700, slot: 1, auto: true, mag: 30, reserve: 90, gap: 0.1, reload: 2.0, damage: 34, headMult: 4, spreadStill: 0.0022, spreadMove: 0.028, range: 70, kick: 0.011, sound: 'rifle', zoom: 1 },
  smg: { name: 'Kestrel SMG', price: 1500, slot: 1, auto: true, mag: 25, reserve: 100, gap: 0.07, reload: 1.7, damage: 22, headMult: 4, spreadStill: 0.004, spreadMove: 0.034, range: 38, kick: 0.007, sound: 'smg', zoom: 1 },
  shotgun: { name: 'Breaker Shotgun', price: 1700, slot: 1, auto: false, mag: 6, reserve: 24, gap: 0.9, reload: 2.6, damage: 13, headMult: 3, spreadStill: 0.02, spreadMove: 0.03, range: 22, kick: 0.03, sound: 'shotgun', pellets: 8, zoom: 1 },
  dmr: { name: 'Longshot DMR', price: 4750, slot: 1, auto: false, mag: 5, reserve: 20, gap: 1.15, reload: 2.8, damage: 88, headMult: 4, spreadStill: 0.0008, spreadMove: 0.02, range: 90, kick: 0.02, sound: 'dmr', zoom: 2.2 },
};

const MUZZLE_TIME = 0.06;

export function createWeapons(camera, audio) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.6, metalness: 0.3 });

  function buildModel(kind) {
    const model = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (kind === 'pistol') {
      add(0.05, 0.09, 0.22, 0, 0, -0.1, body);
      add(0.045, 0.09, 0.06, 0, -0.07, 0.02, grip);
    } else if (kind === 'shotgun') {
      add(0.09, 0.11, 0.5, 0, 0, -0.15, dark);
      add(0.05, 0.05, 0.44, 0, 0.03, -0.32, grip);
      add(0.07, 0.09, 0.2, 0, -0.02, 0.28, grip);
    } else if (kind === 'dmr') {
      add(0.07, 0.09, 0.55, 0, 0, -0.18, body);
      add(0.04, 0.04, 0.4, 0, 0.03, -0.4, grip);
      add(0.06, 0.06, 0.06, 0, 0.09, -0.1, dark);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
    } else if (kind === 'smg') {
      add(0.08, 0.1, 0.36, 0, 0, -0.12, body);
      add(0.04, 0.04, 0.3, 0, 0.03, -0.3, grip);
      add(0.05, 0.12, 0.05, 0, -0.1, -0.05, grip);
    } else {
      add(0.09, 0.1, 0.42, 0, 0, -0.12, body);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
    }
    model.position.set(0.2, -0.17, -0.48);
    model.rotation.y = -0.08;
    model.scale.setScalar(0.85);
    return model;
  }

  const models = {};
  for (const kind of Object.keys(WEAPONS)) {
    models[kind] = buildModel(kind);
    models[kind].visible = false;
    camera.add(models[kind]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  let current = 'pistol';
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false };

  function show() {
    for (const kind of Object.keys(models)) models[kind].visible = kind === current;
  }
  show();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.48 + state.kick;
    model.position.x = state.scoped ? 0 : 0.2;
    model.position.y = state.scoped ? -0.13 : -0.17;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = owned[current];
        const need = def().mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  function def() { return WEAPONS[current]; }

  return {
    owned,
    get current() { return current; },
    def,
    state,
    step,
    ready() {
      return owned[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kick;
    },
    takeRound() {
      const slot = owned[current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const slot = owned[current];
      if (state.reloadLeft > 0 || slot.mag === def().mag || slot.reserve === 0) return false;
      state.reloadLeft = def().reload;
      audio.reload();
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    switchTo(kind) {
      if (!owned[kind] || kind === current) return false;
      current = kind;
      state.reloadLeft = 0;
      state.scoped = false;
      show();
      return true;
    },
    buy(kind) {
      if (owned[kind]) return false;
      owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      current = kind;
      state.reloadLeft = 0;
      state.scoped = false;
      show();
      return true;
    },
    refillAmmo() {
      for (const kind of Object.keys(owned)) {
        owned[kind].mag = WEAPONS[kind].mag;
        owned[kind].reserve = WEAPONS[kind].reserve;
      }
    },
    resetToPistol() {
      for (const kind of Object.keys(owned)) delete owned[kind];
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
      current = 'pistol';
      state.reloadLeft = 0;
      state.scoped = false;
      show();
    },
    setScoped(value) {
      state.scoped = value && def().zoom > 1;
    },
  };
}
