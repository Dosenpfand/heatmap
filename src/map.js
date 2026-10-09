import { ui } from './dom.js';
import { drawStats } from './export-common.js';
import { renderHeat } from './heat.js';
import { fitRatio } from './lib/selection.js';
import { attributionParts, tilesForView } from './lib/tiles.js';
import { activeBase, background, exportSize, heatOptions, isLight } from './settings.js';
import { scaleOf, state, visibleTracks } from './state.js';
import { drawTiles, getTile } from './tile-cache.js';

/** @typedef {import('./lib/selection.js').Rect} Rect */

const cv = ui.view;
const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
const { view, viewport } = state;

/** Last rendered heat layer: {canvas, cx, cy, S}, redrawn scaled/shifted while a new one renders. */
let heat = /** @type {{canvas: HTMLCanvasElement, cx: number, cy: number, S: number} | null} */ (null);
let renderTimer = 0;
let drawReq = 0;

/* ---------- rendering ---------- */

export function resize() {
  viewport.dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  viewport.w = r.width;
  viewport.h = r.height;
  cv.width = Math.round(viewport.w * viewport.dpr);
  cv.height = Math.round(viewport.h * viewport.dpr);
  scheduleRender(0);
}

/** Re-renders the heat layer after `delay` ms (debounced) and repaints right away. */
export function scheduleRender(delay = 120) {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(doRender, delay);
  requestDraw();
}

function doRender() {
  if (!state.data.tracks.length) return;
  const canvas = heat ? heat.canvas : document.createElement('canvas');
  const S = scaleOf(view.z);
  const { dpr } = viewport;
  const cam = { W: cv.width, H: cv.height, cx: view.cx, cy: view.cy, S: S * dpr, k: dpr };
  renderHeat(canvas, cam, heatOptions(), state.data, visibleTracks());
  heat = { canvas, cx: view.cx, cy: view.cy, S };
  requestDraw();
}

export function requestDraw() {
  if (drawReq) return;
  drawReq = requestAnimationFrame(() => {
    drawReq = 0;
    draw();
  });
}

/** @returns {[number, number]} */
function w2s(/** @type {number} */ wx, /** @type {number} */ wy) {
  const S = scaleOf(view.z);
  return [(wx - view.cx) * S + viewport.w / 2, (wy - view.cy) * S + viewport.h / 2];
}
/** @returns {[number, number]} */
function s2w(/** @type {number} */ x, /** @type {number} */ y) {
  const S = scaleOf(view.z);
  return [(x - viewport.w / 2) / S + view.cx, (y - viewport.h / 2) / S + view.cy];
}

let attrKey = '';
/** Shows the basemap attribution as HTML links over the canvas. */
function updateAttribution(/** @type {string} */ base) {
  const light = isLight();
  const key = base + light;
  if (key === attrKey) return;
  attrKey = key;
  const el = ui.attribution;
  el.replaceChildren();
  el.hidden = base === 'none';
  el.classList.toggle('light', light);
  if (base === 'none') return;
  attributionParts(base).forEach((p, i) => {
    if (i) el.append(' | ');
    if (!p.href) return el.append(p.text);
    const a = document.createElement('a');
    a.href = p.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = p.text;
    el.append(a);
  });
}

function draw() {
  updateExportUI();
  const { w: W, h: H, dpr } = viewport;
  const base = activeBase();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = background();
  ctx.fillRect(0, 0, W, H);
  const S = scaleOf(view.z);
  if (base !== 'none') {
    ctx.globalAlpha = +ui.dim.value;
    const list = tilesForView(base, view.cx, view.cy, S, W, H, false);
    drawTiles(
      ctx,
      list,
      list.map((t) => getTile(t.url, requestDraw)),
      0.5,
    );
    ctx.globalAlpha = 1;
  }
  if (heat) {
    const r = S / heat.S;
    const ox = (heat.cx - view.cx) * S + W / 2 - (W / 2) * r;
    const oy = (heat.cy - view.cy) * S + H / 2 - (H / 2) * r;
    ctx.drawImage(heat.canvas, ox, oy, W * r, H * r);
  }
  if (ui.showstats.checked) drawStats(ctx, W, H, state.stats, { fs: Math.max(11, Math.min(15, W / 28)) });
  updateAttribution(base);
  drawSelection();
}

/* ---------- selection ---------- */

/** Handle name, x fraction, y fraction. @type {[string, number, number][]} */
const HANDLES = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['e', 1, 0.5],
  ['se', 1, 1],
  ['s', 0.5, 1],
  ['sw', 0, 1],
  ['w', 0, 0.5],
];
/** @type {Record<string, string>} */
const CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  move: 'move',
};

const ratio = () => +ui.ratio.value;

