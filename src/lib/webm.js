/** Minimal WebM (Matroska) muxer: one video track, frames grouped into clusters at keyframes. */

const encoder = new TextEncoder();

/** @param {Uint8Array[]} parts */
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};

/** @param {number} id */
const idBytes = (id) => {
  /** @type {number[]} */
  const b = [];
  for (; id > 0; id = Math.floor(id / 256)) b.unshift(id & 255);
  return Uint8Array.from(b);
};

/**
 * EBML element with an 8-byte size field.
 * @param {number} id
 * @param {Uint8Array | Uint8Array[]} payload
 */
export function element(id, payload) {
  const body = concat(Array.isArray(payload) ? payload : [payload]);
  const head = new Uint8Array(8);
  head[0] = 0x01;
  for (let q = 7, n = body.length; q > 0; q--, n = Math.floor(n / 256)) head[q] = n % 256;
  return concat([idBytes(id), head, body]);
}

/**
 * @param {number} v
 * @param {number} [minBytes]
 */
export const uint = (v, minBytes = 1) => {
  /** @type {number[]} */
  const b = [];
  while (v > 0 || b.length < minBytes) {
    b.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return Uint8Array.from(b);
};
const float64 = (/** @type {number} */ v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return b;
};
const str = (/** @type {string} */ s) => encoder.encode(s);

/**
 * @param {{t: number, key: boolean, d: Uint8Array}[]} frames t in ms
 * @param {string} codecId e.g. "V_VP9"
 * @param {number} width
 * @param {number} height
 * @param {number} durationMs
 */
export function muxWebM(frames, codecId, width, height, durationMs) {
  const E = element;
  const header = E(0x1a45dfa3, [
    E(0x4286, uint(1)), // EBMLVersion
    E(0x42f7, uint(1)), // EBMLReadVersion
    E(0x42f2, uint(4)), // EBMLMaxIDLength
    E(0x42f3, uint(8)), // EBMLMaxSizeLength
    E(0x4282, str('webm')), // DocType
    E(0x4287, uint(4)), // DocTypeVersion
    E(0x4285, uint(2)), // DocTypeReadVersion
  ]);
  const info = E(0x1549a966, [
    E(0x2ad7b1, uint(1000000)), // TimecodeScale (1 ms)
    E(0x4d80, str('heatmap')), // MuxingApp
    E(0x5741, str('heatmap')), // WritingApp
    E(0x4489, float64(durationMs)),
  ]);
  const tracks = E(
    0x1654ae6b,
    E(0xae, [
      E(0xd7, uint(1)), // TrackNumber
      E(0x73c5, uint(1)), // TrackUID
      E(0x83, uint(1)), // TrackType: video
      E(0x86, str(codecId)),
      E(0xe0, [E(0xb0, uint(width)), E(0xba, uint(height))]),
    ]),
  );

  /** @type {{t0: number, blocks: Uint8Array[]}[]} */
  const clusters = [];
  /** @type {{t0: number, blocks: Uint8Array[]} | null} */
  let cur = null;
  for (const fr of frames) {
    if (!cur || (fr.key && fr.t > cur.t0)) clusters.push((cur = { t0: fr.t, blocks: [] }));
    const rel = fr.t - cur.t0;
    const block = new Uint8Array(4 + fr.d.length);
    block.set([0x81, (rel >> 8) & 255, rel & 255, fr.key ? 0x80 : 0]);
    block.set(fr.d, 4);
    cur.blocks.push(E(0xa3, block)); // SimpleBlock
  }
  const clusterEls = clusters.map((c) => E(0x1f43b675, [E(0xe7, uint(c.t0)), ...c.blocks]));
  const segment = E(0x18538067, [info, tracks, ...clusterEls]);
  return new Blob([header, segment], { type: 'video/webm' });
}
