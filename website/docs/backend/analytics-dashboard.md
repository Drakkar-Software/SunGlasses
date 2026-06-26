---
sidebar_position: 2
title: Analytics Dashboard
---

# Analytics Dashboard

A read-only analytics dashboard that queries SunGlasses events stored as **Parquet on S3** by the [ingest server](/backend/ingest-server). It does not receive SDK traffic — it reads the same `s3://{bucket}/{prefix}/**/*.parquet` dataset the ingest server writes.

```
ingest-server  ──writes──▶  S3 Parquet
                                    │
analytics-dashboard  ◀──reads──  DuckDB (httpfs + read_parquet)
        │
        ├── Fastify query API  /api/*
        └── React + Recharts UI
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- A populated S3 prefix (run the ingest server first, or point at existing Parquet)
- Same S3 credentials as the ingest server (`S3_BUCKET`, `S3_PREFIX`, `AWS_*`)

## Setup

```bash
pnpm install
pnpm --filter analytics-dashboard dev
```

On first open, the UI prompts for S3 bucket and credentials unless they are already set in `.env` (see below). Use the same values as your [ingest server](/backend/ingest-server). Click **Change S3** in the header to reconfigure without restarting.

Optional — skip the setup screen by pre-configuring env:

```bash
cp apps/analytics-dashboard/.env.example apps/analytics-dashboard/.env
# Edit S3_BUCKET, AWS_*, etc.
```

- **API:** http://localhost:8788
- **Dev UI (Vite):** http://localhost:5174 — proxies `/api` to the server

## Production

```bash
pnpm --filter analytics-dashboard build
pnpm --filter analytics-dashboard start
```

Serves the built UI and API from port `8788`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8788` | HTTP port (API + static UI) |
| `S3_BUCKET` | — | **Required.** Same bucket as ingest-server |
| `S3_PREFIX` | `events` | Key prefix |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | — | Blank for IAM auth |
| `AWS_SECRET_ACCESS_KEY` | — | Blank for IAM auth |
| `ENDPOINT_URL` | — | MinIO / R2 override |

## Dashboard tabs

| Tab | Contents |
|-----|----------|
| **Overview** | KPI cards, event volume time series, DAU chart |
| **Breakdowns** | Top events, screen paths, error types |
| **Retention** | Day-N cohort table (default day 7) |
| **Query** | Ad-hoc read-only SQL console (`events()` macro pre-defined) |

All panels accept an optional `from` / `to` date range (`YYYY-MM-DD`, filters on the `dt` partition column).

## API endpoints

| Method | Path | Query params | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/config/status` | — | S3 connection status (no secrets returned) |
| `POST` | `/api/config` | — | Configure S3 at runtime (JSON body, see below) |
| `GET` | `/api/health` | — | Health check + `ready` flag |
| `GET` | `/api/overview` | `from`, `to` | KPI totals |
| `GET` | `/api/timeseries` | `from`, `to`, `event` | Daily event volume |
| `GET` | `/api/events/top` | `from`, `to`, `limit` | Top events by count |
| `GET` | `/api/screens/top` | `from`, `to`, `limit` | Top screen paths |
| `GET` | `/api/errors/top` | `from`, `to`, `limit` | Top error types |
| `GET` | `/api/dau` | `from`, `to`, `limit` | Daily active users |
| `GET` | `/api/retention` | `from`, `to`, `limit`, `day` | Day-N retention cohorts |
| `POST` | `/api/query` | — | Ad-hoc read-only SQL (`{ "sql": "..." }`) |

### `POST /api/config` body

```json
{
  "s3Bucket": "my-analytics-bucket",
  "s3Prefix": "events",
  "awsRegion": "us-east-1",
  "accessKeyId": "…",
  "secretAccessKey": "…",
  "endpointUrl": "http://localhost:9000",
  "useIam": false
}
```

Set `useIam: true` to use IAM role / instance profile instead of access keys. The server tests the connection (`SELECT count(*) FROM events()`) before accepting the config. Credentials are held in memory for the current process only.

## Privacy

- Server logs aggregate counts only — never `distinct_id`, `properties`, or `context`.
- DAU and retention use `anonymous_id`.
- The **Query** tab runs arbitrary `SELECT` / `WITH` statements. It is intended for self-hosted use only and can expose raw columns. Do not expose this endpoint on untrusted networks without authentication.

## Data lag

The dashboard reads flushed Parquet on S3 only. Events still in the ingest server's local staging table are not visible until the next flush (default: 60 s or 5 000 rows).

## Related

- [Ingest server](/backend/ingest-server) — writes the Parquet dataset this dashboard reads
- [Local testing with MinIO](/backend/local-testing) — end-to-end ingest + query workflow
- [Event shape](/reference/event-shape) — Parquet column schema
