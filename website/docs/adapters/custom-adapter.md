---
sidebar_position: 4
title: Custom Adapter
---

# Custom Adapter

Implement `IAnalyticsAdapter` to send events to any destination (Firebase, Amplitude, your own API, etc.).

```ts
import type { IAnalyticsAdapter, SunglassesEvent, CleanupConfig } from '@drakkar.software/sunglasses-core';

class FirebaseAdapter implements IAnalyticsAdapter {
  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    // batch is frozen — do not mutate it
    for (const event of batch) {
      await firebase.analytics().logEvent(event.event, event.properties);
    }
  }

  async reset(): Promise<void> {
    // Called on client.reset()
  }

  async shutdown(): Promise<void> {
    // Called on client.shutdown()
  }

  async cleanupAfterFlush(
    delivered: ReadonlyArray<SunglassesEvent>,
    config: CleanupConfig,
  ): Promise<void> {
    // Optional: prune remote data after flush — never throws
  }
}
```

## Checklist

1. **Never mutate** the `batch` array in `send()`
2. **Throw on failure** — the core keeps events in the queue for retry
3. **Never log** `distinctId` or traits
4. `cleanupAfterFlush` must never throw — log and swallow errors

## Testing

```ts
import { vi } from 'vitest';

const adapter = new FirebaseAdapter();
const client = await SunglassesCore.create({
  storage: makeStorage(),
  adapters: [adapter],
  defaultOptIn: true,
});
client.capture('test');
await client.flush();
// assert firebase was called
```

See [Adapter authoring](/contributing/adapter-authoring) for the full contributor guide.
