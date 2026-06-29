---
sidebar_position: 1
title: Ingest Server
---

# Ingest Server

A lightweight Node.js service that accepts the SDK's HTTP push, buffers events in a local DuckDB staging table, and periodically exports them as date-partitioned **Parquet** files on **S3**.

```
browser / RN  ──POST {batch,sentAt}──▶  ingest-server (Fastify + DuckDB)
                                               │  INSERT into .staging.duckdb
                                               │  flush on timer or row threshold
                                               ▼
                                    S3  s3://bucket/events/dt=YYYY-MM-DD/part-<uuid>.parquet
                                               │
                                    DuckDB  read_parquet('s3://…/**/*.parquet')
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- An S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, …)
- DuckDB CLI for queries: `brew install duckdb`

## Setup

```bash
cp apps/ingest-server/.env.example apps/ingest-server/.env
# Edit S3_BUCKET, AWS_*, PORT, etc.

pnpm install
pnpm --filter ingest-server dev
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | HTTP port |
| `INGEST_PATH` | `/batch` | POST path |
| `S3_BUCKET` | — | **Required.** Target bucket |
| `S3_PREFIX` | `events` | Key prefix |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | — | Blank for IAM auth |
| `AWS_SECRET_ACCESS_KEY` | — | Blank for IAM auth |
| `ENDPOINT_URL` | — | MinIO / R2 override |
| `DUCKDB_STAGING_PATH` | `./.staging.duckdb` | Local staging file |
| `FLUSH_INTERVAL_MS` | `60000` | Flush interval |
| `FLUSH_MAX_ROWS` | `5000` | Row-count flush threshold |

## Wire the SDK

```ts
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

new HttpStorageAdapter({ endpoint: 'http://localhost:8787/batch' })
```

## Response codes

| Code | Meaning | SDK behaviour |
|------|---------|---------------|
| `200` | Batch staged | Success |
| `400` | Malformed body | Non-retriable — batch discarded |
| `503` | Staging failed | Retry with backoff |

## Query with DuckDB

```bash
duckdb
> .read apps/ingest-server/queries/01-setup.sql
> .read apps/ingest-server/queries/02-explore.sql
```

See [Local testing with MinIO](/backend/local-testing) and [Event shape](/reference/event-shape) for the Parquet schema.

## Visualize with the analytics dashboard

For a built-in UI instead of the DuckDB CLI, run the [analytics dashboard](/backend/analytics-dashboard) alongside the ingest server. It queries the same S3 Parquet prefix via DuckDB and exposes charts (DAU, top events, retention) plus a read-only SQL console.
