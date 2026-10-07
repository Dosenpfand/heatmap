/**
 * @typedef {object} TileEntry
 * @property {HTMLImageElement} img
 * @property {boolean} ok loaded successfully
 * @property {boolean} done finished loading (successfully or not)
 * @property {(() => void)[]} cbs
 */

/** @type {Map<string, TileEntry>} */
const cache = new Map();

/** Returns the cache entry for a tile, starting the load if needed; `onload` fires once it settles. */
export function getTile(/** @type {string} */ url, /** @type {(() => void) | undefined} */ onload) {
  let e = cache.get(url);
  if (!e) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    /** @type {TileEntry} */
    const entry = { img, ok: false, done: false, cbs: [] };
    e = entry;
    const settle = (/** @type {boolean} */ ok) => {
      entry.ok = ok;
      entry.done = true;
      for (const f of entry.cbs) f();
      entry.cbs = [];
    };
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = url;
    cache.set(url, e);
  }
  if (!e.done && onload) e.cbs.push(onload);
  return e;
}

/**
 * Loads all tiles of a list.
 * @param {{url: string}[]} list
 * @param {(done: number) => void} [onProgress] called with the number of settled tiles
 * @returns {Promise<TileEntry[]>} entries in list order
 */
export function loadTiles(list, onProgress) {
  let done = 0;
  return Promise.all(
    list.map(async (t) => {
      const e = await new Promise((resolve) => {
        const entry = getTile(t.url, () => resolve(entry));
        if (entry.done) resolve(entry);
      });
      onProgress?.(++done);
      return /** @type {TileEntry} */ (e);
    }),
  );
}

/**
 * Draws loaded tiles; `overlap` px are added to each tile to hide seams.
 * @param {CanvasRenderingContext2D} g
 * @param {{px: number, py: number, ts: number}[]} list
 * @param {TileEntry[]} entries entries in list order
 * @param {number} overlap
 */
export function drawTiles(g, list, entries, overlap) {
  list.forEach((t, i) => {
    if (entries[i].ok) g.drawImage(entries[i].img, t.px, t.py, t.ts + overlap, t.ts + overlap);
  });
}
