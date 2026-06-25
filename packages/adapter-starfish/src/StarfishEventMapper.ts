/**
 * Mapping utilities: SunglassesEvent → the flat EventRow shape that
 * the starfish-events server plugin expects and encodes as Parquet columns.
 *
 * The column schema matches apps/ingest-server/src/schema.ts so a DuckDB
 * query is identical regardless of which backend delivered the data.
 *
 * Privacy: distinct_id, properties, and context are mapped but must never
 * be logged (they are opaque values that the SDK's PiiSanitizer already
 * processed before the batch was handed to the adapter).
 */
import type { SunglassesEvent } from '@drakkar.software/sunglasses-core';

/**
 * Flat row shape sent to the Starfish events collection.
 * All fields are strings; properties and context are JSON-serialized.
 */
export interface StarfishEventRow {
  /** EventType: 'capture' | 'screen' | 'identify' | 'alias' | 'group' */
  event_type: string;
  /** Human-readable event name, e.g. 'button_clicked' or '$screen'. */
  event: string;
  /** Resolved user identifier (hashed if anonymizeUserId is set). */
  distinct_id: string;
  /** Stable device UUID — safe for DAU / retention analysis. */
  anonymous_id: string;
  /** ISO-8601 UTC event timestamp. */
  ts: string;
  /** UUID v4 — use for deduplication. */
  message_id: string;
  /** JSON-serialized event properties (already PII-sanitized by the SDK). */
  properties: string;
  /** JSON-serialized EventContext (library/platform/app metadata). */
  context: string;
  /** 'YYYY-MM-DD' derived from ts — matches the Parquet partition key. */
  dt: string;
}

/**
 * Map a single SunglassesEvent to the flat row format expected by the
 * starfish-events plugin.
 *
 * `received_at` is intentionally omitted — the server plugin stamps it at
 * ingest time so it reflects when the event landed on the server, not when
 * the client serialised the batch.
 */
export function toStarfishRow(e: SunglassesEvent): StarfishEventRow {
  return {
    event_type: e.type,
    event: e.event,
    distinct_id: e.distinctId,
    anonymous_id: e.anonymousId,
    ts: e.timestamp,
    message_id: e.messageId,
    properties: JSON.stringify(e.properties),
    context: JSON.stringify(e.context),
    dt: e.timestamp.slice(0, 10),
  };
}
