---
sidebar_position: 1
title: Overview
---

# Output Adapters

Output adapters implement `IAnalyticsAdapter` and receive batches of events on each flush. SunGlasses ships several built-in adapters; you can also implement your own.

## Built-in adapters

| Adapter | Package | Description |
|---------|---------|-------------|
| `HttpStorageAdapter` | `sunglasses-storage-http` | POST batches to an HTTP endpoint |
| `StarfishAnalyticsAdapter` | `sunglasses-adapter-starfish` | Push JSON batches to Starfish (Parquet server-side) |

## Adapter contract

```ts
interface IAnalyticsAdapter {
  send(batch: ReadonlyArray<SunglassesEvent>): Promise<void>;
  reset?(): Promise<void>;
  shutdown?(): Promise<void>;
  cleanupAfterFlush?(delivered: ReadonlyArray<SunglassesEvent>, config: CleanupConfig): Promise<void>;
}
```

## Rules (privacy invariants)

- `send()` must **never mutate** the input `batch` — it is frozen at runtime
- `send()` may throw; the core keeps events in the queue and retries on next flush
- `send()` is only called when the user has opted in
- Never log `distinctId` or traits in adapters

## Multiple adapters

You can pass multiple adapters in the `adapters` array. On each flush, **all** adapters receive the same batch. If any adapter throws, events remain in the queue for retry.

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Adapter `send()` throws | Events stay in queue; retry on next flush |
| All adapters fail | Events stay in queue; no data is lost |
| Network timeout (HTTP) | Exponential backoff; discard after `maxRetries` |

See [Custom adapter](/adapters/custom-adapter) to build your own.
