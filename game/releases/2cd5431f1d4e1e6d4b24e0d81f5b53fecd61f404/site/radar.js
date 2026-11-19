// North is -Z. The radar uses the same walls, posts and fence as the player.
// The exit stays on the rim when it is beyond the map's range.
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{rects: number[][], circles: number[][], fence?: ((x:number,z:number)=>boolean)|null,
 *   interactions: {x:number,z:number,label:string|null,kind?:string}[], exit: {x:number,z:number}|null}} world
 * @param {{pos:{x:number,z:number},heading:number}} player
 * @param {number} range
 */
export function drawRadar(canvas, world, player, range) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const half = canvas.width / 2, radius = half - 2, scale = radius / range;
  const { x, z } = player.pos;
  g.save();
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.translate(half, half);
  g.beginPath(); g.arc(0, 0, radius, 0, 2 * Math.PI); g.clip();
  g.fillStyle = '#354741'; g.fillRect(-half, -half, canvas.width, canvas.height);
  const tile = range < 20 ? 4 : 8;
  for (let tx = Math.floor((x - range) / tile) * tile; tx < x + range; tx += tile) {
    for (let tz = Math.floor((z - range) / tile) * tile; tz < z + range; tz += tile) {
      const cx = (tx - x) * scale, cz = (tz - z) * scale;
      if (world.fence?.(tx + tile / 2, tz + tile / 2)) {
        g.fillStyle = '#223236'; g.fillRect(cx, cz, tile * scale, tile * scale);
      }
      g.strokeStyle = '#53625a'; g.lineWidth = .7; g.strokeRect(cx, cz, tile * scale, tile * scale);
    }
  }
  g.fillStyle = '#7c8271'; g.strokeStyle = '#a2a48a'; g.lineWidth = .7;
  for (const [x0, x1, z0, z1] of world.rects) {
    if (x1 < x-range || x0 > x+range || z1 < z-range || z0 > z+range) continue;
    const left = (x0-x)*scale, top = (z0-z)*scale, w = (x1-x0)*scale, h = (z1-z0)*scale;
    g.fillRect(left, top, w, h); g.strokeRect(left, top, w, h);
  }
  g.fillStyle = '#667365'; g.beginPath();
  for (const [cx, cz, r] of world.circles) {
    if (r < .45 || Math.abs(cx-x) > range+r || Math.abs(cz-z) > range+r) continue;
    g.moveTo((cx-x+r)*scale, (cz-z)*scale);
    g.arc((cx-x)*scale, (cz-z)*scale, r*scale, 0, Math.PI*2);
  }
  g.fill();
  g.lineWidth = 1.8; g.strokeStyle = '#162326';
  for (const action of world.interactions) {
    if (!action.label || Math.hypot(action.x-x, action.z-z) > range) continue;
    if (action.kind === 'radio') {
      const px = Math.round((action.x-x)*scale), py = Math.round((action.z-z)*scale);
      g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.lineWidth = 2;
      g.strokeText('♪',px,py+4); g.fillStyle = '#ffcd82'; g.fillText('♪',px,py+4);
      continue;
    }
    g.beginPath(); g.arc((action.x-x)*scale, (action.z-z)*scale, 3.3, 0, Math.PI*2);
    g.fillStyle = '#a4efe1'; g.fill(); g.stroke();
  }
  if (world.exit) {
    const dx = (world.exit.x-x)*scale, dz = (world.exit.z-z)*scale;
    const fit = Math.min(1, (radius-7) / (Math.hypot(dx,dz) || 1));
    g.save(); g.translate(dx*fit, dz*fit); g.rotate(Math.PI/4);
    g.fillStyle = '#ffd675'; g.fillRect(-3.6,-3.6,7.2,7.2); g.strokeRect(-3.6,-3.6,7.2,7.2); g.restore();
  }
  g.rotate(-player.heading);
  g.beginPath(); g.moveTo(0,8); g.lineTo(-5,-5); g.lineTo(0,-2); g.lineTo(5,-5); g.closePath();
  g.fillStyle = '#fffae5'; g.fill(); g.stroke(); g.restore();
}
