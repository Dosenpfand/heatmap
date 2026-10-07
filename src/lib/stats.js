const R_EARTH = 6371008.8;
/** Elevation changes below this (meters) are treated as GPS/barometer noise. */
const ELEV_NOISE_M = 3;
/** Below this speed (m/s) a point-to-point step does not count as moving time. */
const MOVING_MS = 0.5;

/**
 * @typedef {object} Stats
 * @property {number} count activities
 * @property {number} dist meters
 * @property {number} gain elevation gain in meters
 * @property {number} time moving time in seconds
 * @property {number} days distinct days with at least one activity
 * @property {boolean} detailed false for data imported before distance/time were recorded
 */

/**
 * Distance, elevation gain and moving time of one recorded segment (full resolution).
 * `ele` and `t` (seconds) may contain NaN where unknown.
 * @param {ArrayLike<number>} lon
 * @param {ArrayLike<number>} lat
 * @param {ArrayLike<number>} [ele]
 * @param {ArrayLike<number>} [t]
 */
export function segmentStats(lon, lat, ele, t) {
  let dist = 0;
  let time = 0;
  for (let i = 1; i < lon.length; i++) {
    const p1 = (lat[i - 1] * Math.PI) / 180;
    const p2 = (lat[i] * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((lon[i] - lon[i - 1]) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const d = 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
    dist += d;
    if (t) {
      const dt = t[i] - t[i - 1];
      if (dt > 0 && d / dt >= MOVING_MS) time += dt;
    }
  }
  // elevation gain with hysteresis: only count a climb once it exceeds the noise threshold
  let gain = 0;
  if (ele) {
    let ref = NaN;
    for (let i = 0; i < ele.length; i++) {
      const e = ele[i];
      if (!Number.isFinite(e)) continue;
      if (Number.isNaN(ref)) ref = e;
      else if (e - ref >= ELEV_NOISE_M) {
        gain += e - ref;
        ref = e;
      } else if (ref - e >= ELEV_NOISE_M) ref = e;
    }
  }
  return { dist, gain, time };
}

/**
 * Aggregates tracks. A track carries stats only if it is the first segment of its activity (`n`).
 * @param {Iterable<{n: number, d: number, g: number, s: number, ts: number}>} tracks
 * @returns {Stats}
 */
export function sumStats(tracks) {
  const out = { count: 0, dist: 0, gain: 0, time: 0, days: 0, detailed: false };
  const days = new Set();
  for (const t of tracks) {
    if (!t.n) continue;
    out.count++;
    out.dist += t.d;
    out.gain += t.g;
    out.time += t.s;
    if (t.d > 0) out.detailed = true;
    if (t.ts > 0) days.add(Math.floor(t.ts / 86400));
  }
  out.days = days.size;
  return out;
}

/**
 * Running totals over tracks sorted by time, for animations.
 * @param {{n: number, d: number, g: number, s: number, ts: number}[]} sorted ascending by `ts`
 * @returns {(ts: number) => Stats} totals of everything that started at or before `ts`
 */
export function timeline(sorted) {
  const empty = { ...sumStats([]), detailed: sumStats(sorted).detailed };
  const prefix = sorted.map((_, i) => sumStats(sorted.slice(0, i + 1)));
  return (ts) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].ts <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo ? prefix[lo - 1] : { ...empty };
  };
}

const int = (/** @type {number} */ n) => Math.round(n).toLocaleString();

/** "12,345 km" */
export const formatDistance = (/** @type {number} */ m) => `${int(m / 1000)} km`;
/** "1,234 m" */
export const formatElevation = (/** @type {number} */ m) => `${int(m)} m`;
/** "1,234 h" for long totals, "1 h 05 m" below a day. */
export function formatDuration(/** @type {number} */ s) {
  if (s >= 86400) return `${int(s / 3600)} h`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')} m`;
}

/** The [label, value] pairs to display; distance/elevation/time only when the data has them. */
export function statItems(/** @type {Stats} */ s) {
  /** @type {[string, string][]} */
  const items = [['Activities', int(s.count)]];
  if (s.detailed) {
    items.push(['Distance', formatDistance(s.dist)], ['Elevation', formatElevation(s.gain)]);
    items.push(['Time', formatDuration(s.time)]);
  }
  if (s.days) items.push(['Active days', int(s.days)]);
  return items;
}
