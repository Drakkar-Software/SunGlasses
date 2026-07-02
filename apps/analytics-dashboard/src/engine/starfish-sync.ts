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
import { mapWithConcurrency } from './concurrency.js';

/**
 * Default number of Parquet batches downloaded concurrently per app in
 * {@link downloadBatchIds}. Chosen to give a meaningful speedup over fully
 * sequential downloads while staying low enough that a browser tab issuing
 * this many concurrent GETs to one origin doesn't look like abuse to a
 * server-side rate limiter — reduces the chance of triggering a 429 rather
 * than only reacting to one after the fact. Apps are still synced one at a
 * time (see duckdb.ts), so this is also the peak concurrent request count to
 * the backend, not `DEFAULT_DOWNLOAD_CONCURRENCY * apps.length`.
 */
export const DEFAULT_DOWNLOAD_CONCURRENCY = 4;

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
  /**
   * High-water `/list` cursor — the last *server-assigned sortable* batch id
   * seen across the most recent fully-successful sync. `null` means "list
   * from the beginning" (first sync, or an older Starfish server that doesn't
   * assign server-side sortable batch ids, in which case this just never
   * advances and every sync stays a full scan — no incorrect behavior, just
   * no speedup). Legacy client-minted UUIDs are never stored here (see
   * {@link isLegacyBatchId}); a legacy cursor persisted by dashboard 0.14.1
   * is healed to `null` on load.
   */
  listCursor: string | null;
}

function manifestKey(app: string): string {
  return `starfish-manifest-${app}`;
}

function batchFileName(batchId: string): string {
  return batchId.endsWith('.parquet') ? batchId : `${batchId}.parquet`;
}

const LEGACY_UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * True when a batch id is a legacy client-minted random UUID v4 (the adapter's
 * `generateUUID()` — always lowercase), written before the Starfish server
 * started assigning sortable ids (`starfish-events` < 3.0.0-alpha.62).
 *
 * Legacy ids are uniformly random across the whole lexicographic range, so
 * they must never become the `/list` resume cursor: a legacy id sorting above
 * every server-assigned id (which sorts low — server-clock-derived) would make
 * `after=<cursor>` hide all future batches. A server-assigned sortable id can
 * never match this shape — v4 means random by definition (and a time-sortable
 * UUIDv7 carries version nibble `7`, not `4`).
 */
export function isLegacyBatchId(id: string): boolean {
  const bare = id.endsWith('.parquet') ? id.slice(0, -'.parquet'.length) : id;
  return LEGACY_UUID_V4_RE.test(bare);
}

