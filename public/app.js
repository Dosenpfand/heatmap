'use strict';
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;

/* ---------- data ---------- */
let TR = [], TYPES = [], XS, YS;
const state = { types: new Set(), years: new Set() };

/* Data lives only in this browser (IndexedDB). Nothing is uploaded anywhere. */
const idb = () => new Promise((ok, bad) => { const r = indexedDB.open('heatmap', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
async function kv(mode, fn) { const db = await idb(); return new Promise((ok, bad) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => ok(r.result); t.onerror = () => bad(t.error); }); }
const saveData = buf => kv('readwrite', s => s.put(buf, 'data')).catch(() => {});
const readData = () => kv('readonly', s => s.get('data'));

function loadData(buf) {
  const dv = new DataView(buf), ml = dv.getUint32(0, true), pad = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, ml)));
  const pts = new Int32Array(buf, 8 + ml + pad);
  const n = pts.length / 2; XS = new Float64Array(n); YS = new Float64Array(n);
  for (let i = 0; i < n; i++) { const lon = pts[2 * i] / 1e6, lat = pts[2 * i + 1] / 1e6; XS[i] = mx(lon); YS[i] = my(lat); }
  TYPES = meta.types;
  TR = meta.tracks.map(([t, y, o, c, x0, y0, x1, y1, ts]) => {
    // bbox in world coords (note: y flips)
    const ax = mx(x0 / 1e6), bx = mx(x1 / 1e6), ay = my(y1 / 1e6), by = my(y0 / 1e6);
    return { t, y, o, c, ts, x0: ax, x1: bx, y0: ay, y1: by };
  });
}
const mx = lon => (lon + 180) / 360;
const my = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

