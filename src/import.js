import { ui } from './dom.js';
import { saveData } from './lib/store.js';
import { setData, state } from './state.js';

let busy = false;

/** Writes to the upload status line, and to the splash screen while it is still shown. */
function report(/** @type {string} */ msg) {
  ui.upstat.textContent = msg;
  if (ui.loading.isConnected && ui.loading.dataset.up) ui.loadmsg.textContent = msg;
}

/**
 * Parses an export .zip in a Web Worker, then hands the dataset to the app and stores it.
 * @param {File} file
 * @param {() => Promise<void>} onLoaded called after the data was swapped in
 */
function importZip(file, onLoaded) {
  if (busy) return;
  busy = true;
  ui.upbtn.disabled = true;
  const worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  const finish = () => {
    busy = false;
    ui.upbtn.disabled = false;
    worker.terminate();
  };
  report(`Reading ${file.name}…`);
  worker.onmessage = async (ev) => {
    const m = ev.data;
    if (m.progress) return report(m.progress);
    finish();
    if (m.error) return report('Failed: ' + m.error);
    try {
      setData(m.done);
      await onLoaded();
      saveData(m.done);
      report(`Loaded ${state.data.tracks.length} activities (stored in this browser only).`);
    } catch (e) {
      report('Failed: ' + (e instanceof Error ? e.message : e));
    }
  };
  worker.onerror = (e) => {
    finish();
    report('Failed: ' + (e.message || 'worker error'));
  };
  worker.postMessage(file);
}

/** Wires the file picker and drag & drop. */
export function initImport(/** @type {() => Promise<void>} */ onLoaded) {
  ui.upbtn.addEventListener('click', () => ui.upfile.click());
  ui.upfile.addEventListener('change', () => {
    const [file] = ui.upfile.files ?? [];
    if (file) importZip(file, onLoaded);
    ui.upfile.value = '';
  });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) importZip(file, onLoaded);
  });
}

/** Replaces the splash screen with a call to action when no data is stored yet. */
export function showEmptyState() {
  ui.count.textContent = 'no data yet';
  ui.loading.dataset.up = '1';
  ui.loadmsg.innerHTML =
    'No data yet.<br><br><button class="p" id="upbtn2">Choose your export .zip</button><br><br><span style="font-size:12px">or drop the file anywhere.<br>It is processed in your browser and never uploaded.</span><br><br><span style="font-size:12px">Don\'t have it yet? <a href="https://www.strava.com/athlete/download_my_account" target="_blank" rel="noopener noreferrer" style="color:var(--acc)">Request your export from Strava</a><br>Not affiliated with Strava; &quot;Strava&quot; is a trademark of Strava, Inc.</span>';
  document.getElementById('upbtn2')?.addEventListener('click', () => ui.upfile.click());
}
