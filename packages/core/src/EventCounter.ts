import type { EventCountPeriod, IEventCounter, IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';

const COUNTS_KEY = 'sg:counts';

/**
 * Persists per-event counts bucketed by time period (daily, weekly, monthly, all-time).
 *
 * All counts are stored in a single `sg:counts` JSON blob, keyed internally by
 * `{period}:{bucket}:{eventName}` within the object:
 *   `{ "daily:2024-01-15:click": 3, "weekly:2024-W03:click": 7, ... }`
 *
 * One storage key regardless of how many event types are tracked.
 * Counts survive app restarts (persisted to IStorageAdapter).
 * Designed to be written from the enqueue hot path — must not throw.
 */
export class EventCounter implements IEventCounter {
  /**
   * In-memory cache of counts keyed by sub-key (`{period}:{bucket}:{eventName}`).
   * Updated synchronously on increment so getCount() can return immediately.
   */
  private readonly cache = new Map<string, number>();

  /** Whether the counts blob has been loaded from storage into cache. */
  private loaded = false;

  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * Increment the count for `eventName` across all four periods for `date`.
   */
  async increment(eventName: string, date: Date = new Date()): Promise<void> {
    await this.loadIfNeeded();
    const periods: EventCountPeriod[] = ['daily', 'weekly', 'monthly', 'all-time'];
    for (const period of periods) {
      const key = this.subKey(eventName, period, date);
      this.cache.set(key, (this.cache.get(key) ?? 0) + 1);
    }
    await this.persist();
  }

  async getCount(eventName: string, period: EventCountPeriod, date: Date = new Date()): Promise<number> {
    await this.loadIfNeeded();
    return this.cache.get(this.subKey(eventName, period, date)) ?? 0;
  }

  /**
   * Reset counts for a specific event (all periods), or all events if omitted.
   */
  async reset(eventName?: string): Promise<void> {
    await this.loadIfNeeded();
    if (eventName) {
      const safeEvent = eventName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      for (const key of this.cache.keys()) {
        if (key.endsWith(`:${safeEvent}`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
    await this.persist();
    this.logger.debug('EventCounter.reset(): cleared event counters');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Load the counts blob from storage into the in-memory cache.
   * Only runs once; subsequent calls are no-ops.
   */
  private async loadIfNeeded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await this.storage.read(COUNTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number') this.cache.set(k, v);
      }
    } catch (err) {
      this.logger.warn('EventCounter: failed to load counts blob', err);
    }
  }

  /** Serialize the full in-memory cache to `sg:counts`. */
  private async persist(): Promise<void> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.cache) obj[k] = v;
    try {
      await this.storage.write(COUNTS_KEY, JSON.stringify(obj));
    } catch (err) {
      this.logger.warn('EventCounter: failed to persist counts blob', err);
    }
  }

  /** Build the sub-key within the counts blob for a given event, period, and date. */
  private subKey(eventName: string, period: EventCountPeriod, date: Date): string {
    const safeEvent = eventName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return `${period}:${this.bucketFor(period, date)}:${safeEvent}`;
  }

  /**
   * Return the time-bucket string for a given period and date.
   * - daily:    "2024-01-15"
   * - weekly:   "2024-W03"   (ISO week)
   * - monthly:  "2024-01"
   * - all-time: "all"
   */
  private bucketFor(period: EventCountPeriod, date: Date): string {
    switch (period) {
      case 'daily':
        return date.toISOString().slice(0, 10); // "YYYY-MM-DD"

      case 'weekly':
        return toISOWeek(date); // "YYYY-Www"

      case 'monthly':
        return date.toISOString().slice(0, 7); // "YYYY-MM"

      case 'all-time':
        return 'all';
    }
  }
}

/**
 * Compute the ISO 8601 week string "YYYY-Www" for a given date.
 * ISO weeks start on Monday. Week 1 is the week containing the first Thursday.
 */
function toISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to Thursday of this week (ISO weeks go Mon–Sun; Thursday determines the year)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}
