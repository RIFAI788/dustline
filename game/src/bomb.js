// The spike: carried by the player (or a Vanguard bot if the player falls),
// planted at a site on a 3 s channel, then a 35 s fuse. A Jackal defuses it on
// a 5 s channel. Explode or defuse ends the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const FUSE_SECONDS = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.4, metalness: 0.3 }),
  );
  body.castShadow = true;
  group.add(body);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  light.position.set(0, 0.13, 0);
  group.add(light);
  group.visible = false;
  scene.add(group);

  const spike = {
    status: 'carried',
    carrier: null,
    site: null,
    pos: new THREE.Vector3(),
    plantT: 0,
    fuseT: 0,
    defuseT: 0,
    defuser: null,
    beepT: 0,
  };

  function reset(carrier) {
    spike.status = 'carried';
    spike.carrier = carrier;
    spike.site = null;
    spike.plantT = 0;
    spike.fuseT = 0;
    spike.defuseT = 0;
    spike.defuser = null;
    spike.beepT = 0;
    group.visible = false;
  }

  function drop(pos) {
    spike.status = 'dropped';
    spike.carrier = null;
    spike.pos.copy(pos);
    spike.pos.y = 0.12;
    group.position.copy(spike.pos);
    group.visible = true;
  }

  function plant(site, pos) {
    spike.status = 'planted';
    spike.site = site;
    spike.pos.copy(pos);
    spike.pos.y = 0.12;
    spike.fuseT = FUSE_SECONDS;
    spike.defuseT = 0;
    spike.defuser = null;
    spike.beepT = 0;
    group.position.copy(spike.pos);
    group.visible = true;
  }

  return {
    spike,
    reset,
    drop,
    plant,
    plantSeconds: PLANT_SECONDS,
    defuseSeconds: DEFUSE_SECONDS,
    step(dt, onExplode, onBeep) {
      if (spike.status !== 'planted') return;
      spike.fuseT -= dt;
      spike.beepT -= dt;
      const interval = spike.fuseT > 20 ? 1.0 : spike.fuseT > 10 ? 0.55 : 0.3;
      if (spike.beepT <= 0) {
        spike.beepT = interval;
        onBeep(spike.fuseT <= 10);
      }
      light.material.color.setHex(Math.sin(spike.fuseT * 10) > 0 ? 0xffffff : 0xd84a3a);
      if (spike.fuseT <= 0) {
        spike.status = 'exploded';
        group.visible = false;
        onExplode(spike.pos.clone());
      }
    },
  };
}