/* ---------- colormaps ---------- */
const CMAPS = {
  'Inferno fire': ['#000004', '#2a0b4d', '#7b1d6b', '#c8363f', '#f57d15', '#fbc92a', '#fcffa4'],
  'Orange': ['#1a0500', '#6b1500', '#d33a00', '#fc4c02', '#ff9a3d', '#ffd9a0', '#ffffff'],
  'Ice': ['#00040f', '#0b2a6b', '#1d6fd6', '#2fc4f2', '#a8f0ff', '#ffffff'],
  'Neon': ['#0a0014', '#4b0fa8', '#d013c9', '#ff4d8d', '#ffc14d', '#ffffff'],
  'Viridis': ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  'Magma': ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  'Toxic green': ['#000a03', '#03401a', '#0a9a3a', '#4ff07a', '#d4ffc0', '#ffffff'],
  'Gold': ['#120900', '#4d2e00', '#a66a00', '#e8a317', '#ffd966', '#fffbe6'],
  'Ink (dark on light)': ['#9aa3c4', '#4b5a9e', '#24307a', '#0d1244', '#050720'],
  'White': ['#555566', '#aab', '#ffffff']
};
const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
function ramp(stops, t) {
  const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]); return a.map((v, k) => v + (b[k] - v) * f);
}
function makeLUT(name) {
  const lut = new Uint32Array(256), stops = CMAPS[name];
  for (let v = 0; v < 256; v++) {
    const t = v / 255, c = ramp(stops, Math.pow(t, 0.75));
    const a = Math.min(1, Math.pow(t, 0.6) * 3.2);
    lut[v] = ((Math.round(a * 255) << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
  }
  return lut;
}
function cmapGradient(name) { return 'linear-gradient(90deg,' + CMAPS[name].join(',') + ')'; }

/* ---------- tiles ---------- */
const tileCache = new Map();
const PRESETS = [
  ['CARTO Dark', 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key={key}', 0, 1],
  ['CARTO Dark + labels', 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key={key}', 0, 1],
  ['CARTO Light', 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key={key}', 1, 1],
  ['CARTO Voyager', 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png?key={key}', 1, 1],
  ['Stadia Alidade Smooth Dark', 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={key}', 0, 1],
  ['Stadia Alidade Smooth', 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={key}', 1, 1],
  ['Stadia Stamen Toner', 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key={key}', 1, 1],
  ['MapTiler Dataviz Dark', 'https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}{r}.png?key={key}', 0, 1],
  ['MapTiler Streets', 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key={key}', 1, 1],
  ['Thunderforest Transport Dark', 'https://{s}.tile.thunderforest.com/transport-dark/{z}/{x}/{y}{r}.png?apikey={key}', 0, 1],
  ['Jawg Dark', 'https://tile.jawg.io/jawg-dark/{z}/{x}/{y}{r}.png?access-token={key}', 0, 1],
  ['Esri Satellite (no key)', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 0, 0],
  ['OpenStreetMap (no key, light use only)', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 1, 0]
];
function tmpl() {
  const t = $('turl').value.trim();
  if (t.includes('{key}')) { const k = $('tkey').value.trim(); return k ? t.replace(/\{key\}/g, encodeURIComponent(k)) : ''; }
  return t;
}
function syncBaseUI() {
  const v = $('base').value;
  $('tbox').style.display = v === 'none' ? 'none' : '';
  $('keyrow').style.display = $('turl').value.includes('{key}') ? '' : 'none';
  $('status').textContent = (v !== 'none' && !tmpl()) ? 'Enter an API key to show the basemap.' : '';
}
function tileURL(t, z, x, y) {
  const n = 1 << z; x = ((x % n) + n) % n;
  return t.replace('{s}', 'abc'[(x + y) % 3]).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '@2x');
}
function getTile(url, onload) {
  let e = tileCache.get(url);
  if (!e) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    e = { img, ok: false, done: false, cbs: [] };
    img.onload = () => { e.ok = e.done = true; e.cbs.forEach(f => f()); e.cbs = []; };
    img.onerror = () => { e.done = true; e.cbs.forEach(f => f()); e.cbs = []; };
    img.src = url; tileCache.set(url, e);
  }
  if (!e.done && onload) e.cbs.push(onload);
  return e;
}
const BG = { dark: '#0b0d12', light: '#efece4' };
const isLight = () => $('tlight').checked;
const baseT = () => $('base').value === 'none' || !tmpl() ? 'none' : tmpl();

// draws tiles covering view (cx,cy world; S px per world unit; W,H px). returns promise-less sync draw using cache.
function tilesForView(base, cx, cy, S, W, H, ze) {
  const retina = base.includes('{r}'), tz = Math.max(0, Math.min(19, Math.round(Math.log2(S / 256) - (ze ? 1 : 0.4) + (retina ? 0 : 1))));
  const n = 1 << tz, ts = S / n; // tile size in px
  const x0 = Math.floor((cx - W / 2 / S) * n), x1 = Math.floor((cx + W / 2 / S) * n);
  const y0 = Math.max(0, Math.floor((cy - H / 2 / S) * n)), y1 = Math.min(n - 1, Math.floor((cy + H / 2 / S) * n));
  const list = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    list.push({ url: tileURL(base, tz, x, y), px: (x / n - cx) * S + W / 2, py: (y / n - cy) * S + H / 2, ts });
  return list;
}

/* ---------- heat rendering ---------- */
function visible(t) {
  return state.types.has(t.t) && state.years.has(t.y);
}

function applyGlow(canvas, W, H, k, o) {
  if (!(o.glow > 0)) return;
  const g = canvas.getContext('2d'), r = o.grad * k, f = Math.max(1, Math.floor(r / 2));
  const sw = Math.max(1, Math.ceil(W / f)), sh = Math.max(1, Math.ceil(H / f));
  const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh;
  const s = sm.getContext('2d'); s.imageSmoothingQuality = 'high';
  s.drawImage(canvas, 0, 0, sw, sh);
  const sm2 = document.createElement('canvas'); sm2.width = sw; sm2.height = sh;
  const s2 = sm2.getContext('2d'); s2.filter = `blur(${Math.max(0.5, r / f)}px)`; s2.drawImage(sm, 0, 0);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, o.glow); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(sm2, 0, 0, W, H);
  if (o.glow > 1) { g.globalAlpha = o.glow - 1; g.drawImage(sm2, 0, 0, W, H); }
  g.restore();
}
function colorize(canvas, W, H, lut) {
  const g = canvas.getContext('2d');
  for (let y = 0; y < H; y += 256) {
    const h = Math.min(256, H - y), id = g.getImageData(0, y, W, h), u = new Uint32Array(id.data.buffer);
    for (let i = 0; i < u.length; i++) u[i] = lut[u[i] & 255];
    g.putImageData(id, 0, y);
  }
}
function strokeTrack(g, t, cx, cy, S, W, H) {
  g.beginPath();
  let lx = 0, ly = 0; const minD2 = 0.35 * 0.35;
  for (let i = t.o, e = t.o + t.c; i < e; i++) {
    const x = (XS[i] - cx) * S + W / 2, y = (YS[i] - cy) * S + H / 2;
    if (i === t.o) { g.moveTo(x, y); lx = x; ly = y; continue; }
    const dx = x - lx, dy = y - ly;
    if (dx * dx + dy * dy < minD2 && i !== e - 1) continue;
    g.lineTo(x, y); lx = x; ly = y;
  }
  g.stroke();
}
function inRect(t, vx0, vy0, vx1, vy1, mg) { return !(t.x1 < vx0 - mg || t.x0 > vx1 + mg || t.y1 < vy0 - mg || t.y0 > vy1 + mg); }
function renderHeat(canvas, W, H, cx, cy, S, k, o) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: false });
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = o.width * k;
  g.strokeStyle = `rgba(255,255,255,${o.bright})`;
  const vx0 = cx - W / 2 / S, vx1 = cx + W / 2 / S, vy0 = cy - H / 2 / S, vy1 = cy + H / 2 / S;
  const mg = o.width * k / S * 2;
  let drawn = 0;
  for (const t of TR) {
    if (!visible(t) || !inRect(t, vx0, vy0, vx1, vy1, mg)) continue;
    strokeTrack(g, t, cx, cy, S, W, H); drawn++;
  }
  g.globalCompositeOperation = 'source-over';
  applyGlow(canvas, W, H, k, o);
  colorize(canvas, W, H, o.lut);
  return drawn;
}

/* ---------- view ---------- */
const cv = $('view'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
const view = { cx: 0.5, cy: 0.5, z: 10 };
const Sof = z => 256 * Math.pow(2, z);
let heat = null; // {canvas, cx, cy, S}
let renderTimer = 0, drawReq = 0;

function opts() {
  return { width: +$('width').value, bright: +$('bright').value, glow: +$('glow').value, grad: +$('grad').value, lut: LUT };
}
let LUT;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  scheduleRender(0);
}
function scheduleRender(delay = 120) { clearTimeout(renderTimer); renderTimer = setTimeout(doRender, delay); requestDraw(); }
function doRender() {
  if (!TR.length) return;
  const c = heat ? heat.canvas : document.createElement('canvas');
  const S = Sof(view.z);
  const t0 = performance.now();
  renderHeat(c, cv.width, cv.height, view.cx, view.cy, S * dpr, dpr, opts());
  heat = { canvas: c, cx: view.cx, cy: view.cy, S };
  requestDraw();
}
function requestDraw() { if (!drawReq) drawReq = requestAnimationFrame(() => { drawReq = 0; draw(); }); }

function w2s(wx, wy) { const S = Sof(view.z); return [(wx - view.cx) * S + W / 2, (wy - view.cy) * S + H / 2]; }
function s2w(x, y) { const S = Sof(view.z); return [(x - W / 2) / S + view.cx, (y - H / 2) / S + view.cy]; }

function draw() {
  const base = baseT(), light = isLight();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = light ? BG.light : BG.dark; ctx.fillRect(0, 0, W, H);
  const S = Sof(view.z);
  if (base !== 'none') {
    const dim = +$('dim').value; ctx.globalAlpha = dim;
    // draw a coarser fallback level too, so panning doesn't flash
    for (const t of tilesForView(base, view.cx, view.cy, S, W, H, false)) {
      const e = getTile(t.url, requestDraw); if (e.ok) ctx.drawImage(e.img, t.px, t.py, t.ts + 0.5, t.ts + 0.5);
    }
    ctx.globalAlpha = 1;
  }
  if (heat) {
    const r = S / heat.S, ox = (heat.cx - view.cx) * S + W / 2 - (W / 2) * r, oy = (heat.cy - view.cy) * S + H / 2 - (H / 2) * r;
    ctx.drawImage(heat.canvas, ox, oy, W * r, H * r);
  }
  drawSel();
}

/* ---------- selection ---------- */
let sel = null; // world rect {x0,y0,x1,y1}, x0<x1,y0<y1
let mode = 'pan';
function ratio() { return +$('ratio').value; }
function selScreen() { if (!sel) return null; const [a, b] = w2s(sel.x0, sel.y0), [c, d] = w2s(sel.x1, sel.y1); return { x0: a, y0: b, x1: c, y1: d }; }
const HANDLES = [['nw', 0, 0], ['n', .5, 0], ['ne', 1, 0], ['e', 1, .5], ['se', 1, 1], ['s', .5, 1], ['sw', 0, 1], ['w', 0, .5]];
function drawSel() {
  const s = selScreen(); if (!s) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0); ctx.fill('evenodd');
  ctx.strokeStyle = '#ff6a1a'; ctx.lineWidth = 1.5; ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
  ctx.fillStyle = '#ff6a1a';
  for (const [, fx, fy] of HANDLES) ctx.fillRect(s.x0 + (s.x1 - s.x0) * fx - 4, s.y0 + (s.y1 - s.y0) * fy - 4, 8, 8);
  const [pw, ph] = exportSize();
  ctx.font = '12px system-ui'; const txt = `${pw} × ${ph} px`, tw = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(s.x0, s.y0 - 22, tw + 12, 20);
  ctx.fillStyle = '#fff'; ctx.fillText(txt, s.x0 + 6, s.y0 - 8);
  ctx.restore();
}
function hit(x, y) {
  const s = selScreen(); if (!s) return null;
  for (const [n, fx, fy] of HANDLES) {
    const hx = s.x0 + (s.x1 - s.x0) * fx, hy = s.y0 + (s.y1 - s.y0) * fy;
    if (Math.abs(x - hx) < 8 && Math.abs(y - hy) < 8) return n;
  }
  if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return 'move';
  return null;
}
const CURS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };

function fitRatio(r) { // re-apply aspect to current selection around its center
  if (!sel || !r) return;
  const cxs = (sel.x0 + sel.x1) / 2, cys = (sel.y0 + sel.y1) / 2;
  let w = sel.x1 - sel.x0, h = sel.y1 - sel.y0;
  if (w / h > r) w = h * r; else h = w / r;
  sel = { x0: cxs - w / 2, x1: cxs + w / 2, y0: cys - h / 2, y1: cys + h / 2 };
}
function exportSize() {
  if (!sel) return [0, 0];
  const w = sel.x1 - sel.x0, h = sel.y1 - sel.y0, L = +$('px').value;
  return w >= h ? [L, Math.max(1, Math.round(L * h / w))] : [Math.max(1, Math.round(L * w / h)), L];
}

// pointer handling
let drag = null, spaceDown = false;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const panning = mode === 'pan' || spaceDown || e.button === 1 || e.button === 2;
  if (!panning) {
    const h = hit(x, y);
    if (h) { drag = { kind: h === 'move' ? 'move' : 'resize', h, start: [x, y], sel0: { ...sel } }; return; }
    const [wx, wy] = s2w(x, y);
    sel = { x0: wx, y0: wy, x1: wx, y1: wy };
    drag = { kind: 'new', a: [wx, wy] }; return;
  }
  drag = { kind: 'pan', sx: x, sy: y, cx: view.cx, cy: view.cy }; cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (!drag) {
    if (mode === 'select' && !spaceDown) { const h = hit(x, y); cv.style.cursor = h ? CURS[h] : 'crosshair'; }
    return;
  }
  const S = Sof(view.z);
  if (drag.kind === 'pan') {
    view.cx = drag.cx - (x - drag.sx) / S; view.cy = drag.cy - (y - drag.sy) / S; scheduleRender(); return;
  }
  const [wx, wy] = s2w(x, y), rt = ratio();
  if (drag.kind === 'new') {
    let dx = wx - drag.a[0], dy = wy - drag.a[1];
    if (rt) { const ax = Math.abs(dx), ay = Math.abs(dy); if (ax / (ay || 1e-12) > rt) dx = Math.sign(dx || 1) * ay * rt; else dy = Math.sign(dy || 1) * ax / rt; }
    sel = { x0: Math.min(drag.a[0], drag.a[0] + dx), x1: Math.max(drag.a[0], drag.a[0] + dx), y0: Math.min(drag.a[1], drag.a[1] + dy), y1: Math.max(drag.a[1], drag.a[1] + dy) };
  } else if (drag.kind === 'move') {
    const dx = (x - drag.start[0]) / S, dy = (y - drag.start[1]) / S, s0 = drag.sel0;
    sel = { x0: s0.x0 + dx, x1: s0.x1 + dx, y0: s0.y0 + dy, y1: s0.y1 + dy };
  } else {
    const s0 = drag.sel0, h = drag.h; let { x0, y0, x1, y1 } = s0;
    if (h.includes('w')) x0 = Math.min(wx, x1 - 1e-9); if (h.includes('e')) x1 = Math.max(wx, x0 + 1e-9);
    if (h.includes('n')) y0 = Math.min(wy, y1 - 1e-9); if (h.includes('s')) y1 = Math.max(wy, y0 + 1e-9);
    if (rt) {
      const corner = h.length === 2;
      if (corner) {
        let w = x1 - x0, hh = y1 - y0;
        if (w / hh > rt) w = hh * rt; else hh = w / rt;
        if (h.includes('w')) x0 = x1 - w; else x1 = x0 + w;
        if (h.includes('n')) y0 = y1 - hh; else y1 = y0 + hh;
      } else if (h === 'n' || h === 's') {
        const w = (y1 - y0) * rt, c = (s0.x0 + s0.x1) / 2; x0 = c - w / 2; x1 = c + w / 2;
      } else {
        const hh = (x1 - x0) / rt, c = (s0.y0 + s0.y1) / 2; y0 = c - hh / 2; y1 = c + hh / 2;
      }
    }
    sel = { x0, y0, x1, y1 };
  }
  requestDraw(); updateExportUI();
});
cv.addEventListener('pointerup', () => {
  if (drag && drag.kind === 'new' && sel && (sel.x1 - sel.x0) * Sof(view.z) < 8) sel = null;
  drag = null; cv.style.cursor = mode === 'select' ? 'crosshair' : 'grab'; updateExportUI(); requestDraw();
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const [wx, wy] = s2w(x, y);
  view.z = Math.max(2, Math.min(21, view.z - e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  const S = Sof(view.z); view.cx = wx - (x - W / 2) / S; view.cy = wy - (y - H / 2) / S;
  scheduleRender(); 
}, { passive: false });
addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); } if (e.key === 'Escape') setMode('pan'); });
addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; cv.style.cursor = mode === 'select' ? 'crosshair' : 'grab'; } });
addEventListener('resize', resize);