function loadManifest(app: string): Manifest {
  try {
    const raw = localStorage.getItem(manifestKey(app));
    if (!raw) return { files: {}, lastSyncAt: null, listCursor: null };
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    // listCursor is a newer field — default to null for a manifest saved before it existed.
    // Self-heal: dashboard 0.14.1 could persist a legacy client-minted UUID as the
    // cursor (the lexicographic max of a mixed collection), hiding every batch that
    // sorts below it — treat such a cursor as "list from the beginning" instead.
    const cursor = parsed.listCursor ?? null;
    return {
      files:      parsed.files ?? {},
      lastSyncAt: parsed.lastSyncAt ?? null,
      listCursor: cursor !== null && isLegacyBatchId(cursor) ? null : cursor,
    };
  } catch {
    return { files: {}, lastSyncAt: null, listCursor: null };
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

/** Result of {@link listNewBatchIds}. */
export interface NewBatchIds {
  /** Batch ids not yet present in the manifest — these need downloading. */
  ids: string[];
  /**
   * The high-water `/list` cursor after this walk — the last *server-assigned
   * sortable* batch id seen, regardless of whether it was new. Legacy
   * client-minted UUIDs (see {@link isLegacyBatchId}) are never used: new
   * server ids sort below them, so a legacy cursor would hide all future
   * batches. Falls back to the manifest's current cursor when no sortable id
   * was seen. Callers must only persist this once the corresponding downloads
   * have fully succeeded — see {@link downloadBatchIds}.
   */
  nextCursor: string | null;
}

/**
 * List batch IDs that are not yet in the manifest for one app.
 * Lightweight — only makes list API calls, no downloads.
 * Used by duckdb.ts to compute the grand total before starting downloads.
 *
 * Resumes from the manifest's persisted `listCursor` instead of always
 * walking from the beginning — see `Manifest.listCursor` for why this is
 * only safe with server-assigned, chronologically-sortable batch ids.
 */
export async function listNewBatchIds(config: StarfishConfig, app: string): Promise<NewBatchIds> {
  const manifest    = loadManifest(app);
  const newBatchIds: string[] = [];
  let after: string | undefined = manifest.listCursor ?? undefined;
  let lastSortableId: string | undefined;

  for (;;) {
    const page = await listBatches(config, app, { after, limit: 100 });
    for (const batchId of page.items) {
      if (!manifest.files[batchFileName(batchId)]) newBatchIds.push(batchId);
      // Ascending list order ⇒ the last non-legacy id seen is the max sortable id.
      if (!isLegacyBatchId(batchId)) lastSortableId = batchId;
    }
    if (!page.hasMore || page.items.length === 0) break;
    // Pagination must resume from the raw last item of the page (whatever its
    // id scheme) — only the *persisted* cursor is restricted to sortable ids.
    after = page.items[page.items.length - 1]!;
  }

  return { ids: newBatchIds, nextCursor: lastSortableId ?? manifest.listCursor };
}

/**
 * Download a pre-computed list of batch IDs for one app and register them.
 * `onEach` fires after each batch is stored; callers use it to track global progress.
 *
 * `nextCursor` (from the {@link listNewBatchIds} call that produced `batchIds`)
 * is only persisted once every batch below has downloaded successfully — a
 * `pullBatch` throw partway through leaves `listCursor` (and `manifest.files`,
 * saved together in the same call) untouched, so the next sync resumes from
 * the old cursor and retries the missing batches instead of silently skipping
 * them.
 *
 * When there is nothing to download, the cursor is still persisted if it
 * advanced: a zero-download walk only observed ids already in
 * `manifest.files`, so the cursor cannot skip anything. This makes the
 * legacy-cursor heal in `loadManifest` durable and bootstraps the cursor for
 * manifests written before it existed, instead of re-walking the full list
 * on every sync until the next new batch happens to arrive.
 */
export async function downloadBatchIds(
  config:      StarfishConfig,
  app:         string,
  batchIds:    string[],
  nextCursor:  string | null,
  onEach?:     () => void,
  concurrency: number = DEFAULT_DOWNLOAD_CONCURRENCY,
): Promise<void> {
  const manifest = loadManifest(app);

  if (batchIds.length === 0) {
    if (nextCursor !== manifest.listCursor) {
      manifest.listCursor = nextCursor;
      saveManifest(app, manifest);
    }
    return;
  }

  const appMap = _registry.get(app) ?? new Map<string, Uint8Array>();

  const results = await mapWithConcurrency(batchIds, concurrency, async (batchId) => {
    const fileName       = batchFileName(batchId);
    const { data, etag } = await pullBatch(config, app, batchId);
    const bytes          = new Uint8Array(data);
    appMap.set(fileName, bytes);
    await idbPut(app, fileName, bytes);
    manifest.files[fileName] = {
      etag,
      syncedAt: new Date().toISOString(),
      bytes:    bytes.byteLength,
    };
    onEach?.();
  });

  // Bytes already fetched this round are queryable in the current session
  // immediately, even if a sibling download below fails — the manifest/cursor
  // (localStorage) are the only state gated on full success.
  _registry.set(app, appMap);

  const failed = results.find((r) => r.error);
  if (failed) {
    // All-or-nothing: manifest.files/listCursor stay exactly as loaded, so
    // the next sync re-lists and re-downloads every batch in this round
    // (including ones that just succeeded) rather than silently skipping the
    // failed one. Bytes already idbPut'd for successful siblings are
    // harmless orphans — re-idbPut on the retry is an idempotent overwrite.
    throw failed.error instanceof Error
      ? failed.error
      : new Error(`Starfish download failed for ${app}: ${String(failed.error)}`);
  }

  manifest.lastSyncAt = new Date().toISOString();
  manifest.listCursor = nextCursor;
  saveManifest(app, manifest);
}

/**
 * Incrementally pull new Parquet batches for one app from Starfish into _registry.
 * Uses a two-phase approach (list → download) so `total` is known before progress starts,
 * avoiding indeterminate spinners.
 */
export async function syncApp(
  config:      StarfishConfig,
  app:         string,
  onProgress?: (done: number, total: number) => void,
  concurrency: number = DEFAULT_DOWNLOAD_CONCURRENCY,
): Promise<void> {
  const { ids: newBatchIds, nextCursor } = await listNewBatchIds(config, app);
  let done = 0;
  await downloadBatchIds(config, app, newBatchIds, nextCursor, () => {
    done++;
    onProgress?.(done, newBatchIds.length);
  }, concurrency);

  const manifest = loadManifest(app);
  const skipped  = Object.keys(manifest.files).length - newBatchIds.length;
  console.log(
    `[dashboard] Starfish sync (${app}): ${newBatchIds.length} downloaded,`,
    `${skipped} skipped, ${Object.keys(manifest.files).length} total`,
  );
}

/**
 * Fill the in-memory registry for one app from IndexedDB (fast path) or network
 * (fallback), for files that are in the manifest but not already in _registry.
 * Called after syncApp() — covers files downloaded in a previous session.
 */
export async function rehydrateApp(
  config:      StarfishConfig,
  app:         string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const manifest = loadManifest(app);
  const appMap   = _registry.get(app) ?? new Map<string, Uint8Array>();
  const missing  = Object.keys(manifest.files).filter((f) => !appMap.has(f));
  if (missing.length === 0) { _registry.set(app, appMap); return; }

  let fromIdb     = 0;
  let fromNetwork = 0;

  for (let i = 0; i < missing.length; i++) {
    const fileName = missing[i]!;
    // 1. Try IndexedDB first (no network needed)
    const cached = await idbGet(app, fileName);
    if (cached) {
      appMap.set(fileName, cached);
      fromIdb += 1;
    } else {
      // 2. IDB miss (first reload after upgrade, or IDB cleared) — pull from network
      const batchId = fileName.endsWith('.parquet') ? fileName.slice(0, -'.parquet'.length) : fileName;
      const { data } = await pullBatch(config, app, batchId);
      const bytes = new Uint8Array(data);
      appMap.set(fileName, bytes);
      await idbPut(app, fileName, bytes);  // backfill IndexedDB
      fromNetwork += 1;
    }
    onProgress?.(i + 1, missing.length);
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
