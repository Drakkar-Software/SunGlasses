---
sidebar_position: 3
title: Web Setup
---

# Web Setup (React + Vite)

## Install

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react @drakkar.software/sunglasses-storage-localstorage
```

Add `@drakkar.software/sunglasses-storage-http` if you push events to a server.

## Initialize the client

```tsx
// main.tsx
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider } from '@drakkar.software/sunglasses-react';
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

const client = await SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  adapters: [
    new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' }),
  ],
  defaultOptIn: false, // Privacy-first: user must call optIn() first
  platform: 'web',
  debug: process.env.NODE_ENV === 'development',
});

root.render(
  <SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
    <App />
  </SunglassesProvider>
);
```

## Capture events

```tsx
// Anywhere in your app
import { useSunglasses } from '@drakkar.software/sunglasses-react';

function BuyButton() {
  const client = useSunglasses();

  return (
    <button onClick={() => client.capture('purchase_clicked', { item: 'pro_plan' })}>
      Upgrade
    </button>
  );
}
```

## Consent

Before any events are collected, prompt the user and call `client.optIn()`. See [Consent](/privacy/consent) and [Consent UI patterns](/guides/consent-ui-patterns).

## Screen tracking

`SunglassesProvider` accepts `screenTracking={{ useHistoryApi: true }}` to auto-track SPA route changes via the History API. See [Screen tracking](/guides/screen-tracking).

## Next steps

- [Capture events](/guides/capture-events)
- [Error capture](/guides/error-capture)
- [Configuration reference](/reference/config)