function setMode(m) {
  mode = m; $('selbtn').classList.toggle('on', m === 'select');
  cv.style.cursor = m === 'select' ? 'crosshair' : 'grab';
}
$('selbtn').onclick = () => {
  if (mode === 'select') return setMode('pan');
  setMode('select');
  if (!sel) { // default selection: centered 70% of viewport
    const w = W * 0.6, h = H * 0.6, [a, b] = s2w(W / 2 - w / 2, H / 2 - h / 2), [c, d] = s2w(W / 2 + w / 2, H / 2 + h / 2);
    sel = { x0: a, y0: b, x1: c, y1: d }; fitRatio(ratio()); updateExportUI(); requestDraw();
  }
};
$('clrbtn').onclick = () => { sel = null; updateExportUI(); requestDraw(); };
$('ratio').onchange = () => { fitRatio(ratio()); updateExportUI(); requestDraw(); };
$('px').onchange = () => { updateExportUI(); requestDraw(); };
function updateExportUI() {
  $('exbtn').disabled = !sel;
  const [w, h] = exportSize();
  $('selhint').textContent = sel ? `Selection → ${w} × ${h} px (${(w * h / 1e6).toFixed(1)} MP)` : 'Click “Select area”, then drag on the map. Drag inside to move, handles to resize. Hold Space to pan.';
}

