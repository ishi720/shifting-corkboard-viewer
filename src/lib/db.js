// IndexedDB への保存。画像(Blob)と状態を持つ。外部送信なし

const DB_NAME = 'shifting-corkboard-viewer';
const VERSION = 1;
const IMAGES = 'images'; // 画像ID → Blob
const META = 'meta';     // 'state' → 状態

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** fn を実行し、トランザクション完了後に結果を返す */
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getState = () => run(META, 'readonly', (s) => s.get('state'));
export const putState = (state) => run(META, 'readwrite', (s) => { s.put(state, 'state'); });

export const getImage = (id) => run(IMAGES, 'readonly', (s) => s.get(id));
export const imageKeys = () => run(IMAGES, 'readonly', (s) => s.getAllKeys());

/** entries: [[id, blob], ...] */
export const putImages = (entries) =>
  run(IMAGES, 'readwrite', (s) => { for (const [id, blob] of entries) s.put(blob, id); });

export const deleteImages = (ids) =>
  run(IMAGES, 'readwrite', (s) => { for (const id of ids) s.delete(id); });
