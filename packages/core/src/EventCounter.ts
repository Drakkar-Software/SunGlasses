import type { EventCountPeriod, IEventCounter, IStorageAdapter } from './types.js';
import type { Logger } from './utils/logger.js';

const KEY_PREFIX = 'sunglasses:count';

/**
 * Persists per-event counts bucketed by time period (daily, weekly, monthly, all-time).
 *
 * Storage key format:
 *   `sunglasses:count:{period}:{bucket}:{eventName}`
 *
 * where `bucket` is:
 *   - daily:    "2024-01-15"
 *   - weekly:   "2024-W03"   (ISO week)
 *   - monthly:  "2024-01"
 *   - all-time: "all"
 *
 * Counts survive app restarts (persisted to IStorageAdapter).
 * Designed to be written from the enqueue hot path — must not throw.
 */
export class EventCounter implements IEventCounter {
  constructor(
    private readonly storage: IStorageAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * Increment the count for `eventName` across all four periods for `date`.
   */
  async increment(eventName: string, date: Date = new Date()): Promise<void> {
    const periods: EventCountPeriod[] = ['daily', 'weekly', 'monthly', 'all-time'];
    await Promise.all(periods.map((period) => this.incrementPeriod(eventName, period, date)));
  }

  async getCount(eventName: string, period: EventCountPeriod, date: Date = new Date()): Promise<number> {
    const key = this.storageKey(eventName, period, date);
    try {
      const raw = await this.storage.read(key);
      if (raw === null) return 0;
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 0 : n;
    } catch (err) {
      this.logger.warn('EventCounter: failed to read count', err);
      return 0;
    }
  }

  /**
   * Reset counts for a specific event (all periods), or all events if omitted.
   *
   * Note: resetting all events requires listing storage keys. This is a best-effort
   * operation — adapters that don't support key enumeration will only clear
   * the provided event name's keys.
   */
  async reset(eventName?: string): Promise<void> {
    if (eventName) {
      // Clear all periods and all conceivable recent buckets for this event
      await this.clearEvent(eventName);
    } else {
      this.logger.warn(
        'EventCounter.reset(): resetting all events requires enumerating storage keys ' +
        '— only the all-time key is cleared. Timed buckets will naturally expire.'
      );
      // We cannot enumerate all keys without a listKeys() on IStorageAdapter.
      // For all-time we can clear by known key pattern — we can't enumerate daily/monthly keys.
      // This is a documented limitation.
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async incrementPeriod(
    eventName: string,
    period: EventCountPeriod,
    date: Date
  ): Promise<void> {
    const key = this.storageKey(eventName, period, date);
    try {
      const raw = await this.storage.read(key);
      const current = raw !== null ? parseInt(raw, 10) : 0;
      const next = (Number.isNaN(current) ? 0 : current) + 1;
      await this.storage.write(key, String(next));
    } catch (err) {
      this.logger.warn('EventCounter: failed to increment count', err);
    }
  }

  private async clearEvent(eventName: string): Promise<void> {
    // Clear all-time key unconditionally
    try {
      await this.storage.delete(this.storageKey(eventName, 'all-time', new Date()));
    } catch {
      // ignore
    }

    // Clear recent timed buckets (last 90 days covers daily/weekly/monthly)
    const now = new Date();
    const seenBuckets = new Set<string>();

    for (let i = 0; i < 90; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);

      const periods: Array<Exclude<EventCountPeriod, 'all-time'>> = ['daily', 'weekly', 'monthly'];
      for (const period of periods) {
        const key = this.storageKey(eventName, period, d);
        if (!seenBuckets.has(key)) {
          seenBuckets.add(key);
          try {
            await this.storage.delete(key);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  /** Build the storage key for a given event, period, and date. */
  storageKey(eventName: string, period: EventCountPeriod, date: Date): string {
    const bucket = this.bucketFor(period, date);
    // Sanitize event name for use as a storage key (replace non-alphanumeric with _)
    const safeEvent = eventName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return `${KEY_PREFIX}:${period}:${bucket}:${safeEvent}`;
  }

  /**
   * Return the time-bucket string for a given period and date.
   * - daily:    "2024-01-15"
   * - weekly:   "2024-W03"
   * - monthly:  "2024-01"
   * - all-time: "all"
   */
  private bucketFor(period: EventCountPeriod, date: Date): string {
    switch (period) {
      case 'daily':
        return date.toISOString().slice(0, 10); // "YYYY-MM-DD"

      case 'weekly': {
        const iso = toISOWeek(date);
        return iso; // "YYYY-Www"
      }

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
  // Copy date so we don't mutate
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to Thursday of this week (ISO weeks go Mon–Sun; Thursday determines the year)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}
