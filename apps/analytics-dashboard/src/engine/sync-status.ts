/**
 * Global sync-status store — a minimal external store (no React dependency)
 * that the background data sync reports into and UI components subscribe to
 * via `useSyncExternalStore` (see hooks/useSyncStatus.ts).
 *
 * Why not React state: the sync runs in api.ts/engine code outside the
 * component tree (lazy boot on page reload), and progress ticks must not
 * re-render the whole AppShell — only the indicator subscribes to the full
 * state, while AppShell subscribes to `dataVersion` alone.
 */

export type SyncPhase = 'idle' | 'preparing' | 'downloading' | 'ready' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** Batches downloaded so far in the current download phase. */
  done: number;
  /** Total batches to download in the current download phase. */
  total: number;
  /** Last background sync error — cleared when a new sync starts. */
  error: string | null;
  /**
   * Monotonic counter bumped whenever the queryable data changes (engine
   * became ready, new batches registered, app added/removed). Sections
   * re-run their queries when it changes. 0 = engine not ready yet.
   */
  dataVersion: number;
}

let _state: SyncState = { phase: 'idle', done: 0, total: 0, error: null, dataVersion: 0 };
const _listeners = new Set<() => void>();

/** Current immutable snapshot — stable reference until the next change. */
export function getSyncState(): SyncState {
  return _state;
}

/** Subscribe to state changes. Returns the unsubscribe function. */
export function subscribeSyncState(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function set(partial: Partial<SyncState>): void {
  _state = { ..._state, ...partial };
  for (const listener of _listeners) listener();
}

export const syncStatus = {
  /** Engine init / cache rehydrate started (fast, local — no download yet). */
  preparing(): void {
    set({ phase: 'preparing', done: 0, total: 0, error: null });
  },

  /** Batch download progress — feeds the global progress indicator. */
  downloading(done: number, total: number): void {
    set({ phase: 'downloading', done, total });
  },

  /**
   * Sync phase finished and data is queryable. `dataChanged: false` marks a
   * no-op sync (nothing new downloaded) so sections skip a pointless re-query.
   */
  ready(dataChanged = true): void {
    set({
      phase:       'ready',
      error:       null,
      dataVersion: dataChanged ? _state.dataVersion + 1 : Math.max(_state.dataVersion, 1),
    });
  },

  /**
   * Background sync failed. Cached data (if any) stays queryable — this only
   * surfaces the error in the indicator, it does not un-ready the engine.
   */
  error(message: string): void {
    set({ phase: 'error', error: message });
  },

  /** Reset to the initial state (disconnect). */
  reset(): void {
    set({ phase: 'idle', done: 0, total: 0, error: null, dataVersion: 0 });
  },
};
