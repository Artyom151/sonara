/** The banner video is a file, too big for localStorage: it lives in IndexedDB on this device. */
const DB = 'sonara.media';
const STORE = 'banner';
const KEY = 'video';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveBannerVideo = (blob: Blob) => run('readwrite', (s) => s.put(blob, KEY));
export const loadBannerVideo = () => run<Blob | undefined>('readonly', (s) => s.get(KEY)).then((b) => b ?? null).catch(() => null);
export const clearBannerVideo = () => run('readwrite', (s) => s.delete(KEY)).catch(() => undefined);
