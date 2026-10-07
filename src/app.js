import { refreshChips, setupControls } from './controls.js';
import { ui } from './dom.js';
import { initImageExport } from './export-image.js';
import { initVideoExport } from './export-video.js';
import { initImport, showEmptyState } from './import.js';
import { readData } from './lib/store.js';
import { initMap, updateExportUI } from './map.js';
import { setData } from './state.js';

let controlsReady = false;

/** Reveals the settings panel for freshly loaded data. */
async function showData() {
  if (controlsReady) {
    refreshChips();
  } else {
    controlsReady = true;
    setupControls();
  }
  ui.cfg.style.display = '';
  ui.loading.remove();
}

async function main() {
  initMap();
  initImageExport();
  initVideoExport();
  initImport(showData);
  updateExportUI();

  const stored = await readData().catch(() => undefined);
  if (stored) {
    try {
      setData(stored);
      return await showData();
    } catch {
      /* corrupt or outdated data: fall through to the empty state */
    }
  }
  showEmptyState();
}

main();
