// Runs entirely in the browser (Web Worker). Input: the activity export .zip File. Output: dataset ArrayBuffer.
import { parseFit, parseGpx, normType } from './lib/activity.js';
import { encodeDataset, COORD_SCALE } from './lib/dataset.js';
import { rdp } from './lib/geo.js';
import { inflate, listZip, readEntry } from './lib/zip.js';

/** @typedef {{onmessage: ((ev: MessageEvent) => void) | null, postMessage(msg: unknown, transfer?: Transferable[]): void}} WorkerScope */

const min = (/** @type {number[]} */ a) => a.reduce((m, v) => Math.min(m, v), Infinity);
const max = (/** @type {number[]} */ a) => a.reduce((m, v) => Math.max(m, v), -Infinity);
const messageOf = (/** @type {unknown} */ e) => (e instanceof Error ? e.message : String(e));
const ACTIVITY_RE = /(?:^|\/)activities\/[^/]+\.(?:gpx|gpx\.gz|fit|fit\.gz)$/i;

/**
 * @param {Blob} file
 * @param {import('./lib/zip.js').ZipEntry} entry
 */
async function parseEntry(file, entry) {
  let buf = await readEntry(file, entry);
  if (/\.gz$/i.test(entry.name)) buf = await inflate(new Blob([buf]), 'gzip');
  return /\.fit(\.gz)?$/i.test(entry.name) ? parseFit(buf) : parseGpx(new TextDecoder().decode(buf));
}

/**
 * Builds the binary dataset from an export zip.
 * @param {Blob} file
 * @param {(done: number, total: number) => void} [progress]
 * @returns {Promise<ArrayBuffer>}
 */
export async function build(file, progress = () => {}) {
  const entries = (await listZip(file)).filter((e) => ACTIVITY_RE.test(e.name));
  if (!entries.length) {
    throw new Error('No activities/ folder with .gpx/.fit files found. Is this an activity export zip?');
  }
  /** @type {string[]} */
  const types = [];
  /** @type {number[][]} */
  const tracks = [];
  /** @type {number[]} */
  const pts = [];
  for (const [n, entry] of entries.entries()) {
    try {
      const act = await parseEntry(file, entry);
      if (act) {
        const name = normType(act.type);
        let ti = types.indexOf(name);
        if (ti < 0) ti = types.push(name) - 1;
        for (const { lon, lat } of act.segs) {
          const idx = rdp(lon, lat);
          if (idx.length < 2) continue;
          const xs = idx.map((i) => Math.round(lon[i] * COORD_SCALE));
          const ys = idx.map((i) => Math.round(lat[i] * COORD_SCALE));
          const offset = pts.length / 2;
          xs.forEach((x, k) => pts.push(x, ys[k]));
          tracks.push([ti, act.year, offset, idx.length, min(xs), min(ys), max(xs), max(ys), Math.round(act.ts)]);
        }
      }
    } catch (err) {
      console.warn('skip', entry.name, messageOf(err));
    }
    if (n % 10 === 0) progress(n, entries.length);
  }
  if (!tracks.length) throw new Error('Found activity files but none contained GPS tracks.');
  return encodeDataset({ types, tracks }, pts);
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  const scope = /** @type {WorkerScope} */ (/** @type {unknown} */ (self));
  scope.onmessage = async (ev) => {
    try {
      const buf = await build(ev.data, (i, n) => scope.postMessage({ progress: `Processing ${i}/${n} activities` }));
      scope.postMessage({ done: buf }, [buf]);
    } catch (e) {
      scope.postMessage({ error: messageOf(e) });
    }
  };
}
