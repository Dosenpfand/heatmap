import { COORD_SCALE, decodeDataset } from './dataset.js';
import { mercX, mercY } from './geo.js';

/**
 * A track in world coordinates (unit square, see geo.js).
 * @typedef {object} Track
 * @property {number} t type index into `TrackData.types`
 * @property {number} y year
 * @property {number} o offset of the first point in `xs`/`ys`
 * @property {number} c point count
 * @property {number} ts start timestamp (seconds)
 * @property {number} x0 bounding box, x0 < x1, y0 < y1
 * @property {number} x1
 * @property {number} y0
 * @property {number} y1
 */

/**
 * @typedef {object} TrackData
 * @property {string[]} types
 * @property {Track[]} tracks
 * @property {Float64Array} xs projected x of every point
 * @property {Float64Array} ys projected y of every point
 */

/** Decodes a dataset buffer and projects all points to world coordinates. @returns {TrackData} */
export function loadTracks(/** @type {ArrayBuffer} */ buf) {
  const { meta, pts } = decodeDataset(buf);
  const n = pts.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = mercX(pts[2 * i] / COORD_SCALE);
    ys[i] = mercY(pts[2 * i + 1] / COORD_SCALE);
  }
  const tracks = meta.tracks.map(([t, y, o, c, x0, y0, x1, y1, ts]) => ({
    t,
    y,
    o,
    c,
    ts,
    // y flips under the projection, so the min/max latitudes swap
    x0: mercX(x0 / COORD_SCALE),
    x1: mercX(x1 / COORD_SCALE),
    y0: mercY(y1 / COORD_SCALE),
    y1: mercY(y0 / COORD_SCALE),
  }));
  return { types: meta.types, tracks, xs, ys };
}

/** Whether a track's bounding box intersects the rectangle grown by `margin`. */
export function inRect(
  /** @type {Track} */ t,
  /** @type {number} */ vx0,
  /** @type {number} */ vy0,
  /** @type {number} */ vx1,
  /** @type {number} */ vy1,
  /** @type {number} */ margin,
) {
  return !(t.x1 < vx0 - margin || t.x0 > vx1 + margin || t.y1 < vy0 - margin || t.y0 > vy1 + margin);
}
