/** Simplification tolerance in meters. */
export const TOLERANCE_M = 1.2;
const M_PER_DEG = 111320;

/** Web-mercator projection to the unit square ([0,1] x [0,1], y grows southwards). */
export const mercX = (/** @type {number} */ lon) => (lon + 180) / 360;
export const mercY = (/** @type {number} */ lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/**
 * Ramer–Douglas–Peucker line simplification.
 * @param {ArrayLike<number>} lon
 * @param {ArrayLike<number>} lat
 * @param {number} [tolerance] meters
 * @returns {number[]} sorted indices of the points to keep
 */
export function rdp(lon, lat, tolerance = TOLERANCE_M) {
  const n = lon.length;
  if (n < 3) return [...Array(n).keys()];
  const kx = Math.cos((lat[0] * Math.PI) / 180) * M_PER_DEG;
  const X = (/** @type {number} */ i) => lon[i] * kx;
  const Y = (/** @type {number} */ i) => lat[i] * M_PER_DEG;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  /** @type {[number, number][]} */
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = /** @type {[number, number]} */ (stack.pop());
    if (b <= a + 1) continue;
    const ax = X(a);
    const ay = Y(a);
    const dx = X(b) - ax;
    const dy = Y(b) - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = X(i) - ax;
      const py = Y(i) - ay;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tolerance) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return Array.from(keep.keys()).filter((i) => keep[i]);
}