/* ---------- export ---------- */
function drawTitle(g, PW, PH) {
  const title = $('title').value.trim(), sub = $('subtitle').value.trim();
  if (!title && !sub) return;
  const m = PW * 0.05, fs = Math.min(PW, PH) * 0.05, light = isLight();
  const grad = g.createLinearGradient(0, PH - fs * 5, 0, PH);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, light ? 'rgba(239,236,228,.85)' : 'rgba(0,0,0,.75)');
  g.fillStyle = grad; g.fillRect(0, PH - fs * 5, PW, fs * 5);
  g.fillStyle = light ? '#111' : '#fff'; g.textBaseline = 'alphabetic';
  let y = PH - m * 0.7;
  if (sub) { g.font = `300 ${fs * 0.42}px system-ui, sans-serif`; g.letterSpacing = `${fs * 0.08}px`; g.globalAlpha = .75; g.fillText(sub.toUpperCase(), m, y); g.globalAlpha = 1; y -= fs * 0.75; }
  if (title) { g.font = `700 ${fs}px system-ui, sans-serif`; g.letterSpacing = `${fs * 0.04}px`; g.fillText(title.toUpperCase(), m, y); }
  g.letterSpacing = '0px';
}

const status = t => $('status').textContent = t || '';
$('exbtn').onclick = async () => {
  if (!sel) return;
  const btn = $('exbtn'); btn.disabled = true;
  try {
    const [PW, PH] = exportSize();
    const selW = (sel.x1 - sel.x0), cx = (sel.x0 + sel.x1) / 2, cy = (sel.y0 + sel.y1) / 2;
    const S = PW / selW;                      // px per world unit at export
    const k = PW / (selW * Sof(view.z));      // export px per preview css px
    const o = opts(), es = +$('exscale').value; o.width *= es; o.grad *= es; const base = baseT(), useBase = $('exbase').checked && base !== 'none';
    status('Rendering heat…'); await new Promise(r => setTimeout(r, 30));
    const hc = document.createElement('canvas');
    renderHeat(hc, PW, PH, cx, cy, S, k, o);
    status(`Line width ${(o.width * k).toFixed(1)} px`); await new Promise(r => setTimeout(r, 30));

    const out = document.createElement('canvas'); out.width = PW; out.height = PH;
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.fillStyle = isLight() ? BG.light : BG.dark; g.fillRect(0, 0, PW, PH);
    if (useBase) {
      const list = tilesForView(base, cx, cy, S, PW, PH, true);
      let done = 0; status(`Loading map tiles 0/${list.length}…`);
      if (list.length > 600) status(`Many tiles (${list.length}) — this may take a while…`);
      const ents = await Promise.all(list.map(t => new Promise(res => {
        const e = getTile(t.url, () => res(e)); if (e.done) res(e);
      }).then(e => { status(`Loading map tiles ${++done}/${list.length}…`); return e; })));
      g.globalAlpha = +$('dim').value;
      list.forEach((t, i) => { if (ents[i].ok) g.drawImage(ents[i].img, t.px, t.py, t.ts + 0.6, t.ts + 0.6); });
      g.globalAlpha = 1;
    }
    g.drawImage(hc, 0, 0); hc.width = hc.height = 1;
    drawTitle(g, PW, PH);
    status('Encoding PNG…'); await new Promise(r => setTimeout(r, 30));
    const blob = await new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('encode failed — try a smaller size')), 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `heatmap_${PW}x${PH}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    status(`Done — ${(blob.size / 1e6).toFixed(1)} MB, ${PW}×${PH}px`);
  } catch (err) { console.error(err); status('Export failed: ' + err.message); }
  btn.disabled = !sel;
};


/* ---------- animation export ---------- */
let animCancel = false;
$('vidbtn').onclick = async () => {
  const btn = $('vidbtn');
  if (btn.dataset.run) { animCancel = true; return; }
  if (!window.MediaRecorder) return status('MediaRecorder not supported in this browser.');
  btn.dataset.run = 1; btn.textContent = 'Cancel'; animCancel = false; $('exbtn').disabled = true;
  try { await exportVideo(); } catch (err) { console.error(err); status('Video export failed: ' + err.message); }
  delete btn.dataset.run; btn.textContent = 'Export video'; $('exbtn').disabled = !sel;
};
async function exportVideo() {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const pad = (n, w) => String(n).padStart(w, ' ');
  // region: selection, or current viewport
  const Sv = Sof(view.z);
  const R = sel || { x0: view.cx - W / 2 / Sv, x1: view.cx + W / 2 / Sv, y0: view.cy - H / 2 / Sv, y1: view.cy + H / 2 / Sv };
  const selW = R.x1 - R.x0, selH = R.y1 - R.y0, cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
  const L = +$('vpx').value, even = v => Math.max(2, Math.round(v / 2) * 2);
  const PW = selW >= selH ? even(L) : even(L * selW / selH), PH = selW >= selH ? even(L * selH / selW) : even(L);
  const S = PW / selW, k = PW / (selW * Sv), es = +$('exscale').value;
  const o = opts(); o.width *= es; o.grad *= es;
  const fps = +$('fps').value, dur = Math.max(1, +$('durn').value || +$('dur').value), hold = Math.round(fps * 2);
  const nFrames = Math.round(dur * fps);
  const base = baseT(), useBase = $('exbase').checked && base !== 'none', light = isLight();
  const mg = o.width * k / S * 2;
  const tracks = TR.filter(t => visible(t) && inRect(t, R.x0, R.y0, R.x1, R.y1, mg)).sort((a, b) => a.ts - b.ts);
  if (!tracks.length) return status('No visible activities in this area.');

  // static background (+ tiles)
  const bg = document.createElement('canvas'); bg.width = PW; bg.height = PH;
  const bgc = bg.getContext('2d'); bgc.fillStyle = light ? BG.light : BG.dark; bgc.fillRect(0, 0, PW, PH);
  if (useBase) {
    const list = tilesForView(base, cx, cy, S, PW, PH, false); let done = 0;
    const ents = await Promise.all(list.map(t => new Promise(res => { const e = getTile(t.url, () => res(e)); if (e.done) res(e); })
      .then(e => { status(`Loading map tiles ${pad(++done, String(list.length).length)}/${list.length}…`); return e; })));
    bgc.globalAlpha = +$('dim').value;
    list.forEach((t, i) => { if (ents[i].ok) bgc.drawImage(ents[i].img, t.px, t.py, t.ts + 0.6, t.ts + 0.6); });
    bgc.globalAlpha = 1;
  }
  // accumulation (gray), work (colorized) and output canvases
  const acc = document.createElement('canvas'); acc.width = PW; acc.height = PH;
  const a = acc.getContext('2d'); a.fillStyle = '#000'; a.fillRect(0, 0, PW, PH);
  a.globalCompositeOperation = 'lighter'; a.lineJoin = a.lineCap = 'round';
  a.lineWidth = o.width * k; a.strokeStyle = `rgba(255,255,255,${o.bright})`;
  const work = document.createElement('canvas'); work.width = PW; work.height = PH;
  const w = work.getContext('2d');
  const out = document.createElement('canvas'); out.width = PW; out.height = PH;
  const g = out.getContext('2d');

  // Preferred sink: WebCodecs (deterministic frame times, faster than real time). Fallback: MediaRecorder.
  let sink = await makeWebCodecsSink(PW, PH, fps);
  if (!sink) sink = makeRecorderSink(out, PW, PH, fps);

  const showDate = $('adate').checked, hl = $('ahl').checked, HL = Math.max(2, Math.min(Math.round(fps * 0.8), Math.round(10 * nFrames / tracks.length)));
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const isoDate = ts => new Date(ts * 1000).toISOString().slice(0, 10);
  const total = nFrames + hold; let drawnN = 0;
  const addedAt = []; // frame index per track
  sink.start();
  for (let f = 0; f < total; f++) {
    if (animCancel) break;
    const target = Math.min(tracks.length, Math.round(tracks.length * Math.min(1, (f + 1) / nFrames)));
    while (drawnN < target) { strokeTrack(a, tracks[drawnN], cx, cy, S, PW, PH); addedAt[drawnN] = f; drawnN++; }
    // compose
    w.globalCompositeOperation = 'copy'; w.drawImage(acc, 0, 0); w.globalCompositeOperation = 'source-over';
    applyGlow(work, PW, PH, k, o); colorize(work, PW, PH, o.lut);
    g.globalAlpha = 1; g.drawImage(bg, 0, 0); g.drawImage(work, 0, 0);
    if (hl) {
      g.lineJoin = g.lineCap = 'round'; g.lineWidth = o.width * k * 1.6;
      for (let i = drawnN - 1; i >= 0 && f - addedAt[i] < HL; i--) {
        g.strokeStyle = `rgba(255,255,255,${(1 - (f - addedAt[i]) / HL) * 0.9})`;
        strokeTrack(g, tracks[i], cx, cy, S, PW, PH);
      }
    }
    drawTitle(g, PW, PH);
    if (showDate && drawnN) {
      const fs = Math.min(PW, PH) * 0.035, m = PW * 0.04;
      g.font = `600 ${fs}px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillStyle = light ? '#111' : '#fff'; g.letterSpacing = `${fs * 0.05}px`;
      g.fillText(isoDate(tracks[drawnN - 1].ts), PW - m, PH - m * 0.8);
      g.globalAlpha = .6; g.font = `400 ${fs * 0.55}px ${MONO}`;
      const nw = String(tracks.length).length;
      g.fillText(`${pad(drawnN, nw)} / ${tracks.length} ACTIVITIES`, PW - m, PH - m * 0.8 - fs * 1.1);
      g.globalAlpha = 1; g.textAlign = 'left'; g.letterSpacing = '0px';
    }
    await sink.frame(out, f);
    status(`Encoding frame ${pad(f + 1, String(total).length)}/${total}…${sink.realtime ? ' (real time, keep this tab visible)' : ''}`);
    await new Promise(r => setTimeout(r, 0));
  }
  if (animCancel) { sink.abort(); return status('Cancelled.'); }
  status('Finalizing…');
  const { blob, ext } = await sink.finish();
  const el = document.createElement('a'); el.href = URL.createObjectURL(blob);
  el.download = `heatmap_${PW}x${PH}.${ext}`; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 20000);
  status(`Done — ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}, ${PW}×${PH}, ${(total / fps).toFixed(0)} s`);
}

