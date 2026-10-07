import { inRect } from './lib/tracks.js';

/** @typedef {import('./lib/tracks.js').Track} Track */
/** @typedef {import('./lib/tracks.js').TrackData} TrackData */

/**
 * @typedef {object} HeatOptions
 * @property {number} width line width in preview px
 * @property {number} bright per-line alpha
 * @property {number} glow glow strength, 0 = off
 * @property {number} grad glow radius in preview px
 * @property {Uint32Array} lut colormap lookup table
 */

/**
 * Where and how big to draw: `W`x`H` canvas px centered on world point (cx, cy) at `S` px per world unit.
 * `k` is canvas px per preview css px (scales line widths).
 * @typedef {{W: number, H: number, cx: number, cy: number, S: number, k: number}} Camera
 */

/** Adds a blurred copy of the canvas on top ("glow"). */
export function applyGlow(
  /** @type {HTMLCanvasElement} */ canvas,
  /** @type {Camera} */ { W, H, k },
  /** @type {HeatOptions} */ o,
) {
  if (!(o.glow > 0)) return;
  const g = canvas.getContext('2d');
  if (!g) return;
  const r = o.grad * k;
  const f = Math.max(1, Math.floor(r / 2));
  const sw = Math.max(1, Math.ceil(W / f));
  const sh = Math.max(1, Math.ceil(H / f));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const s = small.getContext('2d');
  if (!s) return;
  s.imageSmoothingQuality = 'high';
  s.drawImage(canvas, 0, 0, sw, sh);
  const blurred = document.createElement('canvas');
  blurred.width = sw;
  blurred.height = sh;
  const s2 = blurred.getContext('2d');
  if (!s2) return;
  s2.filter = `blur(${Math.max(0.5, r / f)}px)`;
  s2.drawImage(small, 0, 0);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, o.glow);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(blurred, 0, 0, W, H);
  if (o.glow > 1) {
    g.globalAlpha = o.glow - 1;
    g.drawImage(blurred, 0, 0, W, H);
  }
  g.restore();
}

/** Maps the gray heat intensities (red channel) through the colormap, in horizontal bands. */
export function colorize(
  /** @type {HTMLCanvasElement} */ canvas,
  /** @type {number} */ W,
  /** @type {number} */ H,
  /** @type {Uint32Array} */ lut,
) {
  const g = canvas.getContext('2d');
  if (!g) return;
  for (let y = 0; y < H; y += 256) {
    const h = Math.min(256, H - y);
    const id = g.getImageData(0, y, W, h);
    const u = new Uint32Array(id.data.buffer);
    for (let i = 0; i < u.length; i++) u[i] = lut[u[i] & 255];
    g.putImageData(id, 0, y);
  }
}

/** Strokes one track, skipping points closer than ~0.35 px to the previous one. */
export function strokeTrack(
  /** @type {CanvasRenderingContext2D} */ g,
  /** @type {TrackData} */ { xs, ys },
  /** @type {Track} */ t,
  /** @type {Camera} */ { W, H, cx, cy, S },
) {
  g.beginPath();
  let lx = 0;
  let ly = 0;
  const minD2 = 0.35 * 0.35;
  for (let i = t.o, e = t.o + t.c; i < e; i++) {
    const x = (xs[i] - cx) * S + W / 2;
    const y = (ys[i] - cy) * S + H / 2;
    if (i === t.o) {
      g.moveTo(x, y);
      lx = x;
      ly = y;
      continue;
    }
    const dx = x - lx;
    const dy = y - ly;
    if (dx * dx + dy * dy < minD2 && i !== e - 1) continue;
    g.lineTo(x, y);
    lx = x;
    ly = y;
  }
  g.stroke();
}

/** World-unit margin around a view within which tracks can still touch it (line width). */
export const worldMargin = (/** @type {HeatOptions} */ o, /** @type {Camera} */ cam) => ((o.width * cam.k) / cam.S) * 2;

/** Prepares an accumulation context: black, additive white lines. */
export function beginAccumulation(
  /** @type {CanvasRenderingContext2D} */ g,
  /** @type {number} */ W,
  /** @type {number} */ H,
  /** @type {Camera} */ cam,
  /** @type {HeatOptions} */ o,
) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = o.width * cam.k;
  g.strokeStyle = `rgba(255,255,255,${o.bright})`;
}

/**
 * Renders the given tracks as a colorized heatmap into `canvas` (resized to the camera).
 * @returns {number} number of tracks drawn
 */
export function renderHeat(
  /** @type {HTMLCanvasElement} */ canvas,
  /** @type {Camera} */ cam,
  /** @type {HeatOptions} */ o,
  /** @type {TrackData} */ data,
  /** @type {Track[]} */ tracks,
) {
  const { W, H, cx, cy, S } = cam;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: false });
  if (!g) throw new Error('2D canvas is not available');
  beginAccumulation(g, W, H, cam, o);
  const vx0 = cx - W / 2 / S;
  const vx1 = cx + W / 2 / S;
  const vy0 = cy - H / 2 / S;
  const vy1 = cy + H / 2 / S;
  const mg = worldMargin(o, cam);
  let drawn = 0;
  for (const t of tracks) {
    if (!inRect(t, vx0, vy0, vx1, vy1, mg)) continue;
    strokeTrack(g, data, t, cam);
    drawn++;
  }
  g.globalCompositeOperation = 'source-over';
  applyGlow(canvas, cam, o);
  colorize(canvas, W, H, o.lut);
  return drawn;
}
