# SunGlasses Ingest Server

A lightweight Node.js service that accepts the SDK's HTTP push, buffers events in a local DuckDB staging table, and periodically exports them as date-partitioned **Parquet** files on **S3**. DuckDB then queries the Parquet directly from S3 — no separate data warehouse required.

```
browser / RN  ──POST {batch,sentAt}──▶  ingest-server (Fastify + DuckDB)
                                               │  INSERT into .staging.duckdb (durable)
                                               │  flush on timer or row-count threshold
                                               ▼
                                    S3  s3://bucket/events/dt=YYYY-MM-DD/part-<uuid>.parquet
                                               │
                                    DuckDB  read_parquet('s3://…/**/*.parquet', hive_partitioning=true)
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- An S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, …)
- DuckDB CLI (for running queries): `brew install duckdb` or [duckdb.org/docs/installation](https://duckdb.org/docs/installation)

## Setup

```bash
# 1. Copy and fill in the environment file
cp .env.example .env
$EDITOR .env          # set S3_BUCKET, AWS_* (or leave blank for IAM auth), PORT, etc.

# 2. Install dependencies
pnpm install

# 3. Start the server (tsx watch — restarts on file changes)
pnpm --filter ingest-server dev

# Or start without watch
pnpm --filter ingest-server start
```

## Environment variables

| Variable              | Default            | Description                                      |
|-----------------------|--------------------|--------------------------------------------------|
| `PORT`                | `8787`             | HTTP port                                        |
| `INGEST_PATH`         | `/batch`           | POST path (matches HttpStorageAdapter endpoint)  |
| `S3_BUCKET`           | —                  | **Required.** Target S3 bucket name              |
| `S3_PREFIX`           | `events`           | Key prefix inside the bucket                     |
| `AWS_REGION`          | `us-east-1`        | AWS region                                       |
| `AWS_ACCESS_KEY_ID`   | —                  | Leave blank to use IAM / credential_chain        |
| `AWS_SECRET_ACCESS_KEY` | —                | Leave blank to use IAM / credential_chain        |
| `ENDPOINT_URL`        | —                  | Override for MinIO / R2 (e.g. `http://localhost:9000`) |
| `DUCKDB_STAGING_PATH` | `./.staging.duckdb` | Local DuckDB file; survives restarts            |
| `FLUSH_INTERVAL_MS`   | `60000`            | Flush to S3 every N ms                           |
| `FLUSH_MAX_ROWS`      | `5000`             | Also flush if staging table hits this row count  |

## Point the SDK at this server

```ts
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';

const client = await SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  adapters: [
    new HttpStorageAdapter({ endpoint: 'http://localhost:8787/batch' }),
  ],
});
```

The SDK `POST`s `{ batch: SunglassesEvent[], sentAt: "<ISO-8601>" }`. The server returns:
- `200 { ok: true, count: N }` — batch staged; retry not needed
- `400` — malformed body; the SDK treats 4xx as non-retriable (batch discarded client-side)
- `503` — staging failed; the SDK's retry/backoff keeps the batch in the local queue

## Query with DuckDB

```bash
# Start the DuckDB CLI and load S3 credentials
duckdb
> .read queries/01-setup.sql

# Explore events
> .read queries/02-explore.sql

# Or run individual queries inline
> SELECT event, count(*) FROM read_parquet('s3://my-bucket/events/**/*.parquet', hive_partitioning=true) GROUP BY event;
```

### Parquet schema

Each file contains these columns:

| Column        | Type    | Notes                                              |
|---------------|---------|----------------------------------------------------|
| `event_type`  | VARCHAR | `'capture'`, `'screen'`, `'identify'`, …           |
| `event`       | VARCHAR | Event name, e.g. `'button_clicked'`, `'$screen'`  |
| `distinct_id` | VARCHAR | Hashed user ID (or anonymous_id before identify)  |
| `anonymous_id`| VARCHAR | Stable device UUID — safe for DAU/retention        |
| `ts`          | VARCHAR | ISO-8601 UTC event timestamp                       |
| `message_id`  | VARCHAR | UUID v4 — use for deduplication                   |
| `properties`  | VARCHAR | JSON — event properties (PII-sanitized by SDK)    |
| `context`     | VARCHAR | JSON — library/platform/app metadata              |
| `received_at` | VARCHAR | ISO-8601 UTC time the server received the batch   |
| `dt`          | VARCHAR | `'YYYY-MM-DD'` partition key (hive directory)     |

Files are partitioned as `dt=YYYY-MM-DD/part-<uuid>.parquet`.

## Local testing without AWS (MinIO)

```bash
# Start MinIO
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# Create a bucket in the MinIO console at http://localhost:9001
# Then set in .env:
#   ENDPOINT_URL=http://localhost:9000
#   AWS_ACCESS_KEY_ID=minioadmin
#   AWS_SECRET_ACCESS_KEY=minioadmin

# In queries/01-setup.sql, add to the CREATE SECRET block:
#   , ENDPOINT 'localhost:9000', USE_SSL false
```
