// Trees built the way the reference draws them: a thick, bent, barked trunk that splits into a few heavy limbs,
// and a crown of leaf cards with ragged pixel edges, dark underneath and lighter on the sunlit top.
//   const trees = new Trees(world, { bark: [96, 66, 44], sun: [-0.6, 0.5, 0.6], snow: null, leaf: 1 });
//   leaf: the size of one painted leaf. 1 is fine and crisp; 1.6 to 2 gives broader, softer clumps.
//   trees.broadleaf(x, z, height, [r, g, b], { spread: 1, detail: 1, solid: false });   // a leafy tree
//   trees.conifer(x, z, height, [r, g, b], { snow: null, detail: 1, solid: false });    // a pine or spruce
//   trees.bare(x, z, height, [r, g, b], { solid: false });                               // a winter tree; colour is the twigs
//   trees.build({ shadow: 0.4 });                                                         // once, after placing them all
// colour is the leaf colour as it looks in the scene's light. detail (0 to 1) thins trees that are only seen far away.
// solid makes the trunk an obstacle. snow (a colour) lays snow on boughs and on the limbs of bare trees.
import * as THREE from 'three';
import { rgb, clamp, hash, fbm, pixelTex, drawTex } from './look.js';

const UP = new THREE.Vector3(0, 1, 0);
const aim = (a, tilt) => new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));

