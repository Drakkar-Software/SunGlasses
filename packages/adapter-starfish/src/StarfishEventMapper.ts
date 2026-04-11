import type { CleanupConfig, SunglassesEvent } from '@drakkar.software/sunglasses-core';

/**
 * The document structure stored at the Starfish path.
 * Starfish is a document-sync system; we maintain a rolling JSON document
 * that accumulates analytics events for each identity.
 */
export interface StarfishEventDocument {
  /** All events recorded for this identity, ordered by timestamp. */
  events: SunglassesEvent[];
  /** ISO-8601 timestamp of the last document update. */
  lastUpdated: string;
  /** Schema version for future migrations. */
  version: '1';
}

/**
 * Creates an empty Starfish event document.
 */
export function createEmptyDocument(): StarfishEventDocument {
  return {
    events: [],
    lastUpdated: new Date().toISOString(),
    version: '1',
  };
}

/**
 * Merge new events into an existing document, de-duplicating by messageId.
 * Remote document takes precedence for metadata fields.
 */
export function mergeEvents(
  remote: StarfishEventDocument,
  incoming: SunglassesEvent[]
): StarfishEventDocument {
  const existingIds = new Set(remote.events.map((e) => e.messageId));
  const newEvents = incoming.filter((e) => !existingIds.has(e.messageId));

  return {
    ...remote,
    events: [...remote.events, ...newEvents],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Resolve the Starfish storage path for a given identity.
 * Replaces `{identity}` in the template with the resolved identity value.
 *
 * @example
 * resolveStoragePath('analytics/{identity}/events', 'user-123')
 * // → 'analytics/user-123/events'
 */
export function resolveStoragePath(template: string, identity: string): string {
  return template.replace('{identity}', encodeURIComponent(identity));
}

/**
 * Prune a Starfish event document according to cleanup configuration.
 *
 * Applied rules (in order):
 * 1. Remove events older than `maxAgeMs` milliseconds.
 * 2. If `maxEventsPerIdentity` is set (> 0), keep only the most recent N events.
 *
 * Returns a new document — does not mutate the input.
 */
export function pruneDocument(
  doc: StarfishEventDocument,
  config: CleanupConfig
): StarfishEventDocument {
  let events = [...doc.events];

  // Step 1: age-based pruning
  if (config.maxAgeMs !== undefined && config.maxAgeMs > 0) {
    const cutoff = Date.now() - config.maxAgeMs;
    events = events.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      // Drop events with malformed timestamps (NaN) and those older than cutoff
      return !Number.isNaN(ts) && ts >= cutoff;
    });
  }

  // Step 2: count-based pruning (keep most recent N)
  const maxN = config.maxEventsPerIdentity ?? 0;
  if (maxN > 0 && events.length > maxN) {
    events = events.slice(events.length - maxN);
  }

  return {
    ...doc,
    events,
    lastUpdated: new Date().toISOString(),
  };
}
