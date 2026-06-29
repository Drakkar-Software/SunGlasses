---
sidebar_position: 2
title: HTTP Push
---

# HTTP Push Adapter

`HttpStorageAdapter` POSTs batches to your ingest endpoint. Pairs well with the [ingest server](/backend/ingest-server).

## Basic usage

```ts
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

new HttpStorageAdapter({
  endpoint: 'https://ingest.example.com/batch',
});
```

## Payload shape

```json
{
  "batch": [ /* SunglassesEvent[] */ ],
  "sentAt": "2026-06-26T12:00:00.000Z"
}
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `endpoint` | required | POST URL |
| `headers` | `{}` | Extra request headers |
| `maxRetries` | `3` | Retry attempts for retriable failures |
| `retryBaseDelayMs` | `1000` | Initial backoff delay |
| `retryMaxDelayMs` | `30000` | Maximum backoff delay |
| `timeout` | `10000` | Request timeout (ms) |

## Retry policy

- **2xx** — success
- **4xx** (except 429) — non-retriable; batch discarded with warning
- **5xx, 429, network errors, timeout** — retry with exponential backoff

Batch size is controlled by `maxBatchSize` in `SunglassesCore.create()`, not by the adapter.

## Local development

```ts
new HttpStorageAdapter({ endpoint: 'http://localhost:8787/batch' })
```

See [Ingest server](/backend/ingest-server) for the reference server implementation.
