---
sidebar_position: 4
title: Cleanup After Flush
---

# Cleanup After Flush

Automatically prune old events from remote stores after each successful flush. Implement `cleanupAfterFlush` on any custom `IAnalyticsAdapter` to opt in.

```ts
SunglassesCore.create({
  cleanupAfterFlush: {
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,  // Remove events older than 30 days
    maxEventsPerIdentity: 1000,            // Keep at most 1000 events per user
  },
  adapters: [myAdapter],
  ...
});
```

## Behaviour

- Cleanup is **fire-and-forget** — it never blocks the flush
- Adapters that don't implement `cleanupAfterFlush` are silently skipped
- The hook receives the delivered batch and `CleanupConfig`

## Adapter implementation

```ts
async cleanupAfterFlush(
  delivered: ReadonlyArray<SunglassesEvent>,
  config: CleanupConfig,
): Promise<void> {
  // Never throws — log and swallow errors
}
```

See [Custom adapter](/adapters/custom-adapter) for the full adapter checklist.
