---
sidebar_position: 2
title: Analytics Dashboard
---

# Analytics Dashboard

A read-only analytics dashboard that queries SunGlasses events stored as **Parquet** — either directly from S3 (ingest server / MinIO) or via **Starfish local-sync** when the object store is not publicly reachable (Infra sync + private Garage).

```
ingest-server / Starfish adapter  ──writes──▶  S3 Parquet (internal)
                                                    │
Starfish /v1/analytics  ◀── list + pull (admin) ────┘
        │
analytics-dashboard  ◀── local cache + DuckDB read_parquet
        │
        ├── Fastify query API  /api/*
        └── React + Recharts UI
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- **Direct S3:** populated prefix + credentials (see [ingest server](/backend/ingest-server))
- **Starfish:** running Infra sync with `/v1/analytics`, `listable` events collection, platform admin cap-cert, and `starfish-events` ≥ 3.0.0-alpha.44 (Parquet pull via `interceptPull` hook)

## Setup

```bash
pnpm install
pnpm --filter analytics-dashboard dev
```

On first open, choose **Starfish** or **Direct S3** in the setup screen.

- **API:** http://localhost:8788
- **Dev UI (Vite):** http://localhost:5174 — proxies `/api` to the server

## Data sources

### Starfish (recommended when S3 is private)

Use when Garage/S3 is internal-only and the public entry point is the sync server.

1. Wire the analytics namespace on your sync server (`listable: true`, and either `read_roles: ["admin"]` with a platform admin enricher, or `read_roles: ["public"]` for unauthenticated reads).
2. In the dashboard UI, select **Starfish** and provide:
   - **Sync base URL** — e.g. `https://sync.example.com/v1/analytics`
   - **App slug** — e.g. `octochat` (matches `StarfishAnalyticsAdapter` `app`)
   - **Admin cap-cert** + **device Ed25519 private key (hex)** — when `read_roles` includes `admin`; or enable **Public read** when the collection allows anonymous list/pull
3. The server lists batches (`GET /list/events/{app}`), pulls Parquet (`GET /pull/events/{app}/{batchId}`), caches under `.parquet-cache/`, and runs DuckDB locally.

Click **Refresh data** in the header after new events are ingested.

Settings persist to `.starfish-config.local.json` (gitignored).

Optional env auto-connect (admin cap-cert):

```bash
STARFISH_CONFIGURE_FROM_ENV=true
STARFISH_BASE_URL=http://localhost:3000/v1/analytics
STARFISH_APP=octochat
STARFISH_CAP_PATH=./admin.cap.json
STARFISH_DEV_ED_PRIV_HEX=…
```

Public read (no cap-cert):

```bash
STARFISH_CONFIGURE_FROM_ENV=true
STARFISH_PUBLIC_READ=true
STARFISH_BASE_URL=http://localhost:3000/v1/analytics
STARFISH_APP=octochat
```

### Direct S3

Use for local MinIO or when DuckDB can reach the bucket with `httpfs`.

```bash
docker run -d --name sunglasses-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Set `S3_CONFIGURE_FROM_ENV=true` and the same `S3_*` / `AWS_*` vars as the [ingest server](/backend/ingest-server). Settings persist to `.s3-config.local.json`.

## Production

```bash
pnpm --filter analytics-dashboard build
pnpm --filter analytics-dashboard start
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8788` | HTTP port |
| `S3_CONFIGURE_FROM_ENV` | — | Opt-in direct S3 from env |
| `S3_BUCKET`, `S3_PREFIX`, `AWS_*`, `ENDPOINT_URL` | — | Direct S3 mode |
| `STARFISH_CONFIGURE_FROM_ENV` | — | Opt-in Starfish from env |
| `STARFISH_PUBLIC_READ` | — | Unauthenticated list/pull (no cap-cert) |
| `STARFISH_BASE_URL` | — | Analytics namespace URL |
| `STARFISH_APP` | — | App slug under `events/{app}/` |
| `STARFISH_CAP_PATH` / `STARFISH_CAP_JSON` | — | Admin cap-cert |
| `STARFISH_DEV_ED_PRIV_HEX` | — | Signing key for cap requests |
| `STARFISH_CACHE_DIR` | `.parquet-cache/{app}` | Local Parquet cache |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config/status` | Connection status (no secrets) |
| `POST` | `/api/config` | Configure Starfish or direct S3 |
| `DELETE` | `/api/config` | Clear configuration |
| `POST` | `/api/sync` | Incremental Starfish Parquet sync |
| `GET` | `/api/overview` | KPI totals |
| `GET` | `/api/timeseries` | Daily event volume |
| `GET` | `/api/events/top` | Top events |
| `GET` | `/api/screens/top` | Top screens |
| `GET` | `/api/errors/top` | Top errors |
| `GET` | `/api/dau` | Daily active users |
| `GET` | `/api/retention` | Day-N retention |
| `POST` | `/api/query` | Ad-hoc read-only SQL |

### `POST /api/config` — Starfish (admin cap-cert)

```json
{
  "source": "starfish",
  "baseUrl": "https://sync.example.com/v1/analytics",
  "app": "octochat",
  "cap": "{ … CapCert JSON … }",
  "devEdPrivHex": "…"
}
```

### `POST /api/config` — Starfish (public read)

```json
{
  "source": "starfish",
  "baseUrl": "https://sync.example.com/v1/analytics",
  "app": "octochat",
  "publicRead": true
}
```

### `POST /api/config` — Direct S3

```json
{
  "source": "direct_s3",
  "s3Bucket": "my-bucket",
  "s3Prefix": "events/octochat",
  "awsRegion": "garage",
  "accessKeyId": "…",
  "secretAccessKey": "…",
  "endpointUrl": "http://localhost:3900"
}
```

## Privacy

- Server logs aggregate counts only — never `distinct_id`, `properties`, or `context`.
- Cap private keys are stored server-side in `.starfish-config.local.json` (mode `0600`) — do not commit.
- The **Query** tab can expose raw columns. Do not expose on untrusted networks without authentication.

## Data lag

- **Direct S3:** reads flushed Parquet only (ingest staging lag applies).
- **Starfish:** reflects the last sync; use **Refresh data** after ingestion.

## Related

- [Ingest server](/backend/ingest-server)
- [Starfish adapter](/adapters/starfish)
- [Local testing with MinIO](/backend/local-testing)
