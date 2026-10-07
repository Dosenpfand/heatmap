import { ui, setStatus } from './dom.js';
import { create2d, download, drawTitle, sleep } from './export-common.js';
import { renderHeat } from './heat.js';
import { tilesForView } from './lib/tiles.js';
import { activeBase, background, exportHeatOptions, exportRegion, exportSize } from './settings.js';
import { scaleOf, state, visibleTracks } from './state.js';
import { drawTiles, loadTiles } from './tile-cache.js';

/** Renders the selected area to a PNG and downloads it. */
async function exportPng() {
  const sel = exportRegion();
  ui.exbtn.disabled = true;
  try {
    const [PW, PH] = exportSize();
    const selW = sel.x1 - sel.x0;
    const cx = (sel.x0 + sel.x1) / 2;
    const cy = (sel.y0 + sel.y1) / 2;
    const S = PW / selW; // px per world unit at export
    const k = PW / (selW * scaleOf(state.view.z)); // export px per preview css px
    const o = exportHeatOptions();
    const base = activeBase();
    const useBase = ui.exbase.checked && base !== 'none';
    setStatus('Rendering heat…');
    await sleep(30);
    const heat = document.createElement('canvas');
    renderHeat(heat, { W: PW, H: PH, cx, cy, S, k }, o, state.data, visibleTracks());
    setStatus(`Line width ${(o.width * k).toFixed(1)} px`);
    await sleep(30);

    const { canvas: out, g } = create2d(PW, PH);
    g.imageSmoothingQuality = 'high';
    g.fillStyle = background();
    g.fillRect(0, 0, PW, PH);
    if (useBase) {
      const list = tilesForView(base, cx, cy, S, PW, PH, true);
      setStatus(`Loading map tiles 0/${list.length}…`);
      if (list.length > 600) setStatus(`Many tiles (${list.length}) — this may take a while…`);
      const entries = await loadTiles(list, (done) => setStatus(`Loading map tiles ${done}/${list.length}…`));
      g.globalAlpha = +ui.dim.value;
      drawTiles(g, list, entries, 0.6);
      g.globalAlpha = 1;
    }
    g.drawImage(heat, 0, 0);
    heat.width = heat.height = 1; // release the large bitmap
    drawTitle(g, PW, PH);
    setStatus('Encoding PNG…');
    await sleep(30);
    /** @type {Blob} */
    const blob = await new Promise((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed — try a smaller size'))), 'image/png'),
    );
    download(blob, `heatmap_${PW}x${PH}.png`);
    setStatus(`Done — ${(blob.size / 1e6).toFixed(1)} MB, ${PW}×${PH}px`);
  } catch (err) {
    console.error(err);
    setStatus('Export failed: ' + (err instanceof Error ? err.message : err));
  }
  ui.exbtn.disabled = false;
}

export function initImageExport() {
  ui.exbtn.addEventListener('click', exportPng);
}
