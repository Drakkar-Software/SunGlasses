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
});
