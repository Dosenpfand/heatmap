/**
 * Selection rectangle in world units, x0 < x1 and y0 < y1.
 * @typedef {{x0: number, y0: number, x1: number, y1: number}} Rect
 */

/**
 * Shrinks the selection around its center to the aspect ratio r (width / height). 0 = free.
 * @template {Rect | null} T
 * @param {T} sel
 * @param {number} r
 * @returns {T | Rect}
 */
export function fitRatio(sel, r) {
  if (!sel || !r) return sel;
  const cx = (sel.x0 + sel.x1) / 2;
  const cy = (sel.y0 + sel.y1) / 2;
  let w = sel.x1 - sel.x0;
  let h = sel.y1 - sel.y0;
  if (w / h > r) w = h * r;
  else h = w / r;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}

/**
 * Pixel size of an export whose long side is `longSide`.
 * @param {Rect | null} sel
 * @param {number} longSide
 * @returns {[number, number]}
 */
export function exportSize(sel, longSide) {
  if (!sel) return [0, 0];
  const w = sel.x1 - sel.x0;
  const h = sel.y1 - sel.y0;
  const short = (/** @type {number} */ v) => Math.max(1, Math.round((longSide * v) / Math.max(w, h)));
  return w >= h ? [longSide, short(h)] : [short(w), longSide];
}
