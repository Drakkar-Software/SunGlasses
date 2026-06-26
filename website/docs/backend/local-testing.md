---
sidebar_position: 2
title: Local Testing (MinIO)
---

# Local Testing with MinIO

Run the ingest server against a local S3-compatible store without AWS credentials.

## Start MinIO

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Create a bucket in the MinIO console at http://localhost:9001

## Configure ingest server

In `apps/ingest-server/.env`:

```env
ENDPOINT_URL=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=your-bucket-name
```

## DuckDB S3 setup

In `apps/ingest-server/queries/01-setup.sql`, add to the `CREATE SECRET` block:

```sql
, ENDPOINT 'localhost:9000', USE_SSL false
```

## End-to-end test

1. Start MinIO and the ingest server
2. Point the SDK at `http://localhost:8787/batch`
3. Call `client.optIn()` then `client.capture('test_event')`
4. Call `client.flush()`
5. Query Parquet files with DuckDB

See [Ingest server](/backend/ingest-server) for full setup.
