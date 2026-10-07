/**
 * Binary dataset layout (little endian):
 *   u32 metaLength | u32 padLength | meta JSON (utf-8) | padding | Int32 lon/lat pairs (degrees * 1e6)
 * `padding` aligns the point array to 4 bytes.
 *
 * Track tuple: [typeIndex, year, pointOffset, pointCount, minX, minY, maxX, maxY, timestamp]
 * (bbox in degrees * 1e6, pointOffset counted in points, not ints).
 */
export const COORD_SCALE = 1e6;

/** @param {{types: string[], tracks: number[][]}} meta @param {number[]} pts flat lon,lat ints */
export function encodeDataset(meta, pts) {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const pad = (4 - ((8 + json.length) % 4)) % 4;
  const ints = Int32Array.from(pts);
  const out = new Uint8Array(8 + json.length + pad + ints.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, json.length, true);
  dv.setUint32(4, pad, true);
  out.set(json, 8);
  out.set(new Uint8Array(ints.buffer), 8 + json.length + pad);
  return out.buffer;
}

/**
 * @param {ArrayBuffer} buf
 * @returns {{meta: {types: string[], tracks: number[][]}, pts: Int32Array}}
 */
export function decodeDataset(buf) {
  const dv = new DataView(buf);
  const metaLen = dv.getUint32(0, true);
  const pad = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, metaLen)));
  return { meta, pts: new Int32Array(buf, 8 + metaLen + pad) };
}
