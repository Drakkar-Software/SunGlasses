import type { IMiddleware, MiddlewareNext, SunglassesEvent } from '../types.js';

export interface SamplingMiddlewareOptions {
  /**
   * Fraction of events to keep, between 0 (drop all) and 1 (keep all).
   * Example: 0.1 keeps ~10% of events.
   */
  sampleRate: number;

  /**
   * Only apply sampling to these event names.
   * When omitted, all `capture` events are subject to sampling.
   * `$screen`, `$identify`, and `$alias` events are never sampled (always kept).
   */
  onlyFor?: string[];

  /**
   * When true, the sampling decision is consistent per user session
   * (based on anonymousId hash), so the same user is always included
   * or always excluded. Default: false (random per event).
   */
  consistentSampling?: boolean;
}

/**
 * Middleware that randomly drops a fraction of events to reduce analytics volume.
 *
 * Usage:
 * ```ts
 * const sampling = new SamplingMiddleware({ sampleRate: 0.1 }); // Keep 10%
 *
 * const client = await SunglassesCore.create({
 *   middleware: [sampling],
 *   ...
 * });
 * ```
 *
 * Privacy note: because sampling is done client-side, opted-out users are
 * never sampled (they never reach this middleware).
 */
export class SamplingMiddleware implements IMiddleware {
  readonly name = 'SamplingMiddleware';

  private readonly sampleRate: number;
  private readonly onlyFor: Set<string> | null;
  private readonly consistentSampling: boolean;

  constructor(options: SamplingMiddlewareOptions) {
    if (options.sampleRate < 0 || options.sampleRate > 1) {
      throw new Error('SamplingMiddleware: sampleRate must be between 0 and 1');
    }
    this.sampleRate = options.sampleRate;
    this.onlyFor = options.onlyFor ? new Set(options.onlyFor) : null;
    this.consistentSampling = options.consistentSampling ?? false;
  }

  async process(event: SunglassesEvent, next: MiddlewareNext): Promise<SunglassesEvent | null> {
    // Always pass through non-capture events (identity, screen, alias)
    if (event.type !== 'capture') return next(event);

    // Skip events not in the allowlist
    if (this.onlyFor !== null && !this.onlyFor.has(event.event)) return next(event);

    const shouldKeep = this.consistentSampling
      ? this.isIncludedByIdentity(event.anonymousId)
      : Math.random() < this.sampleRate;

    if (!shouldKeep) return null; // Drop the event

    return next({
      ...event,
      properties: {
        ...event.properties,
        $sample_rate: this.sampleRate,
      },
    });
  }

  /**
   * Determine inclusion based on anonymousId hash.
   * Produces a stable 0–1 value for the identity so the decision is consistent
   * across all events in the same session.
   */
  private isIncludedByIdentity(anonymousId: string): boolean {
    // Simple, fast hash: FNV-1a variant (32-bit, no crypto needed for sampling)
    let hash = 2166136261;
    for (let i = 0; i < anonymousId.length; i++) {
      hash ^= anonymousId.charCodeAt(i);
      hash = (hash * 16777619) >>> 0; // Keep to 32 bits (unsigned)
    }
    const fraction = hash / 0xffffffff;
    return fraction < this.sampleRate;
  }
}