// One cluster of foliage: three upright cards in a star and one lying flat, each showing a different
// quarter of a 2 by 2 sheet, so no two cards of a cluster look alike and it has body from every side.
function clusterGeometry() {
  const p = [], uv = [], idx = [];
  const quad = (a, b, cell) => { // a and b are the card's two half-axes
    const n = p.length / 3, u0 = (cell % 2) * 0.5, v0 = (cell >> 1) * 0.5;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.push(a[0] * s + b[0] * t, a[1] * s + b[1] * t, a[2] * s + b[2] * t);
    uv.push(u0, v0, u0 + 0.5, v0, u0 + 0.5, v0 + 0.5, u0, v0 + 0.5); idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3 + 0.2; quad([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0, 0.5, 0], k); }
  quad([0.5, 0, 0], [0, 0.08, 0.5], 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Foliage sheets are drawn white-to-grey with their shape in the alpha channel, and tinted per cluster.
function sheet(draw) {
  const tex = drawTex(256, 256, (g) => { g.clearRect(0, 0, 256, 256); for (let cell = 0; cell < 4; cell++) { g.save(); g.translate((cell % 2) * 128, (cell >> 1) * 128); g.beginPath(); g.rect(0, 0, 128, 128); g.clip(); draw(g, cell); g.restore(); } });
  tex.magFilter = THREE.NearestFilter;          // chunky pixel edges, as in the reference
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;   // crowns keep their bulk in the distance
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
const grey = (k, warm = 0) => `rgb(${Math.round(clamp(k * (1 + warm * 0.08)) * 255)},${Math.round(clamp(k) * 255)},${Math.round(clamp(k * (1 - warm * 0.2)) * 255)})`;

// A mass of single leaves, as the reference crowns show them: deep shade inside, mid-toned leaves over it, and lit
// leaves gathered into clumps where the light reaches. The rim is ragged and has holes, so sky shows through a crown.
function leafSheet(leaf = 1) {
  return sheet((g, cell) => {
    const s = 11 + cell * 7, lumps = [];
    for (let i = 0; i < 9; i++) lumps.push([64 + (hash(i, 1, s) - 0.5) * 78, 64 + (hash(i, 2, s) - 0.5) * 70, 13 + hash(i, 3, s) * 15]);
    const inside = (x, y, shrink = 0) => lumps.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < (r - shrink) ** 2);
    const clump = (x, y) => fbm(x / 128, y / 128, 5, 5, s, 2);   // where the light catches the mass
    for (const [shade, full, shrink, layer] of [[0.16, 1500, 0, 1], [0.36, 1200, 1, 2], [0.62, 800, 3, 3], [1.0, 520, 5, 4]]) {
      const count = Math.round(full / (leaf * leaf));   // bigger leaves, fewer of them
      for (let n = 0; n < count; n++) {
        const x = 4 + hash(n, layer, s) * 120, y = 4 + hash(n, layer + 10, s) * 120;
        if (!inside(x, y, shrink)) continue;
        if (layer === 3 && clump(x, y) < 0.44) continue;
        // lit leaves sit in the clumps and gather toward the top of the mass, where the light falls
        if (layer === 4 && (clump(x, y) < 0.52 || hash(n, 30, s) < (y - 34) / 100)) continue;
        g.fillStyle = grey(shade * (0.8 + 0.4 * hash(n, layer + 20, s)), hash(n, layer + 40, s) - 0.3);
        g.beginPath(); g.ellipse(x, y, (1.7 + hash(n, layer + 50, s) * 1.5) * leaf, (1.1 + hash(n, layer + 60, s) * 0.9) * leaf, hash(n, layer + 70, s) * 3.14, 0, 6.3); g.fill();
      }
    }
    // Holes, most of them toward the rim.
    g.globalCompositeOperation = 'destination-out';
    for (let n = 0; n < 46; n++) {
      const a = hash(n, 81, s) * 6.283, d = 16 + Math.sqrt(hash(n, 82, s)) * 44;
      g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + hash(n, 83, s) * 3.5, 1.5 + hash(n, 84, s) * 3, hash(n, 85, s) * 3.14, 0, 6.3); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  });
}

// A conifer bough seen from the side: a drooping spine with needles fanning off it, paler at the tips.
function needleSheet() {
  return sheet((g, cell) => {
    const s = 5 + cell * 3;
    for (let b = 0; b < 6; b++) {
      const a = (b - 2.5) * 0.44 + (hash(b, 1, s) - 0.5) * 0.3, len = 40 + hash(b, 2, s) * 18;
      const at = (k) => [64 + Math.sin(a) * k, 78 - Math.cos(a) * k * 0.75 + (Math.abs(a) * 18 * k) / len];
      g.strokeStyle = grey(0.4); g.lineWidth = 5; g.beginPath(); g.moveTo(64, 78); g.lineTo(...at(len)); g.stroke();
      for (let k = 3; k < len; k += 2.2) {
        const [x, y] = at(k);
        g.strokeStyle = grey(0.5 + 0.5 * hash(b * 40 + k, 3, s)); g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(x - 8, y + 6.5); g.lineTo(x, y); g.lineTo(x + 8, y + 6.5); g.stroke();
      }
    }
  });
}

// Fine bare twigs: thin lines that keep forking.
function twigSheet() {
  return sheet((g, cell) => {
    const s = 3 + cell * 13; g.lineCap = 'round';
    const limb = (x, y, a, len, w, depth, id) => {
      const bend = (hash(id, 9, s) - 0.5) * 0.5, mx = x + Math.sin(a) * len * 0.5, my = y - Math.cos(a) * len * 0.5;
      const x2 = mx + Math.sin(a + bend) * len * 0.5, y2 = my - Math.cos(a + bend) * len * 0.5;
      g.strokeStyle = grey(0.26 + 0.2 * hash(id, 8, s)); g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(mx, my); g.lineTo(x2, y2); g.stroke();
      if (!depth) return;
      const kids = depth > 2 ? 3 : 2;
      for (let k = 0; k < kids; k++) limb(x2, y2, a + bend + (k - (kids - 1) / 2) * 0.62 + (hash(id, k, s) - 0.5) * 0.55, len * (0.62 + 0.2 * hash(id, k + 4, s)), Math.max(1.7, w * 0.7), depth - 1, id * 3 + k + 1);
      if (depth > 1) limb(mx, my, a + (hash(id, 6, s) > 0.5 ? 0.9 : -0.9), len * 0.5, Math.max(1.7, w * 0.6), depth - 2, id * 7 + 5);
    };
    for (const [x0, a0] of [[46, -0.42], [64, 0.02], [82, 0.42]]) limb(x0, 126, a0, 32, 4, 3, x0 + cell);
  });
}

// Clumps of snow lying on boughs: soft lumps, brighter on top.
function snowSheet() {
  return sheet((g, cell) => {
    const s = 21 + cell * 5;
    for (let i = 0; i < 46; i++) {
      const a = hash(i, 1, s) * 6.283, d = Math.sqrt(hash(i, 2, s)) * 44, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.8;
      g.fillStyle = grey(0.72 + 0.28 * (1 - y / 128) + 0.1 * hash(i, 5, s));
      g.beginPath(); g.ellipse(x, y, 7 + hash(i, 3, s) * 9, 5 + hash(i, 4, s) * 6, 0, 0, 6.3); g.fill();
    }
  });
}
const SHEETS = { leaf: leafSheet, needle: needleSheet, twig: twigSheet, snow: snowSheet };

export class Trees {
  // bark: the trunk colour. sun: the direction toward the light, so crowns are brighter on that side.
  // snow: a colour, if snow lies on the limbs of leafless trees.
  constructor(world, { bark = [96, 66, 44], sun = [-0.6, 0.5, 0.6], snow = null, leaf = 1 } = {}) {
    this.world = world;
    this.sun = new THREE.Vector3(...sun).normalize();
    this.bark = bark; this.snow = snow; this.snowLimbs = []; this.leaf = leaf;
    this.limbs = []; this.clusters = { leaf: [], needle: [], twig: [], snow: [] }; this.shadows = [];
  }

  // One straight, slightly tapered piece of wood.
  #segment(from, dir, length, radius, snowy) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    this.limbs.push(new THREE.Matrix4().compose(from, q, new THREE.Vector3(radius, length, radius)));
    // Snow lies along the upper side of a limb that leans: a second, flatter piece set just above it.
    if (snowy && this.snow && dir.y < 0.9) this.snowLimbs.push(new THREE.Matrix4().compose(from.clone().add(new THREE.Vector3(0, radius * 0.7, 0)), q, new THREE.Vector3(radius * 0.85, length, radius * 0.85)));
  }

  // A limb that bends as it grows: a chain of pieces, each turned a little from the last and a little thinner.
  // Returns the points along it, its tip, and the direction and thickness it ends with.
  #branch(from, dir, length, radius, id, { pieces = 3, bend = 0.3, lift = 0.1, taper = 0.62, snowy = false } = {}) {
    const nodes = [from.clone()], at = from.clone(), d = dir.clone().normalize(), step = length / pieces;
    for (let i = 0; i < pieces; i++) {
      const r = radius * (1 - (1 - taper) * (i / pieces));
      this.#segment(at.clone().addScaledVector(d, -r * 0.35), d, step + r * 0.35, r, snowy);   // overlap hides the joint
      at.addScaledVector(d, step); nodes.push(at.clone());
      d.x += (hash(id, i, 31) - 0.5) * bend; d.z += (hash(id, i, 37) - 0.5) * bend; d.y += lift + (hash(id, i, 41) - 0.5) * bend * 0.5;
      d.normalize();
    }
    return { nodes, end: at, dir: d, radius: radius * taper };
  }

  #cluster(kind, at, size, colour, shade, id, squash = kind === 'leaf' ? 0.78 : 1) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(id, 11, 5) - 0.5) * 0.7, hash(id, 12, 5) * 6.283, (hash(id, 13, 5) - 0.5) * 0.7));
    const k = shade * (0.78 + 0.44 * hash(id, 14, 5)), flip = hash(id, 15, 5) > 0.5 ? -1 : 1;   // patchy: neighbours differ in tone
    this.clusters[kind].push({ matrix: new THREE.Matrix4().compose(at, q, new THREE.Vector3(size * flip, size * squash, size)), colour: rgb(colour[0] * k, colour[1] * k, colour[2] * k) });
  }

  // A leafy tree with a rounded crown.
  broadleaf(x, z, height, colour, { spread = 1, detail = 1, solid = false } = {}) {
    const y = this.world.ground(x, z), id = Math.round(x * 31 + z * 17), r0 = height * 0.022 + 0.12, full = detail > 0.7;
    if (solid) this.world.post(x, z, r0 + 0.2);
    const base = new THREE.Vector3(x, y - 0.15, z);
    const lean = new THREE.Vector3((hash(id, 1, 7) - 0.5) * 0.3, 1, (hash(id, 2, 7) - 0.5) * 0.3).normalize();
    this.#segment(base, UP, 0.5, r0 * 1.3);                                             // the flare at the foot
    const trunk = this.#branch(base, lean, height * 0.44 + 0.15, r0, id, { pieces: full ? 4 : 2, bend: 0.2, lift: 0.06, taper: 0.72 });
    // Heavy limbs leave the trunk at different heights and bend up into the crown.
    const limbs = full ? 4 : 2, ends = [];
    for (let j = 0; j < limbs; j++) {
      const from = trunk.nodes[trunk.nodes.length - 1 - (j % 2)], a = j * 2.2 + hash(id, j, 1) * 1.4, tilt = 0.7 + hash(id, j, 2) * 0.45;
      ends.push(this.#branch(from, aim(a, tilt), height * (0.26 + 0.14 * hash(id, j, 3)), trunk.radius * (0.62 + 0.2 * hash(id, j, 4)), id * 7 + j, { pieces: 3, bend: 0.35, lift: 0.2 }).end);
    }
    ends.push(this.#branch(trunk.end, trunk.dir, height * 0.26, trunk.radius * 0.8, id * 7 + 9, { pieces: 2, bend: 0.3, lift: 0.1 }).end);
    const rw = height * 0.37 * spread, rh = height * 0.3, cx = trunk.end.x, cz = trunk.end.z, cy = y + height * 0.71, count = Math.round(46 * detail);
    this.shadows.push([x, y, z, rw * 1.25]);
    for (let i = 0; i < count; i++) {
      // Spread the clusters evenly over the crown and leave the underside open.
      const v = -0.36 + 1.36 * ((i + 0.5) / count), ring = Math.sqrt(1 - v * v), a = i * 2.39996 + hash(id, i, 3);
      const reach = 0.78 + hash(id, i, 4) * 0.26, dir = new THREE.Vector3(ring * Math.cos(a), v, ring * Math.sin(a));
      const at = new THREE.Vector3(cx + dir.x * rw * reach, cy + dir.y * rh * reach, cz + dir.z * rw * reach);
      const shade = 0.44 + 0.52 * ((v + 0.36) / 1.36) + 0.42 * Math.max(0, dir.dot(this.sun));
      this.#cluster('leaf', at, rw * (0.66 + hash(id, i, 6) * 0.34), colour, shade, id * 53 + i);
    }
    // Dark masses inside the crown, so the sky does not show through its middle, and a tuft where each limb ends.
    for (let i = 0; i < (full ? 5 : 2); i++) {
      const a = i * 1.9 + hash(id, i, 8), at = new THREE.Vector3(cx + Math.cos(a) * rw * 0.3, cy + (hash(id, i, 9) - 0.35) * rh * 0.7, cz + Math.sin(a) * rw * 0.3);
      this.#cluster('leaf', at, rw * 1.15, colour, 0.3, id * 59 + i);
    }
    ends.forEach((end, i) => this.#cluster('leaf', end, rw * 0.8, colour, 0.5, id * 61 + i));
  }

  // A pine or spruce: tiers of drooping boughs. snow, if given, is the colour of snow lying on them.
  conifer(x, z, height, colour, { snow = null, detail = 1, solid = false } = {}) {
    const y = this.world.ground(x, z), id = Math.round(x * 31 + z * 17), r0 = height * 0.022 + 0.07;
    if (solid) this.world.post(x, z, r0 + 0.25);
    this.#branch(new THREE.Vector3(x, y - 0.1, z), UP, height * 0.92, r0, id, { pieces: 3, bend: 0.03, lift: 0.2, taper: 0.3 });
    this.shadows.push([x, y, z, height * 0.3]);
    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1), ty = y + height * (0.17 + 0.75 * f), reach = height * 0.25 * (1 - 0.8 * f) + 0.12, n = Math.max(3, Math.round((8 - 4.5 * f) * detail));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * 6.283 + t * 0.9 + hash(id, t * 9 + j, 1) * 0.4, at = new THREE.Vector3(x + Math.cos(a) * reach * 0.55, ty - reach * 0.28, z + Math.sin(a) * reach * 0.55);
        this.#cluster('needle', at, reach * 1.8, colour, 0.62 + 0.42 * f + 0.14 * Math.max(0, Math.cos(a) * this.sun.x + Math.sin(a) * this.sun.z), id * 53 + t * 9 + j);
        if (snow && j % 2 === 0) this.#cluster('snow', at.clone().add(new THREE.Vector3(0, reach * 0.3, 0)), reach * 1.05, snow, 0.86 + 0.14 * f, id * 71 + t * 9 + j);
      }
    }
    this.#cluster('needle', new THREE.Vector3(x, y + height * 0.95, z), height * 0.13, colour, 1.05, id * 53 + 99);
    if (snow) this.#cluster('snow', new THREE.Vector3(x, y + height * 0.98, z), height * 0.07, snow, 1, id * 71 + 99);
  }

  // A tree with no leaves: a bent trunk, limbs that leave it at different heights and keep forking, and fine twigs at the ends.
  bare(x, z, height, colour, { solid = false } = {}) {
    const y = this.world.ground(x, z), id = Math.round(x * 31 + z * 17), r0 = height * 0.02 + 0.1;
    if (solid) this.world.post(x, z, r0 + 0.2);
    this.shadows.push([x, y, z, height * 0.2]);
    const base = new THREE.Vector3(x, y - 0.15, z);
    const lean = new THREE.Vector3((hash(id, 1, 7) - 0.5) * 0.28, 1, (hash(id, 2, 7) - 0.5) * 0.28).normalize();
    this.#segment(base, UP, 0.45, r0 * 1.3);
    const trunk = this.#branch(base, lean, height * 0.4 + 0.15, r0, id, { pieces: 4, bend: 0.2, lift: 0.05, taper: 0.7 });
    const grow = (from, dir, length, radius, depth, gid) => {
      const b = this.#branch(from, dir, length, radius, gid, { pieces: depth ? 3 : 2, bend: 0.42, lift: 0.14, taper: 0.6, snowy: depth > 0 });
      if (!depth) {
        const size = height * (0.24 + 0.1 * hash(gid, 5, 9)), at = b.end.clone().addScaledVector(b.dir, height * 0.05);
        this.#cluster('twig', at, size, colour, 1, gid);
        return;
      }
      const kids = depth > 1 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        // each child turns away from its parent by a different amount, and the odd one leaves from part-way along
        const side = new THREE.Vector3(hash(gid, k, 11) - 0.5, (hash(gid, k, 13) - 0.3) * 0.7, hash(gid, k, 17) - 0.5).normalize();
        const d = b.dir.clone().addScaledVector(side, 0.55 + 0.5 * hash(gid, k, 19)).normalize();
        grow(k === kids - 1 ? b.nodes[b.nodes.length - 2] : b.end, d, length * (0.58 + 0.2 * hash(gid, k, 23)), b.radius * (k ? 0.72 : 0.9), depth - 1, gid * 5 + k + 1);
      }
    };
    for (let j = 0; j < 5; j++) {
      const from = trunk.nodes[trunk.nodes.length - 1 - (j % 3 === 2 ? 1 : 0)], a = j * 2.4 + hash(id, j, 1) * 1.1, tilt = 0.55 + hash(id, j, 2) * 0.5;
      grow(from, aim(a, tilt), height * (0.2 + 0.1 * hash(id, j, 3)), trunk.radius * (0.55 + 0.2 * hash(id, j, 4)), 2, id * 11 + j);
    }
    grow(trunk.end, trunk.dir, height * 0.24, trunk.radius * 0.85, 2, id * 11 + 7);   // the leader carries on up
  }

  // shadow: how dark the patch of shade painted under each tree is, from 0 (none) to 1.
  build({ shadow = 0.4 } = {}) {
    const { scene } = this.world;
    if (shadow && this.shadows.length) {
      const soft = drawTex(32, 32, (g) => { const d = g.createRadialGradient(16, 16, 3, 16, 16, 16); d.addColorStop(0, '#fff'); d.addColorStop(0.6, '#999'); d.addColorStop(1, '#000'); g.fillStyle = d; g.fillRect(0, 0, 32, 32); });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: soft, transparent: true, opacity: shadow, depthWrite: false }), this.shadows.length);
      this.shadows.forEach(([x, y, z, r], i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.05, z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r))));
      mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
    }
    if (this.limbs.length) {
      // Bark: deep vertical furrows, paler ridges, and the odd knot.
      const barkTex = pixelTex(64, 128, (x, y, u, v) => {
        const ridge = fbm(u, v, 10, 2, 61), furrow = fbm(u + 0.37, v, 22, 3, 67), knot = fbm(u, v, 3, 5, 71);
        const s = clamp(92 + 150 * ridge - 90 * Math.max(0, furrow - 0.52) * 3 - (knot > 0.74 ? 45 : 0) + (hash(x, y, 3) - 0.5) * 26, 30, 255);
        return [s, s * 0.97, s * 0.92];
      });
      barkTex.repeat.set(2, 2);
      const geo = new THREE.CylinderGeometry(0.86, 1, 1, 7, 1, true).translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: barkTex, color: rgb(...this.bark.map((c) => c * 1.35)) }), this.limbs.length);
      this.limbs.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.frustumCulled = false; scene.add(mesh);
      if (this.snowLimbs.length) {
        const white = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: rgb(...this.snow) }), this.snowLimbs.length);
        this.snowLimbs.forEach((m, i) => white.setMatrixAt(i, m));
        white.frustumCulled = false; scene.add(white);
      }
    }
    const geo = clusterGeometry();
    for (const kind of ['leaf', 'needle', 'twig', 'snow']) {
      const list = this.clusters[kind];
      if (!list.length) continue;
      const mat = new THREE.MeshBasicMaterial({ map: SHEETS[kind](this.leaf), alphaTest: kind === 'twig' ? 0.3 : 0.45, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(({ matrix, colour }, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colour); });
      mesh.frustumCulled = false; scene.add(mesh);
    }
  }
}
