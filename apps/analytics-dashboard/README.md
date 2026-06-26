# Analytics Dashboard

Read-only analytics dashboard for SunGlasses events stored as **Parquet**. Queries run in DuckDB over a local Parquet dataset — either synced from Starfish or read directly from S3.

Two ingestion paths feed the same Parquet layout:

```
SunGlasses client  ──push──▶  Starfish /v1/analytics  ──starfish-events──▶  object store
                                                                                    │
ingest-server      ──flush──▶  S3/MinIO  ───────────────────────────────────────────┘
                                                                                    │
Starfish list+pull (admin cap)  OR  DuckDB httpfs (direct S3)  ◀──────────────────┘
        │
analytics-dashboard  ──read_parquet──▶  DuckDB  ──▶  Fastify /api/*  +  React UI
```

## Features

- Overview KPIs, event volume time series, DAU chart
- Top events, screens, and errors tables
- Day-N retention cohorts
- Ad-hoc read-only SQL console
- Runtime setup UI (Starfish or direct S3) — no `.env` required
- Optional env auto-connect for local development

## Prerequisites

- Node.js 20+
- pnpm 9+
- A populated Parquet dataset (see [Data sources](#data-sources) below)

**Starfish mode** additionally requires:

- A running Starfish sync server exposing `/v1/analytics`
- `starfish-events` ≥ 3.0.0-alpha.44 on that server (Parquet pull via `interceptPull` plugin hook)
- Analytics collection with `listable: true`
- Either **admin cap-cert** auth (`read_roles` includes `admin`) or **public read** (`read_roles` includes `public` — no cap-cert needed)

## Quick start

```bash
# From the monorepo root
pnpm install
pnpm --filter analytics-dashboard dev
```

- **API:** http://localhost:8788
- **Dev UI (Vite):** http://localhost:5174 — proxies `/api` to the server

On first open, choose **Starfish** or **Direct S3** in the setup screen and enter credentials. Settings persist locally (see [Local files](#local-files-gitignored)).

To skip the setup screen, copy and edit the env file:

```bash
cp apps/analytics-dashboard/.env.example apps/analytics-dashboard/.env
```

## Data sources

### Starfish local-sync

Use when the object store is not publicly reachable and the sync server is the entry point.

1. Clients push JSON event batches to `POST /v1/analytics/push/events/{app}/{batchId}` via `@drakkar.software/sunglasses-adapter-starfish`.
2. The `starfish-events` plugin on the sync server encodes each batch as Parquet and writes it to object storage at `events/{app}/{batchId}.parquet`.
3. The dashboard lists batches (`GET /list/events/{app}`), pulls Parquet (`GET /pull/events/{app}/{batchId}`), caches files under `.parquet-cache/`, and runs DuckDB queries against the cache.

Use **admin cap-cert** auth when `read_roles` includes `admin`, or enable **Public read** in the setup UI (or `STARFISH_PUBLIC_READ=true`) when the collection allows anonymous list/pull (`read_roles` includes `public`).

Click **Refresh data** in the header (or `POST /api/sync`) after new events are ingested.

`STARFISH_APP` must match the `app` slug passed to `StarfishAnalyticsAdapter` in your client (e.g. `octochat` → files under `events/octochat/`).

### Direct S3

Use for local MinIO, a publicly reachable bucket, or the [`ingest-server`](../ingest-server) path when DuckDB can reach S3 with `httpfs`.

```bash
docker run -d --name sunglasses-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Set `S3_CONFIGURE_FROM_ENV=true` and the same `S3_*` / `AWS_*` vars as ingest-server.

## Environment auto-connect

Set `STARFISH_CONFIGURE_FROM_ENV=true` or `S3_CONFIGURE_FROM_ENV=true` in `.env` to connect on startup without the setup screen. See `.env.example` for all variables.

**Starfish with admin cap-cert:**

```bash
PORT=8788

STARFISH_CONFIGURE_FROM_ENV=true
STARFISH_BASE_URL=http://localhost:3000/v1/analytics
STARFISH_APP=octochat
STARFISH_CAP_PATH=./admin.cap.json
STARFISH_DEV_ED_PRIV_HEX=<platform root Ed25519 private key, hex>
STARFISH_CACHE_DIR=.parquet-cache/octochat
```

**Starfish with public read (no cap-cert):**

```bash
STARFISH_CONFIGURE_FROM_ENV=true
STARFISH_PUBLIC_READ=true
STARFISH_BASE_URL=http://localhost:3000/v1/analytics
STARFISH_APP=octochat
STARFISH_CACHE_DIR=.parquet-cache/octochat
```

- `STARFISH_BASE_URL` — analytics namespace URL (scheme + host + `/v1/analytics`)
- `STARFISH_PUBLIC_READ` — when `true`, skip cap-cert and signing key (collection must allow public read)
- `STARFISH_CAP_PATH` or `STARFISH_CAP_JSON` — platform admin cap-cert JSON (admin auth only)
- `STARFISH_DEV_ED_PRIV_HEX` — Ed25519 private key (hex) for signing cap requests (admin auth only)

The cap identity must be recognized as `admin` by the sync server's role enricher when public read is off.

**Direct S3 example:**

```bash
S3_CONFIGURE_FROM_ENV=true
S3_BUCKET=my-analytics-bucket
S3_PREFIX=events/octochat
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
ENDPOINT_URL=http://localhost:9000
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8788` | HTTP port |
| `S3_CONFIGURE_FROM_ENV` | — | Opt-in direct S3 from env on startup |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_PREFIX` | `events` | Key prefix for Parquet glob |
| `AWS_REGION` | `us-east-1` | S3 region |
| `AWS_ACCESS_KEY_ID` | — | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | — | S3 secret key |
| `ENDPOINT_URL` | — | Custom S3 endpoint (MinIO, Garage, etc.) |
| `DASHBOARD_S3_CONFIG_PATH` | `.s3-config.local.json` | Override path for UI-saved S3 config |
| `STARFISH_CONFIGURE_FROM_ENV` | — | Opt-in Starfish from env on startup |
| `STARFISH_PUBLIC_READ` | — | Unauthenticated list/pull (no cap-cert) |
| `STARFISH_BASE_URL` | — | Analytics namespace URL |
| `STARFISH_APP` | — | App slug under `events/{app}/` |
| `STARFISH_CAP_PATH` | — | Path to admin cap-cert JSON file |
| `STARFISH_CAP_JSON` | — | Inline cap-cert JSON (alternative to `STARFISH_CAP_PATH`) |
| `STARFISH_DEV_ED_PRIV_HEX` | — | Ed25519 private key (hex) for signing cap requests |
| `STARFISH_CACHE_DIR` | `.parquet-cache/{app}` | Local Parquet cache directory |
| `DASHBOARD_STARFISH_CONFIG_PATH` | `.starfish-config.local.json` | Override path for UI-saved Starfish config |

Env-based config is opt-in. Without `*_CONFIGURE_FROM_ENV=true`, the setup screen is shown on first open.

## UI configuration

Settings entered in the setup screen are equivalent to the env vars above.

**Starfish — admin cap-cert** (`POST /api/config`):

```json
{
  "source": "starfish",
  "baseUrl": "http://localhost:3000/v1/analytics",
  "app": "octochat",
  "cap": "{ … CapCert JSON … }",
  "devEdPrivHex": "…"
}
```

**Starfish — public read** (`POST /api/config`):

```json
{
  "source": "starfish",
  "baseUrl": "http://localhost:3000/v1/analytics",
  "app": "octochat",
  "publicRead": true
}
```

**Direct S3** (`POST /api/config`):

```json
{
  "source": "direct_s3",
  "s3Bucket": "my-bucket",
  "s3Prefix": "events/octochat",
  "awsRegion": "us-east-1",
  "accessKeyId": "…",
  "secretAccessKey": "…",
  "endpointUrl": "http://localhost:9000"
}
```

Clear saved config: `DELETE /api/config`.

## Production

```bash
pnpm --filter analytics-dashboard build
pnpm --filter analytics-dashboard start
```

Serves the built UI and API from port `8788` (or `PORT`).

## API endpoints

| Method | Path | Query params | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/config/status` | — | Connection status (no secrets) |
| `POST` | `/api/config` | — | Configure Starfish or direct S3 |
| `DELETE` | `/api/config` | — | Clear saved configuration |
| `POST` | `/api/sync` | — | Incremental Starfish Parquet sync |
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/overview` | `from`, `to` | KPI totals |
| `GET` | `/api/timeseries` | `from`, `to`, `event` | Daily event volume |
| `GET` | `/api/events/top` | `from`, `to`, `limit` | Top events by count |
| `GET` | `/api/screens/top` | `from`, `to`, `limit` | Top screen paths |
| `GET` | `/api/errors/top` | `from`, `to`, `limit` | Top error types |
| `GET` | `/api/dau` | `from`, `to`, `limit` | Daily active users |
| `GET` | `/api/retention` | `from`, `to`, `limit`, `day` | Day-N retention cohorts |
| `POST` | `/api/query` | — | Ad-hoc read-only SQL (`{ "sql": "…" }`) |

Date params use `YYYY-MM-DD` and filter on the `dt` partition column.

## Local files (gitignored)

| File | Purpose |
|------|---------|
| `.env` | Optional env auto-connect |
| `admin.cap.json` | Platform admin cap-cert (when using `STARFISH_CAP_PATH`) |
| `.starfish-config.local.json` | UI-saved Starfish credentials (mode `0600`) |
| `.s3-config.local.json` | UI-saved S3 credentials (mode `0600`) |
| `.parquet-cache/` | Starfish-synced Parquet batches + `.manifest.json` |

Never commit cap private keys or S3 secrets.

## Privacy

- Server logs aggregate counts only — never `distinct_id`, `properties`, or `context`.
- DAU and retention queries use `anonymous_id`.
- The **Query** tab runs arbitrary `SELECT`/`WITH` against your dataset and can expose raw columns. Intended for self-hosted use only — do not expose on untrusted networks without authentication.

## Data lag

- **Direct S3:** reads flushed Parquet only. Events still in ingest-server's local staging table are invisible until the next flush (default: 60 s or 5 000 rows).
- **Starfish:** reflects the last sync. Use **Refresh data** after ingestion; the sync is incremental (skips files already in the manifest).

## Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@drakkar.software/starfish-client` | 3.0.0-alpha.44 | `pullBlob` for Parquet batch download |
| `@drakkar.software/starfish-protocol` | 3.0.0-alpha.44 | Cap-cert auth and request signing |
| `@duckdb/node-api` | 1.5.4-r.1 | In-process `read_parquet` aggregations |

The upstream sync server must run `starfish-events` ≥ 3.0.0-alpha.44, which serves Parquet bytes on pull via the generic `interceptPull` hook.

## Related

- [Ingest server](../ingest-server) — direct S3 Parquet flush path
- [Website docs](../../website/docs/backend/analytics-dashboard.md) — published reference
- [Starfish adapter](../../website/docs/adapters/starfish.md) — client-side push adapter
