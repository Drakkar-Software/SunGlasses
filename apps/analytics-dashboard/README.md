# Analytics Dashboard

Read-only analytics dashboard for SunGlasses events stored as Parquet on S3 by [`ingest-server`](../ingest-server).

```
ingest-server  ──writes──▶  S3 Parquet (s3://bucket/events/dt=.../part-*.parquet)
                                    │
analytics-dashboard  ◀──reads──  DuckDB (httpfs + read_parquet)
        │
        ├── Fastify query API  /api/*
        └── React + Recharts UI
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- A populated S3 prefix (run `ingest-server` first, or point at existing Parquet)
- Same S3 credentials as `ingest-server`

## Setup

```bash
cp apps/analytics-dashboard/.env.example apps/analytics-dashboard/.env
# Edit S3_BUCKET, AWS_*, etc. (must match ingest-server)

pnpm install
pnpm --filter analytics-dashboard dev
```

- API: http://localhost:8788
- Dev UI (Vite): http://localhost:5174 (proxies `/api` to the server)

## Production

```bash
pnpm --filter analytics-dashboard build
pnpm --filter analytics-dashboard start
```

Serves the built UI and API from port `8788`.

## API endpoints

| Method | Path | Query params | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/config/status` | — | S3 connection status (no secrets) |
| `POST` | `/api/config` | — | Configure S3 at runtime (`s3Bucket`, `s3Prefix`, `awsRegion`, `accessKeyId`, `secretAccessKey`, `endpointUrl`, `useIam`) |
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/overview` | `from`, `to` | KPI totals |
| `GET` | `/api/timeseries` | `from`, `to`, `event` | Daily event volume |
| `GET` | `/api/events/top` | `from`, `to`, `limit` | Top events by count |
| `GET` | `/api/screens/top` | `from`, `to`, `limit` | Top screen paths |
| `GET` | `/api/errors/top` | `from`, `to`, `limit` | Top error types |
| `GET` | `/api/dau` | `from`, `to`, `limit` | Daily active users |
| `GET` | `/api/retention` | `from`, `to`, `limit`, `day` | Day-N retention cohorts |
| `POST` | `/api/query` | — | Ad-hoc read-only SQL (`{ sql: string }`) |

Date params use `YYYY-MM-DD` and filter on the `dt` partition column.

## Privacy

- Server logs aggregate counts only — never `distinct_id`, `properties`, or `context`.
- DAU and retention use `anonymous_id`.
- The **Query** tab runs arbitrary `SELECT`/`WITH` statements against your S3 data. It is intended for self-hosted use only and can expose raw columns including `properties` and `distinct_id`. Do not expose this endpoint publicly without authentication.

## Data lag

The dashboard reads flushed Parquet on S3 only. Events still in `ingest-server`'s local staging table are not visible until the next flush (default: 60 s or 5 000 rows).
