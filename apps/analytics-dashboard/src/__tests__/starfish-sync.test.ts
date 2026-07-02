/**
 * Unit tests for the incremental-listing behavior added to starfish-sync.ts:
 * the manifest's persisted `listCursor` should let a sync resume from where
 * the last successful one left off, instead of re-walking the entire
 * `/list` result on every call.
 *
 * `listBatches` and `pullBatch` (network) and the IndexedDB helpers are
 * mocked — this is a pure logic test of the cursor bookkeeping, not an
 * end-to-end integration test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListBatchesResult } from '../engine/starfish-client.js';
import type { StarfishConfig } from '../engine/config.js';

// ── localStorage stub (not available in vitest's default node environment) ────
class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  get length(): number { return this.store.size; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
}

// ── Fake Starfish `/list` server — mirrors the real route's semantics ─────────
// (ascending order, strict `after` cursor, `limit`+1 hasMore probe) so the
// resume logic under test is exercised meaningfully, not just fed canned pages.
function makeFakeList(allIds: string[]) {
  return vi.fn(
    async (_config: StarfishConfig, _app: string, opts?: { after?: string; limit?: number }): Promise<ListBatchesResult> => {
      const limit    = opts?.limit ?? 100;
      const filtered = opts?.after ? allIds.filter((id) => id > opts.after!) : [...allIds];
      const items    = filtered.slice(0, limit);
      return { items, hasMore: filtered.length > limit };
    },
  );
}

const mockListBatches = vi.fn();
const mockPullBatch   = vi.fn();
const mockIdbPut      = vi.fn(async () => undefined);
const mockIdbGet      = vi.fn(async () => null);

vi.mock('../engine/starfish-client.js', () => ({
  listBatches: (...args: unknown[]) => mockListBatches(...args),
  pullBatch:   (...args: unknown[]) => mockPullBatch(...args),
}));

vi.mock('../engine/idb-cache.js', () => ({
  idbGet:      (...args: unknown[]) => mockIdbGet(...args),
  idbPut:      (...args: unknown[]) => mockIdbPut(...args),
  idbClearApp: vi.fn(async () => undefined),
  idbClearAll: vi.fn(async () => undefined),
}));

const CONFIG: StarfishConfig = { baseUrl: 'https://example.test', apps: ['myapp'], publicRead: true };
const APP = 'myapp';

function fakeBytes(): { data: ArrayBuffer; etag: string } {
  return { data: new TextEncoder().encode('parquet-bytes').buffer, etag: 'etag-1' };
}

describe('starfish-sync incremental listing', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new FakeLocalStorage());
    mockListBatches.mockReset();
    mockPullBatch.mockReset().mockImplementation(async () => fakeBytes());
    mockIdbPut.mockClear();
    mockIdbGet.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('first sync walks the full list (no cursor yet) and persists the high-water mark', async () => {
    const { listNewBatchIds } = await import('../engine/starfish-sync.js');
    mockListBatches.mockImplementation(makeFakeList(['id-1', 'id-2', 'id-3']));

    const { ids, nextCursor } = await listNewBatchIds(CONFIG, APP);

    expect(ids).toEqual(['id-1', 'id-2', 'id-3']);
    expect(nextCursor).toBe('id-3');
    // Started from an empty manifest → after is undefined on the first call.
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: undefined, limit: 100 });
  });

  it('a second sync with nothing new issues exactly one list call (after=cursor) and downloads nothing', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = ['id-1', 'id-2', 'id-3'];
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);
    expect(mockPullBatch).toHaveBeenCalledTimes(3);

    mockListBatches.mockClear();
    mockPullBatch.mockClear();

    await syncApp(CONFIG, APP);

    expect(mockListBatches).toHaveBeenCalledTimes(1);
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: 'id-3', limit: 100 });
    expect(mockPullBatch).not.toHaveBeenCalled();
  });

  it('resumes only the delta once new batches appear on the server', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = ['id-1', 'id-2', 'id-3'];
    mockListBatches.mockImplementation(makeFakeList(allIds));
    await syncApp(CONFIG, APP);

    allIds.push('id-4', 'id-5');
    mockListBatches.mockClear();
    mockPullBatch.mockClear();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);

    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: 'id-3', limit: 100 });
    expect(mockPullBatch).toHaveBeenCalledTimes(2);
    expect(mockPullBatch).toHaveBeenCalledWith(CONFIG, APP, 'id-4');
    expect(mockPullBatch).toHaveBeenCalledWith(CONFIG, APP, 'id-5');
  });

  it('a mid-batch download failure leaves the cursor unadvanced and retries only the missing batches next sync', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = ['id-1', 'id-2', 'id-3'];
    mockListBatches.mockImplementation(makeFakeList(allIds));

    // id-2 fails to download.
    mockPullBatch.mockImplementation(async (_config: unknown, _app: unknown, batchId: string) => {
      if (batchId === 'id-2') throw new Error('network error');
      return fakeBytes();
    });

    await expect(syncApp(CONFIG, APP)).rejects.toThrow('network error');

    mockListBatches.mockClear();
    mockPullBatch.mockClear();
    // Second attempt: let everything succeed.
    mockPullBatch.mockImplementation(async () => fakeBytes());

    await syncApp(CONFIG, APP);

    // Cursor never advanced past the failed sync, so this walks from the
    // beginning again (manifest.files also never persisted id-1's success,
    // per the same atomic saveManifest — see downloadBatchIds).
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: undefined, limit: 100 });
    // All three batches are retried — none were durably recorded as synced.
    expect(mockPullBatch).toHaveBeenCalledTimes(3);
  });

  it('downloadBatchIds does not touch the manifest at all when there is nothing new to download', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    mockListBatches.mockImplementation(makeFakeList([]));

    await syncApp(CONFIG, APP);

    expect(mockPullBatch).not.toHaveBeenCalled();
    expect(mockIdbPut).not.toHaveBeenCalled();
    // No manifest key should have been written to localStorage.
    expect(localStorage.getItem('starfish-manifest-myapp')).toBeNull();
  });

  // ── Mixed legacy-UUID / server-sortable id collections ──────────────────────
  // Collections written before starfish-events v3.0.0-alpha.62 contain
  // client-minted random UUID v4 batch ids, which are spread across the whole
  // lexicographic range; server-assigned sortable ids sort low (digit-leading).
  // The cursor must never be a legacy id or it hides every future batch.

  const SORTABLE_1 = '01J0000001';
  const SORTABLE_2 = '01J0000002';
  const SORTABLE_3 = '01J0000003';
  const LEGACY_LOW  = '4b2e6f0a-2f3d-4c5b-9a1e-000000000001';
  const LEGACY_HIGH = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  function persistedManifest(): { files: Record<string, unknown>; listCursor: string | null } {
    return JSON.parse(localStorage.getItem('starfish-manifest-myapp')!);
  }

  function seedManifest(ids: string[], listCursor: string | null): void {
    const files: Record<string, unknown> = {};
    for (const id of ids) {
      files[`${id}.parquet`] = { etag: 'etag-1', syncedAt: '2026-07-01T00:00:00.000Z', bytes: 13 };
    }
    localStorage.setItem(
      'starfish-manifest-myapp',
      JSON.stringify({ files, lastSyncAt: '2026-07-01T00:00:00.000Z', listCursor }),
    );
  }

  describe('isLegacyBatchId', () => {
    it('matches real crypto.randomUUID() output (guards against regex shape bugs)', async () => {
      const { isLegacyBatchId } = await import('../engine/starfish-sync.js');
      for (let i = 0; i < 20; i++) {
        expect(isLegacyBatchId(crypto.randomUUID())).toBe(true);
      }
    });

    it('matches a legacy id with a .parquet suffix', async () => {
      const { isLegacyBatchId } = await import('../engine/starfish-sync.js');
      expect(isLegacyBatchId(`${LEGACY_HIGH}.parquet`)).toBe(true);
    });

    it('does not match server-sortable, UUIDv7-shaped, or uppercase ids', async () => {
      const { isLegacyBatchId } = await import('../engine/starfish-sync.js');
      expect(isLegacyBatchId(SORTABLE_1)).toBe(false);
      // UUIDv7 is time-sortable — version nibble 7 must not be treated as legacy.
      expect(isLegacyBatchId('01890a5d-ac96-774b-bcce-b302099a8057')).toBe(false);
      // generateUUID() only ever emits lowercase.
      expect(isLegacyBatchId('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(false);
    });
  });

  it('never persists a legacy UUID as the cursor, so new sortable batches are still fetched', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = [SORTABLE_1, LEGACY_LOW, LEGACY_HIGH].sort();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);

    expect(mockPullBatch).toHaveBeenCalledTimes(3);
    // The lexicographic max is LEGACY_HIGH — the cursor must be the max *sortable* id.
    expect(persistedManifest().listCursor).toBe(SORTABLE_1);

    allIds.push(SORTABLE_2);
    allIds.sort();
    mockListBatches.mockClear();
    mockPullBatch.mockClear();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);

    // The new sortable batch sorts below the legacy UUIDs but above the cursor —
    // it must be found and downloaded (on the pre-fix code the cursor would be
    // LEGACY_HIGH and this sync would see nothing).
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: SORTABLE_1, limit: 100 });
    expect(mockPullBatch).toHaveBeenCalledTimes(1);
    expect(mockPullBatch).toHaveBeenCalledWith(CONFIG, APP, SORTABLE_2);
    expect(persistedManifest().listCursor).toBe(SORTABLE_2);
  });

  it('heals a poisoned legacy cursor persisted by dashboard 0.14.1', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    // 0.14.1 persisted the lexicographic max of the mixed collection — a legacy UUID.
    seedManifest([SORTABLE_1, LEGACY_LOW, LEGACY_HIGH], LEGACY_HIGH);
    const allIds = [SORTABLE_1, SORTABLE_3, LEGACY_LOW, LEGACY_HIGH].sort();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);

    // Healed cursor → full walk from the beginning, not after the poisoned id.
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: undefined, limit: 100 });
    // Only the genuinely new batch is downloaded — the manifest dedupe still applies.
    expect(mockPullBatch).toHaveBeenCalledTimes(1);
    expect(mockPullBatch).toHaveBeenCalledWith(CONFIG, APP, SORTABLE_3);
    expect(persistedManifest().listCursor).toBe(SORTABLE_3);
  });

  it('keeps the full-scan fallback for all-legacy collections (older server)', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = [LEGACY_LOW, LEGACY_HIGH].sort();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);
    expect(mockPullBatch).toHaveBeenCalledTimes(2);
    expect(persistedManifest().listCursor).toBeNull();

    mockListBatches.mockClear();
    mockPullBatch.mockClear();

    await syncApp(CONFIG, APP);

    // No sortable id has ever been seen → still a full scan, nothing re-downloaded.
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: undefined, limit: 100 });
    expect(mockPullBatch).not.toHaveBeenCalled();
  });

  it('persists an advanced cursor even when there is nothing to download (heal durability / pre-cursor bootstrap)', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    // Manifest written before listCursor existed: files known, cursor null.
    seedManifest([SORTABLE_1, LEGACY_LOW, LEGACY_HIGH], null);
    mockListBatches.mockImplementation(makeFakeList([SORTABLE_1, LEGACY_LOW, LEGACY_HIGH].sort()));

    await syncApp(CONFIG, APP);

    // Nothing new, but the observed max sortable id becomes the cursor — every
    // id it covers is already in manifest.files, so nothing can be skipped.
    expect(mockPullBatch).not.toHaveBeenCalled();
    expect(persistedManifest().listCursor).toBe(SORTABLE_1);

    mockListBatches.mockClear();
    await syncApp(CONFIG, APP);
    expect(mockListBatches).toHaveBeenCalledTimes(1);
    expect(mockListBatches).toHaveBeenCalledWith(CONFIG, APP, { after: SORTABLE_1, limit: 100 });
  });

  it('paginates a multi-page mixed collection with raw after values and a sortable cursor', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const legacy = Array.from({ length: 120 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`);
    const allIds = [SORTABLE_1, SORTABLE_2, ...legacy].sort();
    mockListBatches.mockImplementation(makeFakeList(allIds));

    await syncApp(CONFIG, APP);

    expect(mockPullBatch).toHaveBeenCalledTimes(122);
    // Page 2 resumes from the raw last item of page 1 (a legacy id) — pagination
    // must not skip ahead to the sortable cursor.
    expect(mockListBatches).toHaveBeenCalledTimes(2);
    expect(mockListBatches).toHaveBeenNthCalledWith(1, CONFIG, APP, { after: undefined, limit: 100 });
    expect(mockListBatches).toHaveBeenNthCalledWith(2, CONFIG, APP, { after: allIds[99], limit: 100 });
    expect(persistedManifest().listCursor).toBe(SORTABLE_2);
  });

  it('a mid-batch failure in a mixed collection persists nothing and retries cleanly', async () => {
    const { syncApp } = await import('../engine/starfish-sync.js');
    const allIds = [SORTABLE_1, LEGACY_LOW, LEGACY_HIGH].sort();
    mockListBatches.mockImplementation(makeFakeList(allIds));
    mockPullBatch.mockImplementation(async (_config: unknown, _app: unknown, batchId: string) => {
      if (batchId === LEGACY_LOW) throw new Error('network error');
      return fakeBytes();
    });

    await expect(syncApp(CONFIG, APP)).rejects.toThrow('network error');
    expect(localStorage.getItem('starfish-manifest-myapp')).toBeNull();

    mockPullBatch.mockReset().mockImplementation(async () => fakeBytes());

    await syncApp(CONFIG, APP);

    expect(mockPullBatch).toHaveBeenCalledTimes(3);
    expect(persistedManifest().listCursor).toBe(SORTABLE_1);
  });
});
