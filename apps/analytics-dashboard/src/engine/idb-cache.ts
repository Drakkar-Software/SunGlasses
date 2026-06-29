/**
 * Persistent IndexedDB Parquet byte cache.
 *
 * DB: sunglasses-dashboard  |  Store: parquet  |  Key: `${app}::${fileName}`  |  Value: Uint8Array
 *
 * All functions are defensive — any IDB error resolves to null/void so callers fall
 * back to network exactly like before (private browsing, quota exceeded, no-IDB, etc.).
 * Batches are immutable append-only UUIDs, so filename presence is a sufficient
 * cache-hit gate; no etag-based invalidation is required.
 */

const DB_NAME = 'sunglasses-dashboard';
const STORE   = 'parquet';
const VERSION = 1;

let _dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbp) return _dbp;
  _dbp = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { _dbp = null; reject(req.error); };
  });
  return _dbp;
}

function k(app: string, fileName: string): string {
  return `${app}::${fileName}`;
}

/** Read a cached Parquet buffer. Returns null if not found or on any error. */
export async function idbGet(app: string, fileName: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(k(app, fileName));
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Persist Parquet bytes. Swallows errors (quota exceeded, private browsing, etc.). */
export async function idbPut(app: string, fileName: string, bytes: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, k(app, fileName));
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    /* swallow */
  }
}

/** Delete all cached files for one app. Swallows errors. */
export async function idbClearApp(app: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const range = IDBKeyRange.bound(`${app}::`, `${app}::￿`);
      const req   = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else        { resolve(); }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* swallow */
  }
}

/** Clear the entire Parquet cache (called on disconnect). Swallows errors. */
export async function idbClearAll(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch {
    /* swallow */
  }
}
