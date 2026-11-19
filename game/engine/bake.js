// Painted light and shade. Games of that era had no real-time lighting to speak of: the glow up a floodlit wall,
// the pool under a lamp, the dark band under a cornice and the grime where a wall meets the ground were all drawn in.
// Queue pieces with the methods below, then call build() once. Everything is merged into four draw calls.
import * as THREE from 'three';
import { drawTex } from 'life/engine/look.js';

const strip = () => ({ pos: [], uv: [], col: [], idx: [] });
function quad(s, corners, colour) { // corners: near-left, near-right, far-right, far-left. "Near" is the strong edge.
  const n = s.pos.length / 3;
  for (const c of corners) s.pos.push(...c);
  s.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  for (let i = 0; i < 4; i++) s.col.push(...colour);
  s.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
}
const unit = (c, k = 1) => [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k, 1];

export class Bake {
  constructor(world) { this.world = world; this.parts = { lightFade: strip(), lightRound: strip(), darkFade: strip(), darkRound: strip() }; }

  // Light washing up a wall from its foot, as from a floodlight or a lamp. The wall runs from (x0, z0) to (x1, z1),
  // starting at height y, and the light fades out `height` above that. down=true hangs the light from the top instead.
  wash(x0, z0, x1, z1, y, height, colour, strength = 1, down = false) {
    const a = down ? y + height : y, b = down ? y : y + height;
    quad(this.parts.lightFade, [[x0, a, z0], [x1, a, z1], [x1, b, z1], [x0, b, z0]], unit(colour, strength));
  }

  // Shade on a wall: under an eave or balcony (down=true, darkest at the top), or dirt rising from the ground.
  shade(x0, z0, x1, z1, y, height, strength = 0.5, down = false) {
    const a = down ? y + height : y, b = down ? y : y + height;
    quad(this.parts.darkFade, [[x0, a, z0], [x1, a, z1], [x1, b, z1], [x0, b, z0]], [0, 0, 0, strength]);
  }

  // A pool of light on the ground under a lamp.
  pool(x, z, radius, colour, strength = 1, y = this.world.ground(x, z) + 0.05) {
    quad(this.parts.lightRound, [[x - radius, y, z + radius], [x + radius, y, z + radius], [x + radius, y, z - radius], [x - radius, y, z - radius]], unit(colour, strength));
  }

  // A soft round shadow on the ground, for anything that stands on it. rx and rz let it be an ellipse.
  shadow(x, z, rx, strength = 0.4, rz = rx, y = this.world.ground(x, z) + 0.04) {
    quad(this.parts.darkRound, [[x - rx, y, z + rz], [x + rx, y, z + rz], [x + rx, y, z - rz], [x - rx, y, z - rz]], [0, 0, 0, strength]);
  }

  // The dark band on the ground where a wall meets it. `out` is how far it reaches; its sign picks the side of the wall.
  contact(x0, z0, x1, z1, out = 1.2, strength = 0.45, y = null) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, nx = (-dz / len) * out, nz = (dx / len) * out;
    const h = y ?? this.world.ground((x0 + x1) / 2 + nx * 0.5, (z0 + z1) / 2 + nz * 0.5) + 0.04;
    quad(this.parts.darkFade, [[x0, h, z0], [x1, h, z1], [x1 + nx, h, z1 + nz], [x0 + nx, h, z0 + nz]], [0, 0, 0, strength]);
  }

  // Light and shade all round a box-shaped building: a contact band at its foot, shade under its eaves,
  // and, when `flood` is a colour, floodlight up every wall.
  building(x0, x1, z0, z1, height, { y = 0, flood = null, floodHeight = height * 0.8, floodStrength = 0.55, eave = 1.6, eaveStrength = 0.4, contact = 1.4 } = {}) {
    const e = 0.03, walls = [[x0, z1 + e, x1, z1 + e], [x1 + e, z1, x1 + e, z0], [x1, z0 - e, x0, z0 - e], [x0 - e, z0, x0 - e, z1]];
    for (const [ax, az, bx, bz] of walls) {
      if (flood) this.wash(ax, az, bx, bz, y, floodHeight, flood, floodStrength);
      if (eave) this.shade(ax, az, bx, bz, y + height - eave, eave, eaveStrength, true);
      if (contact) this.contact(ax, az, bx, bz, contact, 0.4, y + 0.04);
    }
  }

  build() {
    const fade = drawTex(8, 64, (g) => { const d = g.createLinearGradient(0, 64, 0, 0); d.addColorStop(0, '#fff'); d.addColorStop(0.5, '#555'); d.addColorStop(1, '#000'); g.fillStyle = d; g.fillRect(0, 0, 8, 64); });
    const round = drawTex(64, 64, (g) => { const d = g.createRadialGradient(32, 32, 1, 32, 32, 32); d.addColorStop(0, '#fff'); d.addColorStop(0.45, '#666'); d.addColorStop(1, '#000'); g.fillStyle = d; g.fillRect(0, 0, 64, 64); });
    for (const t of [fade, round]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const common = { vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const light = (map) => new THREE.MeshBasicMaterial({ ...common, map, blending: THREE.AdditiveBlending, fog: false });
    const dark = (alphaMap) => new THREE.MeshBasicMaterial({ ...common, alphaMap });
    const mats = { lightFade: light(fade), lightRound: light(round), darkFade: dark(fade), darkRound: dark(round) };
    for (const [name, s] of Object.entries(this.parts)) {
      if (!s.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 4));
      geo.setIndex(s.idx);
      const mesh = new THREE.Mesh(geo, mats[name]);
      mesh.frustumCulled = false; mesh.renderOrder = name.startsWith('dark') ? 1 : 2;
      this.world.scene.add(mesh);
    }
  }
}
