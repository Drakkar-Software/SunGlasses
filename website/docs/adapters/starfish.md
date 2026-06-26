---
sidebar_position: 3
title: Starfish
---

# Starfish Adapter

`StarfishAnalyticsAdapter` pushes event batches as JSON to a Starfish events collection. The `starfish-events` server plugin encodes Parquet on the server side — no Parquet dependency on the client.

## Install

```bash
pnpm add @drakkar.software/sunglasses-adapter-starfish @drakkar.software/starfish-client
```

## Setup

```ts
import { StarfishClient } from '@drakkar.software/starfish-client';
import { StarfishAnalyticsAdapter } from '@drakkar.software/sunglasses-adapter-starfish';

const starfish = new StarfishClient({ baseUrl: 'https://sync.example.com/v1' });

const client = await SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  adapters: [
    new StarfishAnalyticsAdapter({
      client: starfish,
      app: 'my-app', // URL-safe identifier in storage path
    }),
  ],
  ...
});
```

## How it works

1. On each flush, events are mapped to flat rows via `toStarfishRow()`
2. Rows are pushed as `{ events: StarfishEventRow[] }` to a unique path per batch
3. Default path template: `events/{app}/{batchId}` (`.parquet` appended server-side)
4. `send()` throws on failure — SunGlasses keeps the batch for the next flush (at-least-once delivery)

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `client` | required | `StarfishClient` or any object with `push(path, data, baseHash)` |
| `app` | required | App identifier for the storage path |
| `pathTemplate` | `events/{app}/{batchId}` | Path template; `{batchId}` is a UUID per flush |

## No runtime dependency on starfish-client

The adapter package declares a structural `StarfishPushClient` interface so it has no hard dependency on `@drakkar.software/starfish-client` at publish time. Your app supplies the real client.

## Troubleshooting

**Starfish sync conflicts (409)**

- 409s are retried automatically (up to `maxRetries` on the Starfish client)
- High contention may exhaust retries — increase `maxRetries` on the client

**Events never appear in Starfish**

- Verify consent: `getConsentStatus()` must be `'opted-in'`
- Check the Starfish collection is configured for the `starfish-events` plugin
- Enable `debug: true` and watch adapter logs (counts only — never PII)

## Related

- [Starfish documentation](https://starfish.drakkar.software) (external)
- [Output adapters overview](/adapters/overview)
