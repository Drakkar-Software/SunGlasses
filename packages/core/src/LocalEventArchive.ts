import type { CleanupConfig, IStorageAdapter, SunglassesEvent } from './types.js';
import type { Logger } from './utils/logger.js';

const STORAGE_KEY = 'sg:archive';

interface ArchiveStore {
  version: '1';
  events: SunglassesEvent[];
}

/**
 * Append-only local event archive.
 *
 * Unlike the EventQueue (which removes events after a successful flush),
 * the LocalEventArchive retains every event indefinitely — until the user
 * explicitly calls `cleanup()` or `clear()`.
 *
 * Use cases:
 * - Full audit trail of all captured events
 * - Re-syncing a remote store (e.g. Starfish) after a failure
 * - GDPR data portability export
 * - Offline-first: accumulate events when a remote adapter is unreachable
 *
 * Enable via `SunglassesConfig.enableLocalArchive: true`.
 */
export class LocalEventArchive {
  private events: SunglassesEvent[] = [];

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * Load all previously archived events from storage.
   * Call once during SDK initialization.
   */
  async initialize(): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEY);
      if (raw !== null) {
        const store = JSON.parse(raw) as ArchiveStore;
        this.events = store.events ?? [];
        this.logger.debug(
          'LocalEventArchive: loaded',
          this.events.length,
          'archived events'
        );
      }
    } catch (err) {
      this.logger.warn('LocalEventArchive: failed to load archive', err);
      this.events = [];
    }
  }

  /**
   * Append events to the archive.
   * Deduplicates by `messageId` — safe to call multiple times with the same batch.
   */
  async append(events: SunglassesEvent[]): Promise<void> {
    if (events.length === 0) return;

    const existingIds = new Set(this.events.map((e) => e.messageId));
    const newEvents = events.filter((e) => !existingIds.has(e.messageId));

    if (newEvents.length === 0) return;

    this.events = [...this.events, ...newEvents];
    await this.persist();
  }

  /** All archived events (oldest first). */
  getAll(): SunglassesEvent[] {
    return [...this.events];
  }

  /** Number of archived events. */
  get size(): number {
    return this.events.length;
  }

  /**
   * Prune archived events by age and/or count.
   * `maxEventsPerIdentity` is applied **per distinctId** — each identity keeps its
   * most recent N events independently. If neither option is set, nothing is removed.
   */
  async cleanup(config: CleanupConfig = {}): Promise<void> {
    let filtered = [...this.events];

    if (config.maxAgeMs && config.maxAgeMs > 0) {
      const cutoff = Date.now() - config.maxAgeMs;
      filtered = filtered.filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        // Drop events with malformed timestamps (NaN) and those older than cutoff
        return !Number.isNaN(ts) && ts >= cutoff;
      });
    }

    const maxN = config.maxEventsPerIdentity ?? 0;
    if (maxN > 0) {
      // Group by distinctId, keep the most recent N per identity, then flatten
      // preserving the original chronological order across identities.
      const byIdentity = new Map<string, SunglassesEvent[]>();
      for (const event of filtered) {
        const id = event.distinctId;
        if (!byIdentity.has(id)) byIdentity.set(id, []);
        byIdentity.get(id)!.push(event);
      }
      const kept = new Set<string>();
      for (const events of byIdentity.values()) {
        // events are chronological; take the last maxN
        const slice = events.slice(Math.max(0, events.length - maxN));
        for (const e of slice) kept.add(e.messageId);
      }
      filtered = filtered.filter((e) => kept.has(e.messageId));
    }

    this.events = filtered;
    await this.persist();
    this.logger.debug('LocalEventArchive: after cleanup, size =', this.events.length);
  }

  /**
   * Remove all archived events and clear storage.
   * This is irreversible.
   */
  async clear(): Promise<void> {
    this.events = [];
    try {
      await this.storage.delete(STORAGE_KEY);
    } catch (err) {
      this.logger.warn('LocalEventArchive: failed to clear storage', err);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    try {
      const store: ArchiveStore = { version: '1', events: this.events };
      await this.storage.write(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      this.logger.warn('LocalEventArchive: failed to persist archive', err);
    }
  }
}
