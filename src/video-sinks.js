import { muxWebM } from './lib/webm.js';
import { sleep } from './export-common.js';

/**
 * Where rendered video frames go.
 * @typedef {object} FrameSink
 * @property {boolean} realtime frames are captured in real time (the tab must stay visible)
 * @property {() => void} start
 * @property {(canvas: HTMLCanvasElement, index: number) => Promise<void>} frame
 * @property {() => void} abort
 * @property {() => Promise<{blob: Blob, ext: string}>} finish
 */

/** MediaRecorder fallback: records the canvas stream in real time. @returns {FrameSink} */
export function makeRecorderSink(
  /** @type {HTMLCanvasElement} */ out,
  /** @type {number} */ PW,
  /** @type {number} */ PH,
  /** @type {number} */ fps,
) {
  const stream = out.captureStream(fps);
  const candidates = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.min(60e6, PW * PH * fps * 0.12) });
  /** @type {Blob[]} */
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (rec.onstop = resolve));
  let t0 = 0;
  return {
    realtime: true,
    start() {
      rec.start(250);
      t0 = performance.now();
    },
    async frame(_, f) {
      await sleep(Math.max(0, t0 + ((f + 1) * 1000) / fps - performance.now()));
    },
    abort() {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    async finish() {
      await sleep(300);
      rec.stop();
      await stopped;
      return {
        blob: new Blob(chunks, { type: rec.mimeType || 'video/webm' }),
        ext: rec.mimeType.includes('mp4') ? 'mp4' : 'webm',
      };
    },
  };
}

/**
 * WebCodecs sink (deterministic frame times, faster than real time), muxed to WebM.
 * @returns {Promise<FrameSink | null>} null if WebCodecs or a usable codec is unavailable
 */
export async function makeWebCodecsSink(/** @type {number} */ PW, /** @type {number} */ PH, /** @type {number} */ fps) {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  /** @type {VideoEncoderConfig | null} */
  let cfg = null;
  let codecId = '';
  for (const [codec, id] of [
    ['vp09.00.51.08', 'V_VP9'],
    ['vp8', 'V_VP8'],
  ]) {
    /** @type {VideoEncoderConfig} */
    const candidate = {
      codec,
      width: PW,
      height: PH,
      framerate: fps,
      bitrate: Math.min(60e6, Math.round(PW * PH * fps * 0.1)),
      latencyMode: 'quality',
    };
    try {
      if ((await VideoEncoder.isConfigSupported(candidate)).supported) {
        cfg = candidate;
        codecId = id;
        break;
      }
    } catch {
      /* try the next codec */
    }
  }
  if (!cfg) return null;
  /** @type {{t: number, key: boolean, d: Uint8Array}[]} */
  const frames = [];
  /** @type {Error | null} */
  let err = null;
  const enc = new VideoEncoder({
    output: (chunk) => {
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      frames.push({ t: Math.round(chunk.timestamp / 1000), key: chunk.type === 'key', d });
    },
    error: (e) => (err = e),
  });
  enc.configure(cfg);
  return {
    realtime: false,
    start() {},
    async frame(canvas, f) {
      if (err) throw err;
      while (enc.encodeQueueSize > 6) await sleep(5);
      const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
      vf.close();
    },
    abort() {
      try {
        enc.close();
      } catch {
        /* already closed */
      }
    },
    async finish() {
      await enc.flush();
      enc.close();
      if (err) throw err;
      return { blob: muxWebM(frames, codecId, PW, PH, Math.round((frames.length * 1000) / fps)), ext: 'webm' };
    },
  };
}
