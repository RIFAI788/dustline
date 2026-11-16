// Top-down minimap on a 2D canvas: walls, sites, the player arrow, teammates,
// and enemies only when the player can see them or they just fired.
export function createMinimap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const scaleX = W / (world.bounds.maxX - world.bounds.minX);
  const scaleZ = H / (world.bounds.maxZ - world.bounds.minZ);
  const toX = (x) => (x - world.bounds.minX) * scaleX;
  const toZ = (z) => (z - world.bounds.minZ) * scaleZ;

  function draw(state) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20, 22, 26, 0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5d564c';
    for (const collider of world.colliders) {
      const w = (collider.max.x - collider.min.x) * scaleX;
      const h = (collider.max.z - collider.min.z) * scaleZ;
      if (w < 1 || h < 1) continue;
      if (collider.max.y < 1.5) continue;
      ctx.fillRect(toX(collider.min.x), toZ(collider.min.z), Math.max(1, w), Math.max(1, h));
    }
    for (const [key, site] of Object.entries(world.sites)) {
      ctx.beginPath();
      ctx.arc(toX(site.center.x), toZ(site.center.z), site.radius * scaleX, 0, Math.PI * 2);
      ctx.strokeStyle = key === 'A' ? '#35c4b5' : '#e8a13a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = key === 'A' ? '#35c4b5' : '#e8a13a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, toX(site.center.x), toZ(site.center.z));
    }
    const spike = state.spike;
    if (spike.status === 'planted' || spike.status === 'dropped') {
      const blink = Math.sin(state.time * 8) > 0;
      ctx.fillStyle = blink ? '#d84a3a' : '#f2ede4';
      ctx.beginPath();
      ctx.arc(toX(spike.pos.x), toZ(spike.pos.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bot of state.bots) {
      if (!bot.alive) continue;
      const visible = bot.team === 'van' || state.visibleEnemies.has(bot.id);
      if (!visible) continue;
      ctx.fillStyle = bot.team === 'van' ? '#35c4b5' : '#e8a13a';
      ctx.beginPath();
      ctx.arc(toX(bot.mover.state.position.x), toZ(bot.mover.state.position.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.playerAlive) {
      const p = state.playerPos;
      const x = toX(p.x);
      const z = toZ(p.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-state.playerYaw);
      ctx.fillStyle = '#f2ede4';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  return { draw };
}
