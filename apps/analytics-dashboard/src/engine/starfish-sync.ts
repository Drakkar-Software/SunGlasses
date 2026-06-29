/**
 * Starfish sync — browser port of server/starfish-sync.ts.
 *
 * Instead of writing Parquet files to a local directory (node:fs), this module:
 *  1. Keeps an in-memory registry: app → (fileName → Uint8Array).
 *  2. Persists a lightweight manifest (filenames + etags + sizes) in localStorage
 *     for incremental sync across page loads.
 *  3. Persists the actual Parquet bytes in IndexedDB (keyed per app) so reloads
 *     re-download only new batches rather than everything.
 *  4. Exposes the registered file buffers so engine/duckdb.ts can call
 *     db.registerFileBuffer() on each one (namespaced as `${app}/${fileName}`).
 *
 * Privacy: only batch counts are logged, never event contents.
 */
import type { StarfishConfig, SyncStats } from './config.js';
import { listBatches, pullBatch } from './starfish-client.js';
import { idbGet, idbPut, idbClearApp, idbClearAll } from './idb-cache.js';

export { idbClearAll };

// ── Manifest (localStorage) ───────────────────────────────────────────────────

interface ManifestEntry {
  etag:     string | null;
  syncedAt: string;
  bytes:    number;
}

interface Manifest {
  files:      Record<string, ManifestEntry>;
  lastSyncAt: string | null;
}

function manifestKey(app: string): string {
  return `starfish-manifest-${app}`;
}

function batchFileName(batchId: string): string {
  return batchId.endsWith('.parquet') ? batchId : `${batchId}.parquet`;
}

function loadManifest(app: string): Manifest {
  try {
    const raw = localStorage.getItem(manifestKey(app));
    if (!raw) return { files: {}, lastSyncAt: null };
    return JSON.parse(raw) as Manifest;
  } catch {
    return { files: {}, lastSyncAt: null };
  }
}

function saveManifest(app: string, manifest: Manifest): void {
  try {
    localStorage.setItem(manifestKey(app), JSON.stringify(manifest));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded) — sync still works for this session
  }
}

/** Remove one app's manifest from localStorage. */
export function clearManifest(app: string): void {
  try { localStorage.removeItem(manifestKey(app)); } catch { /* ignore */ }
}

/** Remove all Starfish manifests from localStorage. */
export function clearAllManifests(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('starfish-manifest-')) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

// ── In-memory file registry (nested by app) ───────────────────────────────────

/**
 * All currently registered Parquet buffers.
 * Outer key = app slug.  Inner key = bare fileName (e.g. `${batchId}.parquet`).
 * DuckDB virtual-FS name = `${app}/${fileName}` (assembled on export).
 */
const _registry = new Map<string, Map<string, Uint8Array>>();

/** Flatten the nested registry to `${app}/${fileName}` virtual-FS names. */
export function getRegisteredFiles(): string[] {
  const out: string[] = [];
  for (const [app, files] of _registry) {
    for (const fileName of files.keys()) out.push(`${app}/${fileName}`);
  }
  return out;
}

/** Return all buffers with their virtual-FS names for DuckDB registerFileBuffer(). */
export function getRegisteredBuffers(): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  for (const [app, files] of _registry) {
    for (const [fileName, data] of files) {
      out.push({ name: `${app}/${fileName}`, data });
    }
  }
  return out;
}

/** Clear the entire in-memory registry (called on disconnect). */
export function clearRegistry(): void {
  _registry.clear();
}

/** Clear one app's buffers from the in-memory registry (called on app removal). */
export function clearRegistryApp(app: string): void {
  _registry.delete(app);
}

// ── Sync stats ────────────────────────────────────────────────────────────────

/**
 * Compute combined SyncStats across all configured apps.
 * Reads from localStorage manifests so the counts survive a reload.
 */
