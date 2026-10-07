import { ui, setStatus } from './dom.js';
import { create2d, download, drawAttribution, drawStats, drawTitle, sleep } from './export-common.js';
import { applyGlow, beginAccumulation, colorize, strokeTrack, worldMargin } from './heat.js';
import { inRect } from './lib/tracks.js';
import { sumStats, timeline } from './lib/stats.js';
import { tilesForView } from './lib/tiles.js';
import { activeBase, background, exportHeatOptions, isLight } from './settings.js';
import { scaleOf, state, visibleTracks } from './state.js';
import { drawTiles, loadTiles } from './tile-cache.js';
import { makeRecorderSink, makeWebCodecsSink } from './video-sinks.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const pad = (/** @type {number} */ n, /** @type {number} */ w) => String(n).padStart(w, ' ');
const isoDate = (/** @type {number} */ ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const even = (/** @type {number} */ v) => Math.max(2, Math.round(v / 2) * 2);

let cancelRequested = false;

/** Draws the date and activity counter at the bottom right. */
function drawDateCounter(
  /** @type {CanvasRenderingContext2D} */ g,
  /** @type {number} */ PW,
  /** @type {number} */ PH,
  /** @type {number} */ ts,
  /** @type {number} */ count,
  /** @type {number} */ total,
) {
  const fs = Math.min(PW, PH) * 0.035;
  const m = PW * 0.04;
  g.font = `600 ${fs}px ${MONO}`;
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillStyle = isLight() ? '#111' : '#fff';
  g.letterSpacing = `${fs * 0.05}px`;
  g.fillText(isoDate(ts), PW - m, PH - m * 0.8);
  g.globalAlpha = 0.6;
  g.font = `400 ${fs * 0.55}px ${MONO}`;
  g.fillText(`${pad(count, String(total).length)} / ${total} ACTIVITIES`, PW - m, PH - m * 0.8 - fs * 1.1);
  g.globalAlpha = 1;
  g.textAlign = 'left';
  g.letterSpacing = '0px';
}

async function exportVideo() {
  const { view, viewport, sel } = state;
  const { w: W, h: H } = viewport;
  // region: selection, or current viewport
  const Sv = scaleOf(view.z);
  const R = sel ?? {
    x0: view.cx - W / 2 / Sv,
    x1: view.cx + W / 2 / Sv,
    y0: view.cy - H / 2 / Sv,
    y1: view.cy + H / 2 / Sv,
  };
  const selW = R.x1 - R.x0;
  const selH = R.y1 - R.y0;
  const cx = (R.x0 + R.x1) / 2;
  const cy = (R.y0 + R.y1) / 2;
  const L = +ui.vpx.value;
  const PW = selW >= selH ? even(L) : even((L * selW) / selH);
  const PH = selW >= selH ? even((L * selH) / selW) : even(L);
  const S = PW / selW;
  const k = PW / (selW * Sv);
  const cam = { W: PW, H: PH, cx, cy, S, k };
  const o = exportHeatOptions();
  const fps = +ui.fps.value;
  const duration = Math.max(1, +ui.durn.value || +ui.dur.value);
  const hold = Math.round(fps * 2);
  const nFrames = Math.round(duration * fps);
  const base = activeBase();
  const useBase = ui.exbase.checked && base !== 'none';
  const mg = worldMargin(o, cam);
  const tracks = visibleTracks()
    .filter((t) => inRect(t, R.x0, R.y0, R.x1, R.y1, mg))
    .sort((a, b) => a.ts - b.ts);
  if (!tracks.length) return setStatus('No visible activities in this area.');

  // running totals of everything visible (not just this region), growing as the animation advances
  const allVisible = visibleTracks().sort((a, b) => a.ts - b.ts);
  const showStats = ui.showstats.checked;
  const totals = sumStats(allVisible);
  const statsAt = timeline(allVisible);

  // static background (+ tiles)
  const { canvas: bg, g: bgc } = create2d(PW, PH);
  bgc.fillStyle = background();
  bgc.fillRect(0, 0, PW, PH);
  if (useBase) {
    const list = tilesForView(base, cx, cy, S, PW, PH, false);
    const width = String(list.length).length;
    const entries = await loadTiles(list, (done) => setStatus(`Loading map tiles ${pad(done, width)}/${list.length}…`));
    bgc.globalAlpha = +ui.dim.value;
    drawTiles(bgc, list, entries, 0.6);
    bgc.globalAlpha = 1;
  }
  // accumulation (gray), work (colorized) and output canvases
  const { canvas: acc, g: a } = create2d(PW, PH);
  beginAccumulation(a, PW, PH, cam, o);
  const { canvas: work, g: w } = create2d(PW, PH);
  const { canvas: out, g } = create2d(PW, PH);

  const sink = (await makeWebCodecsSink(PW, PH, fps)) ?? makeRecorderSink(out, PW, PH, fps);

  const showDate = ui.adate.checked;
  const highlight = ui.ahl.checked;
  const hl = Math.max(2, Math.min(Math.round(fps * 0.8), Math.round((10 * nFrames) / tracks.length)));
  const total = nFrames + hold;
  let drawn = 0;
  /** frame index at which each track was added */
  const addedAt = [];
  sink.start();
  for (let f = 0; f < total; f++) {
    if (cancelRequested) break;
    const target = Math.min(tracks.length, Math.round(tracks.length * Math.min(1, (f + 1) / nFrames)));
    while (drawn < target) {
      strokeTrack(a, state.data, tracks[drawn], cam);
      addedAt[drawn] = f;
      drawn++;
    }
    // compose
    w.globalCompositeOperation = 'copy';
    w.drawImage(acc, 0, 0);
    w.globalCompositeOperation = 'source-over';
    applyGlow(work, cam, o);
    colorize(work, PW, PH, o.lut);
    g.globalAlpha = 1;
    g.drawImage(bg, 0, 0);
    g.drawImage(work, 0, 0);
    if (highlight) {
      g.lineJoin = g.lineCap = 'round';
      g.lineWidth = o.width * k * 1.6;
      for (let i = drawn - 1; i >= 0 && f - addedAt[i] < hl; i--) {
        g.strokeStyle = `rgba(255,255,255,${(1 - (f - addedAt[i]) / hl) * 0.9})`;
        strokeTrack(g, state.data, tracks[i], cam);
      }
    }
    if (showStats && drawn) drawStats(g, PW, PH, statsAt(tracks[drawn - 1].ts), { ref: totals });
    drawTitle(g, PW, PH);
    if (useBase) drawAttribution(g, base, PW, PH);
    if (showDate && drawn) drawDateCounter(g, PW, PH, tracks[drawn - 1].ts, drawn, tracks.length);
    await sink.frame(out, f);
    setStatus(
      `Encoding frame ${pad(f + 1, String(total).length)}/${total}…${sink.realtime ? ' (real time, keep this tab visible)' : ''}`,
    );
    await sleep(0);
  }
  if (cancelRequested) {
    sink.abort();
    return setStatus('Cancelled.');
  }
  setStatus('Finalizing…');
  const { blob, ext } = await sink.finish();
  download(blob, `heatmap_${PW}x${PH}.${ext}`);
  setStatus(
    `Done — ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}, ${PW}×${PH}, ${(total / fps).toFixed(0)} s`,
  );
}

async function onVideoButton() {
  const btn = ui.vidbtn;
  if (btn.dataset.run) {
    cancelRequested = true;
    return;
  }
  if (!window.MediaRecorder) return setStatus('MediaRecorder not supported in this browser.');
  btn.dataset.run = '1';
  btn.textContent = 'Cancel';
  cancelRequested = false;
  ui.exbtn.disabled = true;
  try {
    await exportVideo();
  } catch (err) {
    console.error(err);
    setStatus('Video export failed: ' + (err instanceof Error ? err.message : err));
  }
  delete btn.dataset.run;
  btn.textContent = 'Export video';
  ui.exbtn.disabled = !state.sel;
}

export function initVideoExport() {
  ui.vidbtn.addEventListener('click', onVideoButton);
}
