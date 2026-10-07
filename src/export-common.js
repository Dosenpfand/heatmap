import { ui } from './dom.js';
import { attributionFor } from './lib/tiles.js';
import { isLight } from './settings.js';

export const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Saves a blob through a temporary download link. */
export function download(/** @type {Blob} */ blob, /** @type {string} */ filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}

export function create2d(/** @type {number} */ w, /** @type {number} */ h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas is not available');
  return { canvas, g };
}

/** Draws the optional title/subtitle block at the bottom of a PW x PH canvas. */
export function drawTitle(
  /** @type {CanvasRenderingContext2D} */ g,
  /** @type {number} */ PW,
  /** @type {number} */ PH,
) {
  const title = ui.title.value.trim();
  const sub = ui.subtitle.value.trim();
  if (!title && !sub) return;
  const m = PW * 0.05;
  const fs = Math.min(PW, PH) * 0.05;
  const light = isLight();
  const grad = g.createLinearGradient(0, PH - fs * 5, 0, PH);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, light ? 'rgba(239,236,228,.85)' : 'rgba(0,0,0,.75)');
  g.fillStyle = grad;
  g.fillRect(0, PH - fs * 5, PW, fs * 5);
  g.fillStyle = light ? '#111' : '#fff';
  g.textBaseline = 'alphabetic';
  let y = PH - m * 0.7;
  if (sub) {
    g.font = `300 ${fs * 0.42}px system-ui, sans-serif`;
    g.letterSpacing = `${fs * 0.08}px`;
    g.globalAlpha = 0.75;
    g.fillText(sub.toUpperCase(), m, y);
    g.globalAlpha = 1;
    y -= fs * 0.75;
  }
  if (title) {
    g.font = `700 ${fs}px system-ui, sans-serif`;
    g.letterSpacing = `${fs * 0.04}px`;
    g.fillText(title.toUpperCase(), m, y);
  }
  g.letterSpacing = '0px';
}

/** Draws the map attribution in the bottom-right corner of a PW x PH canvas. */
export function drawAttribution(
  /** @type {CanvasRenderingContext2D} */ g,
  /** @type {string} */ template,
  /** @type {number} */ PW,
  /** @type {number} */ PH,
) {
  const fs = Math.max(10, Math.min(PW, PH) * 0.012);
  const pad = fs * 0.4;
  const text = attributionFor(template);
  g.save();
  g.font = `${fs}px system-ui, sans-serif`;
  g.letterSpacing = '0px';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  const w = g.measureText(text).width;
  const light = isLight();
  g.fillStyle = light ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.55)';
  g.fillRect(PW - w - pad * 2, PH - fs - pad * 1.5, w + pad * 2, fs + pad * 1.5);
  g.fillStyle = light ? '#333' : '#ddd';
  g.fillText(text, PW - pad, PH - pad);
  g.restore();
}
