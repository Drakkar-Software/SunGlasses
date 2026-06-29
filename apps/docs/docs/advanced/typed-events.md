---
sidebar_position: 1
title: Type-Safe Events
---

# Type-Safe Event Catalog

## Module-level singleton (recommended)

Export a single `analytics` constant safe to import anywhere, before the SDK has initialised:

```ts
// analytics.ts
import { createLazyClient, SunglassesCore } from '@drakkar.software/sunglasses-core';

type MyEvents = {
  button_clicked: { buttonId: string; screen: string };
  purchase_completed: { itemId: string; amount: number };
  page_viewed: undefined; // no required properties
};

export const analytics = createLazyClient<MyEvents>();

export async function initAnalytics() {
  const client = await SunglassesCore.create({ ... });
  analytics.init(client);
  return client;
}
```

```ts
// anywhere else — safe at import time
import { analytics } from './analytics';

analytics.capture('button_clicked', { buttonId: 'cta', screen: 'home' }); // ✓ typed
analytics.capture('button_clicked', { wrong: 'key' });                    // ✗ TS error
analytics.capture('unknown_event', {});                                   // ✗ TS error
```

All methods are silent no-ops before `init()`.

## Inline typing with `asTyped`

When you already hold a `SunglassesCore` reference:

```ts
import { asTyped } from '@drakkar.software/sunglasses-core';

const typed = asTyped<MyEvents>(client);
typed.capture('button_clicked', { buttonId: 'cta', screen: 'home' });
```

:::danger Anti-pattern
Do not use `Object.assign` to patch a stub with `asTyped` — `Object.assign` skips prototype methods and `capture()` is never replaced. Use `createLazyClient` instead.
:::
