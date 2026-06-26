import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StarfishConfig, SyncStats } from './starfish-config.js';
import { listBatches, pullBatch } from './starfish-client.js';

interface ManifestEntry {
  etag: string | null;
  syncedAt: string;
  bytes: number;
}

interface Manifest {
  files: Record<string, ManifestEntry>;
  lastSyncAt: string | null;
}

const MANIFEST = '.manifest.json';

function manifestPath(cacheDir: string): string {
  return join(cacheDir, MANIFEST);
}

function batchFileName(batchId: string): string {
  const base = batchId.endsWith('.parquet') ? batchId : `${batchId}.parquet`;
  return base;
}

async function loadManifest(cacheDir: string): Promise<Manifest> {
  const path = manifestPath(cacheDir);
  if (!existsSync(path)) {
    return { files: {}, lastSyncAt: null };
  }
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Manifest;
  } catch {
    return { files: {}, lastSyncAt: null };
  }
}

async function saveManifest(cacheDir: string, manifest: Manifest): Promise<void> {
  await writeFile(manifestPath(cacheDir), JSON.stringify(manifest, null, 2), { mode: 0o600 });
}

export async function computeSyncStats(cacheDir: string): Promise<SyncStats> {
  const manifest = await loadManifest(cacheDir);
  let cacheBytes = 0;
  for (const entry of Object.values(manifest.files)) {
    cacheBytes += entry.bytes;
  }
  return {
    totalFiles: Object.keys(manifest.files).length,
    cacheBytes,
    lastSyncAt: manifest.lastSyncAt,
  };
}

/**
 * Incrementally sync Parquet batches from Starfish into *cacheDir*.
 * Privacy: logs counts only, never event contents.
 */
export async function syncParquetCache(config: StarfishConfig): Promise<SyncStats> {
  await mkdir(config.cacheDir, { recursive: true });
  const manifest = await loadManifest(config.cacheDir);

  let after: string | undefined;
  let downloaded = 0;
  let skipped = 0;

  for (;;) {
    const page = await listBatches(config, { after, limit: 100 });
    for (const batchId of page.items) {
      const fileName = batchFileName(batchId);
      const existing = manifest.files[fileName];
      if (existing) {
        skipped += 1;
        continue;
      }

      const { data, etag } = await pullBatch(config, batchId);
      const outPath = join(config.cacheDir, fileName);
      const bytes = new Uint8Array(data);
      await writeFile(outPath, bytes);
      manifest.files[fileName] = {
        etag,
        syncedAt: new Date().toISOString(),
        bytes: bytes.byteLength,
      };
      downloaded += 1;
    }

    if (!page.hasMore || page.items.length === 0) break;
    after = page.items[page.items.length - 1]!;
  }

  manifest.lastSyncAt = new Date().toISOString();
  await saveManifest(config.cacheDir, manifest);

  const stats = await computeSyncStats(config.cacheDir);
  console.log(
    `[dashboard] Starfish sync: ${downloaded} downloaded, ${skipped} cached, ${stats.totalFiles} total file(s)`,
  );
  return stats;
}

/** Remove manifest entries whose files no longer exist on disk. */
export async function reconcileManifest(cacheDir: string): Promise<void> {
  const manifest = await loadManifest(cacheDir);
  const entries = await readdir(cacheDir).catch(() => [] as string[]);
  const onDisk = new Set(entries.filter((f) => f.endsWith('.parquet')));
  for (const key of Object.keys(manifest.files)) {
    if (!onDisk.has(key)) delete manifest.files[key];
  }
  await saveManifest(cacheDir, manifest);
}

export async function cacheDirSize(cacheDir: string): Promise<number> {
  if (!existsSync(cacheDir)) return 0;
  const manifest = await loadManifest(cacheDir);
  return Object.values(manifest.files).reduce((n, e) => n + e.bytes, 0);
}

export async function cacheFileCount(cacheDir: string): Promise<number> {
  if (!existsSync(cacheDir)) return 0;
  const manifest = await loadManifest(cacheDir);
  return Object.keys(manifest.files).length;
}
