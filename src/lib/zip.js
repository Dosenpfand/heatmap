/** Minimal zip reader: random access via Blob.slice, zip64 aware, never reads the whole file. */

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;
const MAX32 = 0xffffffff;

/** @typedef {{name: string, method: number, csize: number, usize: number, off: number}} ZipEntry */

const u64 = (/** @type {DataView} */ dv, /** @type {number} */ o) => Number(dv.getBigUint64(o, true));
const readAt = async (/** @type {Blob} */ file, /** @type {number} */ off, /** @type {number} */ len) =>
  new DataView(await file.slice(off, off + len).arrayBuffer());

/**
 * @param {Blob} file
 * @returns {Promise<ZipEntry[]>}
 */
export async function listZip(file) {
  const tailLen = Math.min(file.size, 65557);
  const tailStart = file.size - tailLen;
  const tail = await readAt(file, tailStart, tailLen);
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      e = i;
      break;
    }
  }
  if (e < 0) throw new Error('Not a zip file');
  let count = tail.getUint16(e + 10, true);
  let cdSize = tail.getUint32(e + 12, true);
  let cdOff = tail.getUint32(e + 16, true);
  if (count === 0xffff || cdSize === MAX32 || cdOff === MAX32) {
    const loc = await readAt(file, tailStart + e - 20, 20);
    if (loc.getUint32(0, true) !== SIG_EOCD64_LOCATOR) throw new Error('Bad zip64 zip');
    const z = await readAt(file, u64(loc, 8), 56);
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOff = u64(z, 48);
  }
  const cd = await readAt(file, cdOff, cdSize);
  const bytes = new Uint8Array(cd.buffer);
  const td = new TextDecoder();
  /** @type {ZipEntry[]} */
  const out = [];
  for (let p = 0, i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true);
    let usize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let off = cd.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // zip64 extended info: only the fields that overflowed are present, in this order
    for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end;) {
      const id = cd.getUint16(x, true);
      const size = cd.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (usize === MAX32) ((usize = u64(cd, q)), (q += 8));
        if (csize === MAX32) ((csize = u64(cd, q)), (q += 8));
        if (off === MAX32) off = u64(cd, q);
      }
      x += 4 + size;
    }
    out.push({ name, method, csize, usize, off });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * @param {Blob} blob
 * @param {CompressionFormat} format
 */
export const inflate = (blob, format) =>
  new Response(blob.stream().pipeThrough(new DecompressionStream(format))).arrayBuffer();

/**
 * @param {Blob} file
 * @param {ZipEntry} entry
 * @returns {Promise<ArrayBuffer>} the decompressed content of one entry
 */
export async function readEntry(file, entry) {
  const lh = await readAt(file, entry.off, 30);
  const start = entry.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const data = file.slice(start, start + entry.csize);
  if (entry.method === 0) return data.arrayBuffer();
  if (entry.method === 8) return inflate(data, 'deflate-raw');
  throw new Error(`unsupported zip compression ${entry.method}`);
}
