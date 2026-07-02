import { useSyncStatus } from '../hooks/useSyncStatus';

/**
 * Global background-sync indicator — lives in the FilterBar's right slot.
 * Shows batch download progress while new data is pulled in the background
 * (lazy boot on reload, manual "Refresh data") and surfaces background sync
 * errors. Renders nothing when idle/ready so the top bar stays clean.
 */
export function SyncStatusIndicator() {
  const { phase, done, total, error } = useSyncStatus();

  if (phase === 'downloading' && total > 0) {
    const pct = Math.min(100, Math.round((done / total) * 100));
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <span className="text-xs text-muted-fg tabular-nums whitespace-nowrap">
          Downloading {done} / {total}…
        </span>
        <div className="h-[3px] w-32 rounded-full bg-primary/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={done}
            aria-valuemax={total}
            aria-label={`Downloading ${done} of ${total} batches`}
          />
        </div>
      </div>
    );
  }

  if (phase === 'error' && error) {
    return (
      <span className="text-xs text-destructive truncate max-w-[240px]" role="status" title={error}>
        Sync failed: {error}
      </span>
    );
  }

  return null;
}