function makeRecorderSink(out, PW, PH, fps) {
  const stream = out.captureStream(fps);
  const cands = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = cands.find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(60e6, PW * PH * fps * 0.12) });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r); let t0 = 0;
  return {
    realtime: true,
    start() { rec.start(250); t0 = performance.now(); },
    async frame(_, f) { const wait = t0 + (f + 1) * 1000 / fps - performance.now(); await new Promise(r => setTimeout(r, Math.max(0, wait))); },
    abort() { try { rec.stop(); } catch (e) {} },
    async finish() { await new Promise(r => setTimeout(r, 300)); rec.stop(); await stopped;
      return { blob: new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext: (rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm' }; }
  };
}

async function makeWebCodecsSink(PW, PH, fps) {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  let cfg = null, codecId = '';
  for (const [codec, id] of [['vp09.00.51.08', 'V_VP9'], ['vp8', 'V_VP8']]) {
    const c = { codec, width: PW, height: PH, framerate: fps, bitrate: Math.min(60e6, Math.round(PW * PH * fps * 0.1)), latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; codecId = id; break; } } catch (e) {}
  }
  if (!cfg) return null;
  const frames = []; let err = null;
  const enc = new VideoEncoder({ output: ch => { const d = new Uint8Array(ch.byteLength); ch.copyTo(d); frames.push({ t: Math.round(ch.timestamp / 1000), key: ch.type === 'key', d }); }, error: e => err = e });
  enc.configure(cfg);
  return {
    realtime: false,
    start() {},
    async frame(canvas, f) {
      if (err) throw err;
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
      const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: f % (fps * 2) === 0 }); vf.close();
    },
    abort() { try { enc.close(); } catch (e) {} },
    async finish() {
      await enc.flush(); enc.close(); if (err) throw err;
      return { blob: muxWebM(frames, codecId, PW, PH, Math.round(frames.length * 1000 / fps)), ext: 'webm' };
    }
  };
}

