# Analytics Dashboard

Read-only analytics dashboard for SunGlasses events stored as **Parquet**. Queries run in **DuckDB-WASM** — entirely in the browser, no server required. The dashboard connects directly to your S3 bucket or Starfish sync server from the browser tab.

```
SunGlasses client  ──push──▶  Starfish /v1/analytics  ──▶  object store
                                                                │
ingest-server      ──flush──▶  S3/MinIO  ──────────────────────┘
                                                                │
        analytics-dashboard (browser)  ──DuckDB-WASM──▶  read_parquet
```

## Features

- Overview KPIs, event volume time series, DAU chart
- Top events, screens, and errors tables with error-detail drill-down
- Day-N retention cohorts
- Ad-hoc read-only SQL console (`FROM events()`)
- In-browser setup UI (Starfish or Direct S3) — no `.env`, no server
- Dark / light theme; per-app filter; date-range presets

## Prerequisites

- Node.js 20+ and pnpm 9+ (dev only)
- A populated Parquet dataset

**Starfish mode:** a running Starfish sync server with `starfish-events` ≥ 3.0.0-alpha.44, analytics collection with `listable: true`, and either admin cap-cert or public read enabled.

**Direct S3 mode:** the bucket must allow the browser origin via **CORS** (see below).

## Quick start

```bash
# From the monorepo root
pnpm install
pnpm --filter analytics-dashboard dev
```

Open http://localhost:5174, choose **Starfish** or **Direct S3**, and enter credentials.

## CORS

Because DuckDB runs in the browser, requests to S3 or the Starfish server go over **CORS**. You must configure the bucket / server to allow the dashboard origin.

### S3 / MinIO bucket CORS

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:5174", "https://dashboard.sunglasses.drakkar.software"],
    "ExposeHeaders": ["ETag", "Content-Length"]
  }
]
```

Apply with `aws s3api put-bucket-cors --bucket <bucket> --cors-configuration file://cors.json` (or the MinIO equivalent).

### Starfish server CORS

Add the dashboard origin to your Starfish server's `cors.allowedOrigins` config (or set `Access-Control-Allow-Origin: *` for public-read endpoints).

## Data sources

### Starfish local-sync

1. Clients push JSON event batches via `@drakkar.software/sunglasses-adapter-starfish`.
2. The `starfish-events` plugin stores Parquet at `events/{app}/{batchId}.parquet`.
3. The dashboard lists batches, pulls Parquet bytes into browser memory, registers them with DuckDB-WASM, and queries across them.

Click **Refresh data** to pull new batches. The sync is incremental: already-downloaded batches are skipped (tracked in `localStorage`).

### Direct S3

DuckDB-WASM loads the `httpfs` extension and reads Parquet directly from `s3://<bucket>/<prefix>/**/*.parquet`. Provide explicit access keys (IAM / credential-chain is not available in the browser).

For MinIO or other S3-compatible stores, set the **Custom endpoint URL** in the setup form.

## Credentials

All credentials stay in the browser tab. When **Remember credentials** is off, they are cleared when the tab closes. When it is on, they are stored in `sessionStorage` (cleared on tab close). Credentials are **never** sent to any server — DuckDB-WASM connects directly.

## Build for production

```bash
pnpm --filter analytics-dashboard build
```

The output (`dist/`) is a small static SPA (~900 KB JS + CSS). The DuckDB WASM bundles are **not** bundled — they are fetched from `cdn.jsdelivr.net` the first time the user connects to a data source. The browser must be able to reach `cdn.jsdelivr.net`.

Deploy to any static host (Cloudflare Workers, Vercel, Netlify, an S3 bucket).

## Privacy

- DAU and retention queries use `anonymous_id` — never `distinct_id`, raw user traits, or PII.
- The **Query** tab runs arbitrary `SELECT`/`WITH` against your Parquet data and can expose raw columns. Deploy for yourself or trusted users only.

## Dependencies

| Package | Role |
|---------|------|
| `@duckdb/duckdb-wasm` | In-browser DuckDB (WASM) |
| `@drakkar.software/starfish-client` | Parquet batch download |
| `@drakkar.software/starfish-protocol` | Cap-cert auth + request signing |

## Related

- [Docs site](../../apps/docs/docs/) — full reference
- [Starfish adapter](../../packages/sunglasses-storage-http/) — client-side push adapter