/** The selection in screen px, or null. */
function selScreen() {
  const { sel } = state;
  if (!sel) return null;
  const [a, b] = w2s(sel.x0, sel.y0);
  const [c, d] = w2s(sel.x1, sel.y1);
  return { x0: a, y0: b, x1: c, y1: d };
}

function drawSelection() {
  const s = selScreen();
  if (!s) return;
  const { w: W, h: H } = viewport;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#ff6a1a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
  ctx.fillStyle = '#ff6a1a';
  for (const [, fx, fy] of HANDLES) ctx.fillRect(s.x0 + (s.x1 - s.x0) * fx - 4, s.y0 + (s.y1 - s.y0) * fy - 4, 8, 8);
  const [pw, ph] = exportSize();
  ctx.font = '12px system-ui';
  const txt = `${pw} × ${ph} px`;
  const tw = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(0,0,0,.7)';
  ctx.fillRect(s.x0, s.y0 - 22, tw + 12, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(txt, s.x0 + 6, s.y0 - 8);
  ctx.restore();
}

/** Which handle (or 'move') is under the screen point. */
function hit(/** @type {number} */ x, /** @type {number} */ y) {
  const s = selScreen();
  if (!s) return null;
  for (const [name, fx, fy] of HANDLES) {
    const hx = s.x0 + (s.x1 - s.x0) * fx;
    const hy = s.y0 + (s.y1 - s.y0) * fy;
    if (Math.abs(x - hx) < 8 && Math.abs(y - hy) < 8) return name;
  }
  if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return 'move';
  return null;
}

/** Enables/disables the export button and updates the selection hint. */
export function updateExportUI() {
  ui.exbtn.disabled = false;
  const [w, h] = exportSize();
  const info = `${w} × ${h} px (${((w * h) / 1e6).toFixed(1)} MP)`;
  ui.selhint.textContent = state.sel
    ? `Selection → ${info}`
    : `No selection: exports current view → ${info}. Click “Select area”, then drag on the map. Drag inside to move, handles to resize. Hold Space to pan.`;
}

function setMode(/** @type {'pan' | 'select'} */ m) {
  state.mode = m;
  ui.selbtn.classList.toggle('on', m === 'select');
  cv.style.cursor = m === 'select' ? 'crosshair' : 'grab';
}

function changeSelection(/** @type {Rect | null} */ sel) {
  state.sel = sel;
  updateExportUI();
  requestDraw();
}

/**
 * Selection after dragging corner/edge `h` to world point (wx, wy), optionally keeping aspect ratio `rt`.
 * @returns {Rect}
 */
function resizeSelection(
  /** @type {Rect} */ s0,
  /** @type {string} */ h,
  /** @type {number} */ wx,
  /** @type {number} */ wy,
  /** @type {number} */ rt,
) {
  let { x0, y0, x1, y1 } = s0;
  if (h.includes('w')) x0 = Math.min(wx, x1 - 1e-9);
  if (h.includes('e')) x1 = Math.max(wx, x0 + 1e-9);
  if (h.includes('n')) y0 = Math.min(wy, y1 - 1e-9);
  if (h.includes('s')) y1 = Math.max(wy, y0 + 1e-9);
  if (rt) {
    if (h.length === 2) {
      let w = x1 - x0;
      let hh = y1 - y0;
      if (w / hh > rt) w = hh * rt;
      else hh = w / rt;
      if (h.includes('w')) x0 = x1 - w;
      else x1 = x0 + w;
      if (h.includes('n')) y0 = y1 - hh;
      else y1 = y0 + hh;
    } else if (h === 'n' || h === 's') {
      const w = (y1 - y0) * rt;
      const c = (s0.x0 + s0.x1) / 2;
      x0 = c - w / 2;
      x1 = c + w / 2;
    } else {
      const hh = (x1 - x0) / rt;
      const c = (s0.y0 + s0.y1) / 2;
      y0 = c - hh / 2;
      y1 = c + hh / 2;
    }
  }
  return { x0, y0, x1, y1 };
}

/** Selection spanned from anchor `a` to (wx, wy), optionally constrained to aspect ratio `rt`. @returns {Rect} */
function newSelection(
  /** @type {[number, number]} */ a,
  /** @type {number} */ wx,
  /** @type {number} */ wy,
  /** @type {number} */ rt,
) {
  let dx = wx - a[0];
  let dy = wy - a[1];
  if (rt) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax / (ay || 1e-12) > rt) dx = Math.sign(dx || 1) * ay * rt;
    else dy = (Math.sign(dy || 1) * ax) / rt;
  }
  return {
    x0: Math.min(a[0], a[0] + dx),
    x1: Math.max(a[0], a[0] + dx),
    y0: Math.min(a[1], a[1] + dy),
    y1: Math.max(a[1], a[1] + dy),
  };
}

