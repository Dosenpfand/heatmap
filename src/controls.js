import { ui, valueLabel } from './dom.js';
import { CMAPS, cmapGradient, makeLUT } from './lib/colormap.js';
import { PRESETS } from './lib/tiles.js';
import { requestDraw, resize, scheduleRender } from './map.js';
import { hasDefaultKey, setDefaultKey, tileTemplate } from './settings.js';
import { state, updateStats } from './state.js';

const DEFAULT_CMAP = 'Inferno fire';

/** localStorage that tolerates being unavailable (private mode, blocked storage). */
const prefs = {
  get(/** @type {string} */ key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  set(/** @type {string} */ key, /** @type {string} */ value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

function chip(
  /** @type {HTMLElement} */ parent,
  /** @type {string} */ label,
  /** @type {(on: boolean) => void} */ onChange,
) {
  const c = document.createElement('span');
  c.className = 'chip on';
  c.textContent = label;
  c.addEventListener('click', () => {
    c.classList.toggle('on');
    onChange(c.classList.contains('on'));
  });
  parent.appendChild(c);
}

/** Shows a range input's value next to it and re-renders on change. */
function bindRange(/** @type {HTMLInputElement} */ el) {
  const label = valueLabel(el);
  const show = () => (label.textContent = (+el.value).toFixed(+el.step < 0.1 ? 2 : 1));
  show();
  el.addEventListener('input', () => {
    show();
    scheduleRender(60);
  });
}

/** Updates the activity count and re-renders after a filter change. */
function onFilterChange() {
  const { tracks } = state.data;
  updateStats();
  const total = tracks.filter((t) => t.n).length;
  ui.count.textContent = `${state.stats.count} of ${total} activities`;
  scheduleRender(0);
}

/** @param {Set<number>} set */
const toggler = (set, /** @type {number} */ value) => (/** @type {boolean} */ on) => {
  if (on) set.add(value);
  else set.delete(value);
  onFilterChange();
};

/** Rebuilds the type/year chips for the loaded data and centers the view on it. */
export function refreshChips() {
  const { tracks, types } = state.data;
  ui.types.replaceChildren();
  ui.years.replaceChildren();
  state.shownTypes.clear();
  state.shownYears.clear();
  /** @type {Map<number, number>} */
  const typeCounts = new Map();
  /** @type {Map<number, number>} */
  const yearCounts = new Map();
  for (const t of tracks) {
    typeCounts.set(t.t, (typeCounts.get(t.t) ?? 0) + 1);
    yearCounts.set(t.y, (yearCounts.get(t.y) ?? 0) + 1);
  }
  const byCount = [...typeCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [i, n] of byCount) {
    state.shownTypes.add(i);
    chip(ui.types, `${types[i].replace('_', ' ')} · ${n}`, toggler(state.shownTypes, i));
  }
  for (const y of [...yearCounts.keys()].sort((a, b) => a - b)) {
    state.shownYears.add(y);
    chip(ui.years, String(y || '?'), toggler(state.shownYears, y));
  }
  if (!tracks.length) return;
  // center on the median track
  const median = (/** @type {number[]} */ v) => v.sort((a, b) => a - b)[v.length >> 1];
  state.view.cx = median(tracks.map((t) => (t.x0 + t.x1) / 2));
  state.view.cy = median(tracks.map((t) => (t.y0 + t.y1) / 2));
  state.view.z = 11;
  resize();
  onFilterChange();
}

function syncBaseUI() {
  ui.tbox.style.display = ui.base.value === 'none' ? 'none' : '';
  ui.keyrow.style.display = ui.turl.value.includes('{key}') ? '' : 'none';
  ui.tkey.placeholder = hasDefaultKey() ? 'optional override' : 'your key';
  ui.status.textContent = ui.base.value !== 'none' && !tileTemplate() ? 'Enter an API key to show the basemap.' : '';
}

function setColormap(/** @type {string} */ name) {
  state.lut = makeLUT(name);
  ui.cmprev.style.background = cmapGradient(name);
}

function setupBasemap() {
  ui.base.add(new Option('None (solid)', 'none'));
  PRESETS.forEach((p, i) => ui.base.add(new Option(p.name, 'p' + i)));
  ui.base.add(new Option('Custom URL…', 'custom'));
  ui.tkey.value = prefs.get('tileKey');
  ui.turl.value = prefs.get('tileUrl');
  if (prefs.get('tileBase')) ui.base.value = prefs.get('tileBase');
  else {
    // First visit: default to CARTO Dark.
    ui.base.value = 'p0';
    ui.turl.value = PRESETS[0].url;
    ui.tlight.checked = PRESETS[0].light;
  }
  fetch('/config.json')
    .then((r) => r.json())
    .then((c) => {
      if (typeof c.defaultKey !== 'string' || !c.defaultKey) return;
      setDefaultKey(c.defaultKey);
      syncBaseUI();
      requestDraw();
    })
    .catch(() => {});
  ui.tlight.checked = prefs.get('tileLight') === '1';

  const saveLight = () => prefs.set('tileLight', ui.tlight.checked ? '1' : '');
  ui.base.addEventListener('change', () => {
    const preset = PRESETS[+ui.base.value.slice(1)];
    if (ui.base.value.startsWith('p') && preset) {
      ui.turl.value = preset.url;
      ui.tlight.checked = preset.light;
    }
    prefs.set('tileBase', ui.base.value);
    prefs.set('tileUrl', ui.turl.value);
    saveLight();
    syncBaseUI();
    requestDraw();
  });
  ui.turl.addEventListener('change', () => {
    prefs.set('tileUrl', ui.turl.value);
    syncBaseUI();
    requestDraw();
  });
  ui.tkey.addEventListener('input', () => {
    prefs.set('tileKey', ui.tkey.value);
    syncBaseUI();
    requestDraw();
  });
  ui.showstats.checked = prefs.get('showStats') !== '0';
  ui.showstats.addEventListener('change', () => {
    prefs.set('showStats', ui.showstats.checked ? '1' : '0');
    requestDraw();
  });
  ui.tlight.addEventListener('change', () => {
    saveLight();
    requestDraw();
  });
  syncBaseUI();
}

/** One-time setup of the settings panel (called once data is first available). */
export function setupControls() {
  for (const name of Object.keys(CMAPS)) ui.cmap.add(new Option(name, name));
  ui.cmap.addEventListener('change', () => {
    setColormap(ui.cmap.value);
    scheduleRender(0);
  });
  ui.cmap.value = DEFAULT_CMAP;
  setColormap(DEFAULT_CMAP);

  for (const el of [ui.width, ui.bright, ui.glow, ui.grad]) bindRange(el);
  const exLabel = valueLabel(ui.exscale);
  const showExScale = () => (exLabel.textContent = '×' + (+ui.exscale.value).toFixed(2));
  showExScale();
  ui.exscale.addEventListener('input', showExScale);
  const dimLabel = valueLabel(ui.dim);
  const showDim = () => (dimLabel.textContent = (+ui.dim.value).toFixed(2));
  showDim();
  ui.dim.addEventListener('input', () => {
    showDim();
    requestDraw();
  });

  ui.dur.addEventListener('input', () => (ui.durn.value = ui.dur.value));
  ui.durn.addEventListener('input', () => {
    const v = +ui.durn.value;
    if (v >= 5 && v <= 120) ui.dur.value = String(v);
  });

  setupBasemap();
  refreshChips();
}
