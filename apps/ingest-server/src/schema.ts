import type { SunglassesEvent } from '@drakkar.software/sunglasses-core';

/**
 * A single row written to the staging table and ultimately to Parquet.
 * All timestamps are stored as ISO-8601 strings to avoid type-casting complexity.
 * `dt` is the YYYY-MM-DD partition key derived from the event timestamp.
 */
export interface EventRow {
  event_type: string;
  event: string;
  distinct_id: string;
  anonymous_id: string;
  ts: string;         // ISO-8601 UTC event timestamp
  message_id: string;
  properties: string; // JSON text — never log this field (may contain user data)
  context: string;    // JSON text — never log this field
  received_at: string; // ISO-8601 UTC time the server received the batch
  dt: string;         // YYYY-MM-DD partition key (derived from ts)
}

/**
 * Maps a SunglassesEvent (from the SDK's POST body) to a flat row suitable
 * for insertion into the DuckDB staging table.
 *
 * Privacy: `properties` and `context` are stored as opaque JSON. The SDK
 * already ran PiiSanitizer before sending, so no additional scrubbing is done
 * here — but these fields must never appear in logs.
 */
export function toRow(event: SunglassesEvent, receivedAt: string): EventRow {
  // Guard against non-SDK clients that omit timestamp; fall back to receivedAt.
  const ts = typeof event.timestamp === 'string' && event.timestamp ? event.timestamp : receivedAt;
  const dt = ts.slice(0, 10); // 'YYYY-MM-DD'

  return {
    event_type: event.type,
    event: event.event,
    distinct_id: event.distinctId,
    anonymous_id: event.anonymousId,
    ts,
    message_id: event.messageId,
    properties: JSON.stringify(event.properties ?? {}),
    context: JSON.stringify(event.context ?? {}),
    received_at: receivedAt,
    dt,
  };
}
