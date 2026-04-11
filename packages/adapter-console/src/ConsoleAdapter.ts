import type { IAnalyticsAdapter, SunglassesEvent } from '@sunglasses/core';

export interface ConsoleAdapterOptions {
  /**
   * Prefix for all log lines.
   * @default '[SunGlasses]'
   */
  prefix?: string;
  /**
   * When true, each event is logged as a full JSON.stringify.
   * When false (default), uses console.groupCollapsed + console.table for readability.
   */
  verbose?: boolean;
  /**
   * When provided, only events whose name appears in this list are logged.
   * Useful for focusing on specific events during debugging.
   */
  onlyFor?: string[];
}

/**
 * Development-friendly adapter that pretty-prints events to the console.
 *
 * Use this during development in place of (or alongside) a real adapter:
 * ```ts
 * SunglassesCore.create({
 *   adapters: [
 *     new ConsoleAdapter({ verbose: false }),
 *     new HttpStorageAdapter({ endpoint: 'https://...' }),
 *   ],
 *   ...
 * });
 * ```
 *
 * Never include this adapter in production builds (or guard with `process.env.NODE_ENV`).
 */
export class ConsoleAdapter implements IAnalyticsAdapter {
  private readonly prefix: string;
  private readonly verbose: boolean;
  private readonly onlyFor: Set<string> | null;

  constructor(options: ConsoleAdapterOptions = {}) {
    this.prefix = options.prefix ?? '[SunGlasses]';
    this.verbose = options.verbose ?? false;
    this.onlyFor = options.onlyFor ? new Set(options.onlyFor) : null;
  }

  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    for (const event of batch) {
      if (this.onlyFor !== null && !this.onlyFor.has(event.event)) continue;
      this.logEvent(event);
    }
  }

  async reset(): Promise<void> {
    console.log(`${this.prefix} reset() called`);
  }

  async shutdown(): Promise<void> {
    console.log(`${this.prefix} shutdown() called`);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private logEvent(event: SunglassesEvent): void {
    if (this.verbose) {
      console.log(
        `${this.prefix} ${event.type} "${event.event}" @ ${event.timestamp}`,
        JSON.stringify(event, null, 2)
      );
      return;
    }

    // Pretty grouped output
    const label = `${this.prefix} ${event.type} "${event.event}" @ ${event.timestamp}`;
    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(label);
      if (Object.keys(event.properties).length > 0) {
        console.table(event.properties);
      } else {
        console.log('(no properties)');
      }
      console.log('anonymousId:', event.anonymousId);
      if (event.context.sessionId) {
        console.log('sessionId:', event.context.sessionId);
      }
      if (event.context.traits && Object.keys(event.context.traits).length > 0) {
        console.log('traits:', event.context.traits);
      }
      console.groupEnd();
    } else {
      // Fallback for environments without console.groupCollapsed (e.g. some RN setups)
      console.log(label, event.properties);
    }
  }
}