export function computeSyncStats(apps: string[]): SyncStats {
  let totalFiles = 0;
  let cacheBytes = 0;
  let lastSyncAt: string | null = null;

  for (const app of apps) {
    const manifest = loadManifest(app);
    totalFiles += Object.keys(manifest.files).length;
    for (const entry of Object.values(manifest.files)) cacheBytes += entry.bytes;
    if (manifest.lastSyncAt && (!lastSyncAt || manifest.lastSyncAt > lastSyncAt)) {
      lastSyncAt = manifest.lastSyncAt;
    }
  }

  return { totalFiles, cacheBytes, lastSyncAt };
}

// ── Per-app sync ──────────────────────────────────────────────────────────────

/**
 * Incrementally pull new Parquet batches for one app from Starfish into _registry.
 * Files already in the manifest (by filename) are skipped — they will be filled from
 * IndexedDB or re-pulled by rehydrateApp().
 * Newly downloaded bytes are also written through to IndexedDB.
 */
export async function syncApp(config: StarfishConfig, app: string): Promise<void> {
  const manifest   = loadManifest(app);
  const appMap     = _registry.get(app) ?? new Map<string, Uint8Array>();
  let after: string | undefined;
  let downloaded   = 0;
  let skipped      = 0;

  for (;;) {
    const page = await listBatches(config, app, { after, limit: 100 });
    for (const batchId of page.items) {
      const fileName = batchFileName(batchId);
      if (manifest.files[fileName]) {
        // Already synced in a previous session — rehydrateApp() will load bytes.
        skipped += 1;
        continue;
      }
      const { data, etag } = await pullBatch(config, app, batchId);
      const bytes = new Uint8Array(data);
      appMap.set(fileName, bytes);
      await idbPut(app, fileName, bytes);          // write-through to IndexedDB
      manifest.files[fileName] = {
        etag,
        syncedAt: new Date().toISOString(),
        bytes:    bytes.byteLength,
      };
      downloaded += 1;
    }

    if (!page.hasMore || page.items.length === 0) break;
    after = page.items[page.items.length - 1]!;
  }

  manifest.lastSyncAt = new Date().toISOString();
  saveManifest(app, manifest);
  _registry.set(app, appMap);

  console.log(
    `[dashboard] Starfish sync (${app}): ${downloaded} downloaded, ${skipped} skipped,`,
    `${Object.keys(manifest.files).length} total`,
  );
}

/**
 * Fill the in-memory registry for one app from IndexedDB (fast path) or network
 * (fallback), for files that are in the manifest but not already in _registry.
 * Called after syncApp() — covers files downloaded in a previous session.
 */
export async function rehydrateApp(config: StarfishConfig, app: string): Promise<void> {
  const manifest = loadManifest(app);
  const appMap   = _registry.get(app) ?? new Map<string, Uint8Array>();
  const missing  = Object.keys(manifest.files).filter((f) => !appMap.has(f));
  if (missing.length === 0) { _registry.set(app, appMap); return; }

  let fromIdb     = 0;
  let fromNetwork = 0;

  for (const fileName of missing) {
    // 1. Try IndexedDB first (no network needed)
    const cached = await idbGet(app, fileName);
    if (cached) {
      appMap.set(fileName, cached);
      fromIdb += 1;
      continue;
    }
    // 2. IDB miss (first reload after upgrade, or IDB cleared) — pull from network
    const batchId = fileName.endsWith('.parquet') ? fileName.slice(0, -'.parquet'.length) : fileName;
    const { data } = await pullBatch(config, app, batchId);
    const bytes = new Uint8Array(data);
    appMap.set(fileName, bytes);
    await idbPut(app, fileName, bytes);            // backfill IndexedDB
    fromNetwork += 1;
  }

  _registry.set(app, appMap);

  if (fromIdb + fromNetwork > 0) {
    console.log(
      `[dashboard] Rehydrate (${app}): ${fromIdb} from IDB, ${fromNetwork} from network`,
    );
  }
}

/**
 * Remove one app's IndexedDB cache.
 * Re-exported here so duckdb.ts can call it without importing idb-cache directly.
 */
export { idbClearApp };
