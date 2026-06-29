---
sidebar_position: 2
title: Analytics Dashboard
---

# Analytics Dashboard

A read-only analytics dashboard that queries SunGlasses events stored as **Parquet** — either directly from S3/MinIO or via **Starfish local-sync**. All queries run in **DuckDB-WASM** inside the browser; no backend is required.

```
SunGlasses client  ──push──▶  Starfish /v1/analytics  ──▶  object store
                                                                │
ingest-server      ──flush──▶  S3/MinIO  ──────────────────────┘
                                                                │
        analytics-dashboard (browser)  ──DuckDB-WASM──▶  read_parquet
```

## Prerequisites

- Node.js 20+ and pnpm 9+ (dev only)
- A populated Parquet dataset

**Starfish mode:** a running Starfish sync server with `starfish-events` ≥ 3.0.0-alpha.44, analytics collection with `listable: true`, and either admin cap-cert or public read enabled.

**Direct S3 mode:** the bucket must allow the browser origin via **CORS** (see the dashboard README for the bucket CORS policy).

## Setup

```bash
pnpm install
pnpm --filter analytics-dashboard dev
```

Open http://localhost:5174, choose **Starfish** or **Direct S3**, and enter credentials.

## Data sources

### Starfish local-sync

Use when Garage/S3 is internal-only and the public entry point is the sync server.

1. Wire the analytics namespace on your sync server (`listable: true`, and either `read_roles: ["admin"]` with a platform admin enricher, or `read_roles: ["public"]` for unauthenticated reads).
2. In the dashboard setup screen, select **Starfish** and provide:
   - **Sync base URL** — full external API root including the `/sync/v1/<namespace>` prefix, e.g. `https://sync.example.com/sync/v1/analytics`. Do not enter the bare host.
   - **App slugs** — one or more slugs comma-separated, e.g. `my-app, other-app` (matches the `app` field on the `SunglassesAnalyticsAdapter`).
   - **Admin cap-cert** + **device Ed25519 private key (hex)** — when `read_roles` includes `admin`; or enable **Public read** when the collection allows anonymous list/pull.
3. The browser lists batches (`GET /list/events/{app}`), pulls Parquet bytes into browser memory, registers them with DuckDB-WASM, and queries across all configured apps combined.

Click **Refresh data** to pull new batches.

**Multiple apps:** all configured apps are synced and aggregated. Use the **app filter dropdown** in the top bar to narrow to a single app. After connecting you can also add or remove apps live from the sidebar without reconnecting.

### Persistent local cache (IndexedDB)

Parquet batch bytes are cached in **IndexedDB** (`sunglasses-dashboard` database, `parquet` store), keyed per app. On reload the dashboard reads bytes from IndexedDB first and only downloads batches that are genuinely new — eliminating full re-downloads on every page load.

A per-app manifest in `localStorage` (`starfish-manifest-{app}`) tracks which filenames have been synced. Disconnecting (clicking "Change connection") clears both the manifests and the IndexedDB byte cache so data does not linger.

### Direct S3

DuckDB-WASM loads the `httpfs` extension and reads Parquet directly from `s3://<bucket>/<prefix>/**/*.parquet`. Provide explicit access keys (IAM / credential-chain is not available in the browser).

For MinIO or other S3-compatible stores, set the **Custom endpoint URL** in the setup form.

## Production

```bash
pnpm --filter analytics-dashboard build
```

The output (`dist/`) is a small static SPA. Deploy to any static host (Cloudflare Workers, Vercel, Netlify, an S3 bucket). The DuckDB WASM bundles are fetched from `cdn.jsdelivr.net` on first use — the browser must be able to reach that CDN.

## Privacy

- DAU and retention queries use `anonymous_id` — never `distinct_id`, raw user traits, or PII.
- Parquet bytes are cached locally in IndexedDB and cleared on disconnect. No event data is sent to any server.
- The **Query** tab runs arbitrary `SELECT`/`WITH` against your data and can expose raw columns. Deploy for yourself or trusted users only.

## Related

- [Starfish adapter](/adapters/starfish)
- [Local testing with MinIO](/backend/local-testing)
