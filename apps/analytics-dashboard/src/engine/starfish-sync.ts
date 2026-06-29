/**
 * Starfish sync — browser port of server/starfish-sync.ts.
 *
 * Instead of writing Parquet files to a local directory (node:fs), this module:
 *  1. Keeps an in-memory registry: fileName → Uint8Array.
 *  2. Persists a lightweight manifest (filenames + etags + sizes) in localStorage
 *     for incremental sync across page loads.
 *  3. Exposes the registered file buffers so engine/duckdb.ts can call
 *     db.registerFileBuffer() on each one.
 *
 * Privacy: only batch counts are logged, never event contents.
 */
import type { StarfishConfig, SyncStats } from './config.js';
import { listBatches, pullBatch } from './starfish-client.js';

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

// ── In-memory file registry ───────────────────────────────────────────────────

/** All currently registered Parquet buffers: fileName → bytes. */
const _registry: Map<string, Uint8Array> = new Map();

/** List of registered file names, in sync order, for DuckDB read_parquet(). */
export function getRegisteredFiles(): string[] {
  return Array.from(_registry.keys());
}

/** Return the buffer for a registered file (used by engine/duckdb.ts to re-register after reset). */
export function getRegisteredBuffers(): { name: string; data: Uint8Array }[] {
  return Array.from(_registry.entries()).map(([name, data]) => ({ name, data }));
}

/** Clear the in-memory registry (called on disconnect). */
export function clearRegistry(): void {
  _registry.clear();
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export function computeSyncStats(app: string): SyncStats {
  const manifest = loadManifest(app);
  let cacheBytes = 0;
  for (const entry of Object.values(manifest.files)) cacheBytes += entry.bytes;
  return {
    totalFiles: Object.keys(manifest.files).length,
    cacheBytes,
    lastSyncAt: manifest.lastSyncAt,
  };
}

/**
 * Incrementally pull new Parquet batches from Starfish into _registry.
 * Files already in the manifest (by filename) are skipped.
 * Returns the updated SyncStats.
 */
export async function syncParquetCache(config: StarfishConfig): Promise<SyncStats> {
  const manifest   = loadManifest(config.app);
  let after: string | undefined;
  let downloaded   = 0;
  let skipped      = 0;

  for (;;) {
    const page = await listBatches(config, { after, limit: 100 });
    for (const batchId of page.items) {
      const fileName = batchFileName(batchId);
      if (manifest.files[fileName]) {
        // Already synced — but may not be in memory if page was reloaded; re-register below
        skipped += 1;
        continue;
      }
      const { data, etag } = await pullBatch(config, batchId);
      const bytes = new Uint8Array(data);
      _registry.set(fileName, bytes);
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
  saveManifest(config.app, manifest);

  console.log(
    `[dashboard] Starfish sync: ${downloaded} downloaded, ${skipped} skipped, ${Object.keys(manifest.files).length} total`,
  );
  return computeSyncStats(config.app);
}

/**
 * Re-pull all files that are in the manifest but not in the in-memory registry
 * (e.g. after a page reload). Must be called before DuckDB registers files.
 */
export async function rehydrateRegistry(config: StarfishConfig): Promise<void> {
  const manifest = loadManifest(config.app);
  const missing  = Object.keys(manifest.files).filter((f) => !_registry.has(f));
  if (missing.length === 0) return;

  for (const fileName of missing) {
    const batchId = fileName.endsWith('.parquet') ? fileName.slice(0, -'.parquet'.length) : fileName;
    const { data } = await pullBatch(config, batchId);
    _registry.set(fileName, new Uint8Array(data));
  }
}
