import type { EventCountPeriod, IMiddleware, MiddlewareNext, SunglassesEvent } from '../types.js';
import type { EventCounter } from '../EventCounter.js';

export interface FrequencyMiddlewareOptions {
  /**
   * The EventCounter instance to read from.
   * Obtain this from `SunglassesCore.eventCounter` after calling create()
   * with `enableEventCounting: true`.
   */
  counter: EventCounter;

  /**
   * Which periods to attach to event properties. Default: ['daily', 'monthly'].
   * Each selected period adds a property like `$count_daily` or `$count_monthly`.
   */
  periods?: EventCountPeriod[];

  /**
   * Only attach count properties for these event names.
   * When omitted, counts are attached to all `capture` events.
   */
  onlyFor?: string[];
}

/**
 * Optional middleware that reads event counts from EventCounter and attaches
 * them to outgoing event properties.
 *
 * Properties added (example with periods: ['daily', 'monthly', 'all-time']):
 * ```json
 * {
 *   "$count_daily":    3,
 *   "$count_monthly":  12,
 *   "$count_all_time": 47
 * }
 * ```
 *
 * Usage:
 * ```ts
 * const counter = core.eventCounter!;
 * const freq = new FrequencyMiddleware({ counter, periods: ['daily', 'monthly'] });
 *
 * // Pass at creation time:
 * const client = await SunglassesCore.create({
 *   enableEventCounting: true,
 *   middleware: [freq],
 *   ...
 * });
 * ```
 *
 * Note: counts reflect the state BEFORE this event is counted (EventCounter.increment
 * is called from SunglassesCore before the middleware runs, so the attached count
 * already includes the current event).
 */
export class FrequencyMiddleware implements IMiddleware {
  readonly name = 'FrequencyMiddleware';

  private readonly counter: EventCounter;
  private readonly periods: EventCountPeriod[];
  private readonly onlyFor: Set<string> | null;

  constructor(options: FrequencyMiddlewareOptions) {
    this.counter = options.counter;
    this.periods = options.periods ?? ['daily', 'monthly'];
    this.onlyFor = options.onlyFor ? new Set(options.onlyFor) : null;
  }

  async process(event: SunglassesEvent, next: MiddlewareNext): Promise<SunglassesEvent | null> {
    // Only annotate capture events (not $screen, $identify, $alias)
    if (event.type !== 'capture') return next(event);
    // Skip if not in the onlyFor allowlist
    if (this.onlyFor !== null && !this.onlyFor.has(event.event)) return next(event);

    const now = new Date(event.timestamp);
    const counts = await Promise.all(
      this.periods.map(async (period) => {
        const count = await this.counter.getCount(event.event, period, now);
        return [periodPropKey(period), count] as const;
      })
    );

    const countProps = Object.fromEntries(counts);
    return next({
      ...event,
      properties: { ...event.properties, ...countProps },
    });
  }
}

/** Map a period to a property key, e.g. 'all-time' → '$count_all_time' */
function periodPropKey(period: EventCountPeriod): string {
  return `$count_${period.replace('-', '_')}`;
}
