import { useSyncExternalStore } from 'react';
import type { SyncState } from '../engine/sync-status';
import { getSyncState, subscribeSyncState } from '../engine/sync-status';

/**
 * Full sync state — re-renders on every change, including per-batch download
 * progress ticks. Use only in small leaf components (the progress indicator).
 */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState);
}

/**
 * Data version only — re-renders when the queryable data actually changes,
 * not on progress ticks. 0 means the engine is not ready yet. AppShell uses
 * this to gate sections and to re-trigger their queries after a sync.
 */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribeSyncState, () => getSyncState().dataVersion);
}