// minimal WebM (Matroska) muxer, one video track
function muxWebM(frames, codecId, PW, PH, durMs) {
  const te = new TextEncoder();
  const idb = id => { const b = []; while (id > 0) { b.unshift(id & 255); id = Math.floor(id / 256); } return b; };
  const el = (id, payload) => { // payload: Uint8Array | array of parts
    const parts = Array.isArray(payload) ? payload : [payload];
    const len = parts.reduce((s, p) => s + p.length, 0);
    const ib = idb(id), head = new Uint8Array(ib.length + 8); head.set(ib); head[ib.length] = 0x01;
    let n = len; for (let q = ib.length + 7; q > ib.length; q--) { head[q] = n % 256; n = Math.floor(n / 256); }
    return [head, ...parts];
  };
  const flat = parts => parts.flat(Infinity);
  const cat = parts => { const fl = flat(parts), len = fl.reduce((s, p) => s + p.length, 0), o = new Uint8Array(len); let p = 0; for (const x of fl) { o.set(x, p); p += x.length; } return o; };
  const E = (id, payload) => cat(el(id, payload));
  const uint = (v, n = 0) => { const b = []; while (v > 0 || b.length < Math.max(1, n)) { b.unshift(v % 256); v = Math.floor(v / 256); } return new Uint8Array(b); };
  const f64 = v => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return b; };
  const str = s => te.encode(s);

  const ebml = E(0x1A45DFA3, [E(0x4286, uint(1)), E(0x42F7, uint(1)), E(0x42F2, uint(4)), E(0x42F3, uint(8)), E(0x4282, str('webm')), E(0x4287, uint(4)), E(0x4285, uint(2))]);
  const info = E(0x1549A966, [E(0x2AD7B1, uint(1000000)), E(0x4D80, str('heatmap')), E(0x5741, str('heatmap')), E(0x4489, f64(durMs))]);
  const tracks = E(0x1654AE6B, E(0xAE, [E(0xD7, uint(1)), E(0x73C5, uint(1)), E(0x83, uint(1)), E(0x86, str(codecId)), E(0xE0, [E(0xB0, uint(PW)), E(0xBA, uint(PH))])]));
  // clusters: start new one at each keyframe
  const clusters = []; let cur = null;
  for (const fr of frames) {
    if (!cur || (fr.key && fr.t > cur.t0)) { cur = { t0: fr.t, blocks: [] }; clusters.push(cur); }
    const rel = fr.t - cur.t0;
    const blk = new Uint8Array(4 + fr.d.length); blk[0] = 0x81; blk[1] = (rel >> 8) & 255; blk[2] = rel & 255; blk[3] = fr.key ? 0x80 : 0; blk.set(fr.d, 4);
    cur.blocks.push(E(0xA3, blk));
  }
  const cl = clusters.map(c => E(0x1F43B675, [E(0xE7, uint(c.t0)), ...c.blocks]));
  const seg = E(0x18538067, [info, tracks, ...cl]);
  return new Blob([ebml, seg], { type: 'video/webm' });
}

