---
sidebar_position: 3
title: Event Shape
---

# Event Shape

Each event in a flush batch conforms to `SunglassesEvent`:

```ts
interface SunglassesEvent {
  type: 'capture' | 'screen' | 'identify' | 'alias' | 'group';
  event: string;           // e.g. 'button_clicked', '$screen', '$error'
  properties: Record<string, unknown>;
  anonymousId: string;     // UUID v4 — device identity
  distinctId?: string;     // Set after identify()
  timestamp: string;       // ISO-8601 UTC
  messageId: string;       // UUID v4 — deduplication
  context?: {
    library?: { name: string; version: string };
    app?: { name?: string; version?: string; build?: string; variant?: string; update?: AppUpdateInfo };
    environment?: string;
    features?: string[];
    entitlements?: string[];
    traits?: Record<string, unknown>;
    sessionId?: string;
    screen?: string;
    platform?: string;
  };
}
```

## HTTP batch payload

`HttpStorageAdapter` POSTs:

```json
{
  "batch": [ /* SunglassesEvent[] */ ],
  "sentAt": "2026-06-26T12:00:00.000Z"
}
```

## Ingest server Parquet columns

When using the [ingest server](/backend/ingest-server), events are flattened to:

| Column | Type | Notes |
|--------|------|-------|
| `event_type` | VARCHAR | `capture`, `screen`, `identify`, … |
| `event` | VARCHAR | Event name |
| `distinct_id` | VARCHAR | User ID (may be hashed) |
| `anonymous_id` | VARCHAR | Device UUID |
| `ts` | VARCHAR | ISO-8601 event timestamp |
| `message_id` | VARCHAR | Deduplication UUID |
| `properties` | VARCHAR | JSON — PII-sanitized |
| `context` | VARCHAR | JSON — library/platform metadata |
| `received_at` | VARCHAR | Server receive time |
| `dt` | VARCHAR | `YYYY-MM-DD` partition key |

## Synthetic events

| Event | When emitted |
|-------|--------------|
| `$screen` | Screen tracking |
| `$session_start` | New session (if enabled) |
| `$error` | Error capture |
| `$identify` | Internal identify representation |
