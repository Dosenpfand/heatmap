import { sumStats } from './lib/stats.js';
import { loadTracks } from './lib/tracks.js';

/** @typedef {import('./lib/selection.js').Rect} Rect */
/** @typedef {import('./lib/tracks.js').Track} Track */

/**
 * The single mutable application state.
 * @type {{
 *   data: import('./lib/tracks.js').TrackData,
 *   shownTypes: Set<number>,
 *   shownYears: Set<number>,
 *   view: {cx: number, cy: number, z: number},
 *   viewport: {w: number, h: number, dpr: number},
 *   sel: Rect | null,
 *   mode: 'pan' | 'select',
 *   lut: Uint32Array,
 *   stats: import('./lib/stats.js').Stats,
 * }}
 */
export const state = {
  data: { types: [], tracks: [], xs: new Float64Array(0), ys: new Float64Array(0) },
  shownTypes: new Set(),
  shownYears: new Set(),
  view: { cx: 0.5, cy: 0.5, z: 10 },
  viewport: { w: 0, h: 0, dpr: 1 },
  sel: null,
  mode: 'pan',
  lut: new Uint32Array(256),
  stats: sumStats([]),
};

export function setData(/** @type {ArrayBuffer} */ buf) {
  state.data = loadTracks(buf);
}

/** World units to screen px: the world is `scaleOf(z)` px wide at zoom z. */
export const scaleOf = (/** @type {number} */ z) => 256 * 2 ** z;

export const isVisible = (/** @type {Track} */ t) => state.shownTypes.has(t.t) && state.shownYears.has(t.y);
export const visibleTracks = () => state.data.tracks.filter(isVisible);
/** Recomputes the cached totals of the visible (filtered) activities. */
export const updateStats = () => (state.stats = sumStats(visibleTracks()));