/* ---------- UI setup ---------- */
function chip(parent, label, on, cb) {
  const c = document.createElement('span'); c.className = 'chip' + (on ? ' on' : ''); c.textContent = label;
  c.onclick = () => { c.classList.toggle('on'); cb(c.classList.contains('on')); }; parent.appendChild(c);
}
function bindRange(id) { const el = $(id), v = el.parentElement.querySelector('.v'); const f = () => v.textContent = (+el.value).toFixed(el.step < 0.1 ? 2 : 1); f(); el.addEventListener('input', () => { f(); scheduleRender(60); }); }

$('dur').oninput = () => { $('durn').value = $('dur').value; };
$('durn').oninput = () => { const v = +$('durn').value; if (v >= 5 && v <= 120) $('dur').value = v; };

function refreshChips() {
  $('types').innerHTML = ''; $('years').innerHTML = ''; state.types.clear(); state.years.clear();
  const counts = {}, yrs = {};
  for (const t of TR) { counts[t.t] = (counts[t.t] || 0) + 1; yrs[t.y] = (yrs[t.y] || 0) + 1; }
  const order = TYPES.map((n, i) => i).sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  for (const i of order) { if (!counts[i]) continue; state.types.add(i); chip($('types'), `${TYPES[i].replace('_', ' ')} · ${counts[i]}`, true, on => { on ? state.types.add(i) : state.types.delete(i); upd(); }); }
  for (const y of Object.keys(yrs).map(Number).sort()) { state.years.add(y); chip($('years'), y || '?', true, on => { on ? state.years.add(y) : state.years.delete(y); upd(); }); }
  if (!TR.length) return;
  const cxs = TR.map(t => (t.x0 + t.x1) / 2).sort((a, b) => a - b), cys = TR.map(t => (t.y0 + t.y1) / 2).sort((a, b) => a - b);
  view.cx = cxs[cxs.length >> 1]; view.cy = cys[cys.length >> 1]; view.z = 11;
  resize(); upd();
}
function setupUI() {
  for (const n of Object.keys(CMAPS)) $('cmap').add(new Option(n, n));
  $('cmap').onchange = () => { LUT = makeLUT($('cmap').value); $('cmprev').style.background = cmapGradient($('cmap').value); scheduleRender(0); };
  $('cmap').value = 'Inferno fire'; LUT = makeLUT('Inferno fire'); $('cmprev').style.background = cmapGradient('Inferno fire');
  ['width', 'bright', 'glow', 'grad'].forEach(bindRange);
  { const el = $('exscale'), v = el.parentElement.querySelector('.v'); const f = () => v.textContent = '×' + (+el.value).toFixed(2); f(); el.oninput = f; }
  const dimv = $('dim').parentElement.querySelector('.v'); dimv.textContent = (+$('dim').value).toFixed(2);
  $('dim').oninput = () => { dimv.textContent = (+$('dim').value).toFixed(2); requestDraw(); };
  $('base').add(new Option('None (solid)', 'none'));
  PRESETS.forEach((p, i) => $('base').add(new Option(p[0], 'p' + i)));
  $('base').add(new Option('Custom URL…', 'custom'));
  const ls = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  $('tkey').value = ls('tileKey'); $('turl').value = ls('tileUrl');
  if (ls('tileBase')) $('base').value = ls('tileBase');
  $('tlight').checked = ls('tileLight') === '1';
  $('base').onchange = () => {
    const v = $('base').value;
    if (v[0] === 'p') { const p = PRESETS[+v.slice(1)]; $('turl').value = p[1]; $('tlight').checked = !!p[2]; }
    lset('tileBase', v); lset('tileUrl', $('turl').value); lset('tileLight', $('tlight').checked ? '1' : '');
    syncBaseUI(); requestDraw();
  };
  $('turl').onchange = () => { lset('tileUrl', $('turl').value); syncBaseUI(); requestDraw(); };
  $('tkey').oninput = () => { lset('tileKey', $('tkey').value); syncBaseUI(); requestDraw(); };
  $('tlight').onchange = () => { lset('tileLight', $('tlight').checked ? '1' : ''); requestDraw(); };
  syncBaseUI();

  refreshChips();
}
function upd() {
  const n = TR.filter(visible).length;
  $('count').textContent = `${n} of ${TR.length} activities`;
  scheduleRender(0);
}

