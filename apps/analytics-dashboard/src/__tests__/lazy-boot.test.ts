/**
 * Tests for the lazy boot path: the sync-status store and
 * connectLazyFromSaved()'s ordering guarantees — cached data must become
 * queryable (dataVersion > 0) *before* the background download starts, and a
 * download failure must keep the cached data usable.
 *
 * The DuckDB engine and starfish-sync are mocked — this exercises the
 * orchestration in api.ts / engine/sync-status.ts, not the engine itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── sessionStorage stub (not available in vitest's node environment) ──────────
class FakeSessionStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
}

const mockPrepare  = vi.fn(async () => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }));
const mockResync   = vi.fn(async (_p?: (d: number, t: number) => void) => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }));
const mockStarfishConfig = { baseUrl: 'https://sync.example.test', apps: ['myapp'], publicRead: true };

vi.mock('../engine/duckdb.js', () => ({
  configureDirectS3:        vi.fn(async () => undefined),
  configureStarfish:        vi.fn(async () => ({ totalFiles: 0, cacheBytes: 0, lastSyncAt: null })),
  prepareStarfishFromCache: (...args: unknown[]) => mockPrepare(...(args as [])),
  resyncStarfish:           (...args: unknown[]) => mockResync(...(args as Parameters<typeof mockResync>)),
  resetDb:                  vi.fn(async () => undefined),
  isDbReady:                () => false,
  getDataSource:            () => null,
  getS3Config:              () => null,
  getStarfishConfig:        () => mockStarfishConfig,
  getSyncStats:             () => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }),
  queryRaw:                 vi.fn(async () => []),
  addStarfishApp:           vi.fn(),
  removeStarfishApp:        vi.fn(),
}));

vi.mock('../engine/starfish-sync.js', () => ({
  computeSyncStats: () => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }),
}));

function seedSavedStarfishConfig(): void {
  sessionStorage.setItem(
    'sunglasses-dashboard-browser-config',
    JSON.stringify({
      mode:       'starfish',
      remember:   true,
      baseUrl:    'https://sync.example.test',
      apps:       ['myapp'],
      publicRead: true,
    }),
  );
}

describe('sync-status store', () => {
  afterEach(() => vi.resetModules());

  it('notifies subscribers and bumps dataVersion on ready()', async () => {
    const { getSyncState, subscribeSyncState, syncStatus } = await import('../engine/sync-status.js');
    const seen: number[] = [];
    const unsubscribe = subscribeSyncState(() => seen.push(getSyncState().dataVersion));

    syncStatus.preparing();
    syncStatus.ready();
    syncStatus.downloading(1, 4);
    syncStatus.ready();
    unsubscribe();
    syncStatus.ready();

    expect(seen).toEqual([0, 1, 1, 2]);
    expect(getSyncState().dataVersion).toBe(3);
  });

  it('ready(false) marks the engine ready without re-triggering queries', async () => {
    const { getSyncState, syncStatus } = await import('../engine/sync-status.js');
    syncStatus.ready(false);
    expect(getSyncState().dataVersion).toBe(1); // 0 → 1: "ready" must be observable
    syncStatus.ready(false);
    expect(getSyncState().dataVersion).toBe(1); // no-op sync: no bump
    syncStatus.ready();
    expect(getSyncState().dataVersion).toBe(2);
  });

  it('error() keeps dataVersion so cached data stays queryable', async () => {
    const { getSyncState, syncStatus } = await import('../engine/sync-status.js');
    syncStatus.ready();
    syncStatus.error('boom');
    expect(getSyncState().phase).toBe('error');
    expect(getSyncState().error).toBe('boom');
    expect(getSyncState().dataVersion).toBe(1);
  });
});

describe('connectLazyFromSaved', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new FakeSessionStorage());
    mockPrepare.mockClear().mockImplementation(async () => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }));
    mockResync.mockClear().mockImplementation(async () => ({ totalFiles: 3, cacheBytes: 100, lastSyncAt: null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('resolves null when there is no saved config', async () => {
    const { connectLazyFromSaved } = await import('../api.js');
    expect(await connectLazyFromSaved()).toBeNull();
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('makes cached data queryable before the download starts, then bumps again after it', async () => {
    seedSavedStarfishConfig();
    const { connectLazyFromSaved } = await import('../api.js');
    const { getSyncState } = await import('../engine/sync-status.js');

    let versionWhenDownloadStarted = -1;
    mockResync.mockImplementation(async (onProgress?: (d: number, t: number) => void) => {
      versionWhenDownloadStarted = getSyncState().dataVersion;
      onProgress?.(1, 2);
      expect(getSyncState().phase).toBe('downloading');
      expect(getSyncState().done).toBe(1);
      expect(getSyncState().total).toBe(2);
      onProgress?.(2, 2);
      return { totalFiles: 5, cacheBytes: 200, lastSyncAt: null };
    });

    const status = await connectLazyFromSaved();

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(versionWhenDownloadStarted).toBe(1); // cached data was already live
    expect(getSyncState().phase).toBe('ready');
    expect(getSyncState().dataVersion).toBe(2); // new batches → re-query
    expect(status?.ready).toBe(true);
    expect(status?.dataSource).toBe('starfish');
  });

  it('skips the second re-query bump when the download finds nothing new', async () => {
    seedSavedStarfishConfig();
    const { connectLazyFromSaved } = await import('../api.js');
    const { getSyncState } = await import('../engine/sync-status.js');

    await connectLazyFromSaved(); // mockResync never calls onProgress → 0 downloaded

    expect(getSyncState().phase).toBe('ready');
    expect(getSyncState().dataVersion).toBe(1);
  });

  it('keeps cached data usable when the background download fails', async () => {
    seedSavedStarfishConfig();
    const { connectLazyFromSaved } = await import('../api.js');
    const { getSyncState } = await import('../engine/sync-status.js');
    mockResync.mockImplementation(async () => { throw new Error('server unreachable'); });

    const status = await connectLazyFromSaved();

    expect(status?.ready).toBe(true); // shell stays up on cached data
    expect(getSyncState().phase).toBe('error');
    expect(getSyncState().error).toBe('server unreachable');
    expect(getSyncState().dataVersion).toBe(1);
  });

  it('propagates a fatal prepare failure (engine never became ready)', async () => {
    seedSavedStarfishConfig();
    const { connectLazyFromSaved } = await import('../api.js');
    mockPrepare.mockImplementation(async () => { throw new Error('IndexedDB unavailable'); });

    await expect(connectLazyFromSaved()).rejects.toThrow('IndexedDB unavailable');
    expect(mockResync).not.toHaveBeenCalled();
  });

  it('shares one attempt across concurrent callers (StrictMode double-mount)', async () => {
    seedSavedStarfishConfig();
    const { connectLazyFromSaved } = await import('../api.js');

    const [a, b] = await Promise.all([connectLazyFromSaved(), connectLazyFromSaved()]);

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockResync).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});