/* ---------- pointer / keyboard ---------- */

/**
 * @typedef {(
 *   | {kind: 'pan', sx: number, sy: number, cx: number, cy: number}
 *   | {kind: 'new', a: [number, number]}
 *   | {kind: 'move', start: [number, number], sel0: Rect}
 *   | {kind: 'resize', h: string, start: [number, number], sel0: Rect}
 * )} Drag
 */
let drag = /** @type {Drag | null} */ (null);
let spaceDown = false;

const idleCursor = () => (state.mode === 'select' ? 'crosshair' : 'grab');

/** Pointer position relative to the canvas. @returns {[number, number]} */
function local(/** @type {MouseEvent} */ e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function onPointerDown(/** @type {PointerEvent} */ e) {
  cv.setPointerCapture(e.pointerId);
  const [x, y] = local(e);
  const panning = state.mode === 'pan' || spaceDown || e.button === 1 || e.button === 2;
  if (!panning) {
    const h = hit(x, y);
    if (h && state.sel) {
      drag = { kind: h === 'move' ? 'move' : 'resize', h, start: [x, y], sel0: { ...state.sel } };
      return;
    }
    const [wx, wy] = s2w(x, y);
    state.sel = { x0: wx, y0: wy, x1: wx, y1: wy };
    drag = { kind: 'new', a: [wx, wy] };
    return;
  }
  drag = { kind: 'pan', sx: x, sy: y, cx: view.cx, cy: view.cy };
  cv.style.cursor = 'grabbing';
}

function onPointerMove(/** @type {PointerEvent} */ e) {
  const [x, y] = local(e);
  if (!drag) {
    if (state.mode === 'select' && !spaceDown) {
      const h = hit(x, y);
      cv.style.cursor = h ? CURSORS[h] : 'crosshair';
    }
    return;
  }
  const S = scaleOf(view.z);
  if (drag.kind === 'pan') {
    view.cx = drag.cx - (x - drag.sx) / S;
    view.cy = drag.cy - (y - drag.sy) / S;
    scheduleRender();
    return;
  }
  const [wx, wy] = s2w(x, y);
  if (drag.kind === 'new') {
    state.sel = newSelection(drag.a, wx, wy, ratio());
  } else if (drag.kind === 'move') {
    const dx = (x - drag.start[0]) / S;
    const dy = (y - drag.start[1]) / S;
    const s0 = drag.sel0;
    state.sel = { x0: s0.x0 + dx, x1: s0.x1 + dx, y0: s0.y0 + dy, y1: s0.y1 + dy };
  } else {
    state.sel = resizeSelection(drag.sel0, drag.h, wx, wy, ratio());
  }
  requestDraw();
  updateExportUI();
}

function onPointerUp() {
  const { sel } = state;
  if (drag?.kind === 'new' && sel && (sel.x1 - sel.x0) * scaleOf(view.z) < 8) state.sel = null;
  drag = null;
  cv.style.cursor = idleCursor();
  updateExportUI();
  requestDraw();
}

function onWheel(/** @type {WheelEvent} */ e) {
  e.preventDefault();
  const [x, y] = local(e);
  const [wx, wy] = s2w(x, y);
  view.z = Math.max(2, Math.min(21, view.z - e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  const S = scaleOf(view.z);
  view.cx = wx - (x - viewport.w / 2) / S;
  view.cy = wy - (y - viewport.h / 2) / S;
  scheduleRender();
}

/** Wires up the canvas, selection buttons and window events. */
export function initMap() {
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
      spaceDown = true;
      cv.style.cursor = 'grab';
      e.preventDefault();
    }
    if (e.key === 'Escape') setMode('pan');
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      cv.style.cursor = idleCursor();
    }
  });
  addEventListener('resize', resize);

  ui.selbtn.addEventListener('click', () => {
    if (state.mode === 'select') return setMode('pan');
    setMode('select');
    if (!state.sel) {
      // default selection: centered 60% of the viewport
      const { w: W, h: H } = viewport;
      const w = W * 0.6;
      const h = H * 0.6;
      const [a, b] = s2w(W / 2 - w / 2, H / 2 - h / 2);
      const [c, d] = s2w(W / 2 + w / 2, H / 2 + h / 2);
      changeSelection(fitRatio({ x0: a, y0: b, x1: c, y1: d }, ratio()));
    }
  });
  ui.clrbtn.addEventListener('click', () => changeSelection(null));
  ui.ratio.addEventListener('change', () => changeSelection(fitRatio(state.sel, ratio())));
  ui.px.addEventListener('change', () => changeSelection(state.sel));
}