/* ---------- import (all client side) ---------- */
let busy = false;
function importZip(file) {
  if (busy || !file) return;
  busy = true; $('upbtn').disabled = true;
  const st = m => { $('upstat').textContent = m; const lm = $('loadmsg'); if (lm && $('loading')?.dataset.up) lm.textContent = m; };
  const fin = () => { busy = false; $('upbtn').disabled = false; w.terminate(); };
  const w = new Worker('worker.js');
  st('Reading ' + file.name + '…');
  w.onmessage = async ev => {
    const m = ev.data;
    if (m.progress) return st(m.progress);
    fin();
    if (m.error) return st('Failed: ' + m.error);
    try { loadData(m.done); await start(); saveData(m.done); st(`Loaded ${TR.length} activities (stored in this browser only).`); }
    catch (e) { st('Failed: ' + e.message); }
  };
  w.onerror = e => { fin(); st('Failed: ' + (e.message || 'worker error')); };
  w.postMessage(file);
}
$('upbtn').onclick = () => $('upfile').click();
$('upfile').onchange = () => { importZip($('upfile').files[0]); $('upfile').value = ''; };
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importZip(f); });

let uiReady = false;
async function start() {
  if (!uiReady) { uiReady = true; setupUI(); } else refreshChips();
  const l = $('loading'); if (l) l.remove();
}
(async () => {
  let buf = null; try { buf = await readData(); } catch (e) {}
  if (buf) { try { loadData(buf); return start(); } catch (e) {} }
  $('count').textContent = 'no data yet';
  $('loading').dataset.up = '1';
  $('loadmsg').innerHTML = 'No data yet.<br><br><button class="p" id="upbtn2">Choose your Strava export .zip</button><br><br><span style="font-size:12px">or drop the file anywhere.<br>It is processed in your browser and never uploaded.</span><br><br><span style="font-size:12px">Don\'t have it yet? <a href="https://www.strava.com/athlete/download_my_account" target="_blank" rel="noopener noreferrer" style="color:var(--acc)">Request your Strava export</a></span>';
  $('upbtn2').onclick = () => $('upfile').click();
})();
