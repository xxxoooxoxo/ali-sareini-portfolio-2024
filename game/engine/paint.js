// Painters for building textures: brick walls, windows, doors. Shared by the chapters.
import { hash, drawTex } from 'life/engine/look.js';

export const CREAM = '#ece6d6', GLASS = '#2c3038', LAMPLIGHT = 'rgb(255,188,104)';

export function bricks(g, w, h, base = [172, 84, 58], mortar = 'rgb(196,170,150)') {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  for (let row = 0; row * 4 < h; row++) for (let col = -1; col * 8 < w; col++) {
    const n = 0.8 + 0.4 * hash(col, row, 7);
    g.fillStyle = `rgb(${base.map((c) => Math.round(c * n)).join(',')})`;
    g.fillRect(col * 8 + (row % 2) * 4 + 1, row * 4 + 1, 7, 3);
  }
}

// A window with a white frame and a cross of glazing bars.
export function pane(g, x, y, w, h, glass = GLASS) {
  g.fillStyle = CREAM; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = glass; g.fillRect(x, y, w, h);
  g.fillStyle = CREAM; g.fillRect(x + w / 2 - 0.5, y, 1, h); g.fillRect(x, y + h / 2 - 0.5, w, 1);
}

export function door(g, x, y, w, h, colour = '#1e2c26') {
  g.fillStyle = CREAM; g.fillRect(x - 3, y - 3, w + 6, h + 3);
  g.fillStyle = colour; g.fillRect(x, y, w, h);
}

// A brick wall drawn at twice the scale of its doors and windows, so the bricks stay small.
export const facade = (w, h, draw, base, mortar) => drawTex(w * 2, h * 2, (g) => { bricks(g, w * 2, h * 2, base, mortar); g.scale(2, 2); draw(g); });

// A wall for night scenes, as a pair of textures: the wall itself, and a second one that holds only the
// windows with a light on, for the material's glow. draw(g, win, glow) places windows with win(x, y, w, h)
// and should skip its other painting when glow is true. `share` is the fraction of windows that are lit.
export function litFacade(w, h, draw, { base, mortar, share = 0.5, seed = 31 } = {}) {
  const pass = (glow) => drawTex(w * 2, h * 2, (g) => {
    if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, w * 2, h * 2); } else bricks(g, w * 2, h * 2, base, mortar);
    g.scale(2, 2);
    const win = (x, y, ww, hh) => {
      const lit = hash(x, y, seed) < share;
      if (!glow) pane(g, x, y, ww, hh, lit ? LAMPLIGHT : GLASS);
      else if (lit) { g.fillStyle = LAMPLIGHT; g.fillRect(x, y, ww, hh); }
    };
    draw(g, win, glow);
  });
  return { map: pass(false), emissiveMap: pass(true) };
}
