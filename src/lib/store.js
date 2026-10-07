/** Data lives only in this browser (IndexedDB). Nothing is uploaded anywhere. */
const DB_NAME = 'heatmap';
const STORE = 'kv';
const KEY = 'data';

/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Runs one request inside a transaction and resolves with its result once the transaction commits.
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
async function withStore(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Persists the dataset; storage failures (quota, private mode) are ignored. */
export async function saveData(/** @type {ArrayBuffer} */ buf) {
  try {
    await withStore('readwrite', (s) => s.put(buf, KEY));
  } catch {
    /* best effort */
  }
}

/** @returns {Promise<ArrayBuffer | undefined>} */
export const readData = () => withStore('readonly', (s) => s.get(KEY));
