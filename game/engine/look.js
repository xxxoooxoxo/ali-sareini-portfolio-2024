// The shared look: low internal resolution, display-space colour, small generated textures, gradient skies.
// Every chapter builds on these, so the whole game stays in one style.
import * as THREE from 'three';

// Colours are worked in display space with no linear conversion, the way a 2004 console did it.
THREE.ColorManagement.enabled = false;

// Low internal resolution, close to a PS2's 480 lines turned on its side. The browser scales it to the
// page with smoothing, which gives the soft image.
export const RENDER_W = 480, RENDER_H = 854;

export const rgb = (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255);
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const hash = (x, y, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Value noise that tiles after px cells across and py cells down.
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const mx = (a) => ((a % px) + px) % px, my = (a) => ((a % py) + py) % py;
  const a = hash(mx(xi), my(yi), s), b = hash(mx(xi + 1), my(yi), s);
  const c = hash(mx(xi), my(yi + 1), s), d = hash(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(u, v, px, py, s, octaves = 3) {
  let total = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    total += amp * vnoise(u * px * f, v * py * f, px * f, py * f, s + i * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return total / norm;
}
export const interp = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
};

export function makeRenderer(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(RENDER_W, RENDER_H, false);
  stage.appendChild(renderer.domElement);
  return renderer;
}

// ---------- textures: small, blurry, generated ----------
function finish(tex, rx = 1, ry = 1) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
// fn(x, y, u, v) returns [r, g, b] for each pixel.
export function pixelTex(w, h, fn, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y, x / w, y / h), o = (y * w + x) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return finish(new THREE.CanvasTexture(c), rx, ry);
}
// draw(g, w, h) paints with the 2D canvas API.
export function drawTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return finish(new THREE.CanvasTexture(c), rx, ry);
}
// The same image with a different repeat count.
export const reuse = (tex, rx, ry) => { const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };

// ---------- sky and light ----------
// One smooth gradient from the horizon up. stops: [[degrees above the horizon, [r, g, b]], ...]
export function makeSky(stops, radius = 3000) {
  const geo = new THREE.SphereGeometry(radius, 16, 64);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const deg = Math.asin(clamp(p.getY(i) / radius, -1, 1)) * 180 / Math.PI;
    for (let k = 0; k < 3; k++) col[i * 3 + k] = interp(stops.map(([d, c]) => [d, c[k]]), deg) / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  return sky;
}

// Flat, mostly ambient light. Colours are the share of full brightness each light adds, as [r, g, b] out of 255.
export function addLight(scene, ambient, sun, towardSun) {
  scene.add(new THREE.AmbientLight(rgb(...ambient), Math.PI));
  const light = new THREE.DirectionalLight(rgb(...sun), Math.PI);
  light.position.fromArray(towardSun);
  scene.add(light);
}
