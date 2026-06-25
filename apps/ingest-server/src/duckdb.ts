import { DuckDBInstance } from '@duckdb/node-api';
import type { EventRow } from './schema.js';

// ---------------------------------------------------------------------------
// Config (from environment)
// ---------------------------------------------------------------------------

const STAGING_PATH = process.env['DUCKDB_STAGING_PATH'] ?? './.staging.duckdb';
const S3_BUCKET = process.env['S3_BUCKET'] ?? '';
const S3_PREFIX = process.env['S3_PREFIX'] ?? 'events';
const AWS_REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const AWS_KEY_ID = process.env['AWS_ACCESS_KEY_ID'] ?? '';
const AWS_SECRET = process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
const ENDPOINT_URL = process.env['ENDPOINT_URL'] ?? '';

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance: InstanceType<typeof DuckDBInstance> | null = null;
let _conn: Awaited<ReturnType<InstanceType<typeof DuckDBInstance>['connect']>> | null = null;

/**
 * Initialise the persistent DuckDB staging database, create the staging table
 * (if it doesn't exist), and configure the httpfs extension for S3 access.
 *
 * Call once at startup; subsequent calls return immediately.
 */
export async function initDb(): Promise<void> {
  if (_instance) return;

  _instance = await DuckDBInstance.create(STAGING_PATH);
  _conn = await _instance.connect();

  // Staging sequence + table — survive restarts because the file is persistent.
  await _conn.run(`CREATE SEQUENCE IF NOT EXISTS staging_seq START 1`);
  await _conn.run(`
    CREATE TABLE IF NOT EXISTS events_staging (
      seq          BIGINT  DEFAULT nextval('staging_seq') NOT NULL,
      event_type   VARCHAR NOT NULL,
      event        VARCHAR NOT NULL,
      distinct_id  VARCHAR NOT NULL,
      anonymous_id VARCHAR NOT NULL,
      ts           VARCHAR NOT NULL,
      message_id   VARCHAR NOT NULL UNIQUE,
      properties   VARCHAR NOT NULL,
      context      VARCHAR NOT NULL,
      received_at  VARCHAR NOT NULL,
      dt           VARCHAR NOT NULL
    )
  `);

  // httpfs ships separately — install once (no-op if already present), then load.
  await _conn.run(`INSTALL httpfs`);
  await _conn.run(`LOAD httpfs`);

  // Set up S3 credentials. If no explicit key/secret, fall back to the
  // credential_chain (IAM role, instance profile, ~/.aws/credentials, etc.).
  // Escape all credential values before embedding in SQL literals.
  const sqlEscape = (s: string) => s.replace(/'/g, "''");
  if (AWS_KEY_ID && AWS_SECRET) {
    const endpointHost = ENDPOINT_URL.replace(/^https?:\/\//, '');
    const endpointClause = ENDPOINT_URL
      ? `, ENDPOINT '${sqlEscape(endpointHost)}'`
      : '';
    const useSSL = ENDPOINT_URL
      ? `, USE_SSL ${ENDPOINT_URL.startsWith('https') ? 'true' : 'false'}`
      : '';
    await _conn.run(`
      CREATE OR REPLACE SECRET sg_s3 (
        TYPE       s3,
        KEY_ID     '${sqlEscape(AWS_KEY_ID)}',
        SECRET     '${sqlEscape(AWS_SECRET)}',
        REGION     '${sqlEscape(AWS_REGION)}'
        ${endpointClause}
        ${useSSL}
      )
    `);
  } else {
    // IAM / instance-profile auth
    await _conn.run(`
      CREATE OR REPLACE SECRET sg_s3 (
        TYPE     s3,
        PROVIDER credential_chain,
        REGION   '${sqlEscape(AWS_REGION)}'
      )
    `);
  }
}

function conn() {
  if (!_conn) throw new Error('[ingest] DuckDB not initialised — call initDb() first');
  return _conn;
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/**
 * Insert a batch of rows into the local staging table.
 * Returns immediately (DuckDB is local/embedded — extremely fast).
 *
 * Privacy: row.properties and row.context are opaque JSON; never log them.
 */
export async function stageBatch(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;

  // Build a multi-row VALUES insert. Values are embedded as DuckDB literals
  // using single-quoted strings with internal single-quotes doubled.
  const escape = (s: string) => s.replace(/'/g, "''");

  const valuesClauses = rows
    .map(
      (r) =>
        `('${escape(r.event_type)}','${escape(r.event)}','${escape(r.distinct_id)}'` +
        `,'${escape(r.anonymous_id)}','${escape(r.ts)}','${escape(r.message_id)}'` +
        `,'${escape(r.properties)}','${escape(r.context)}'` +
        `,'${escape(r.received_at)}','${escape(r.dt)}')`,
    )
    .join(',');

  // ON CONFLICT (message_id) DO NOTHING deduplicates retried batches:
  // if HttpStorageAdapter retries after a timeout where the server already
  // staged the events, duplicates are silently skipped.
  await conn().run(`
    INSERT OR IGNORE INTO events_staging
      (event_type, event, distinct_id, anonymous_id, ts, message_id,
       properties, context, received_at, dt)
    VALUES ${valuesClauses}
  `);
}

/**
 * Count of rows currently in the staging table.
 */
export async function stagingRowCount(): Promise<number> {
  const result = await conn().runAndReadAll(
    `SELECT count(*) AS n FROM events_staging`,
  );
  const rows = result.getRowObjects();
  return Number(rows[0]?.['n'] ?? 0);
}

// ---------------------------------------------------------------------------
// Flush path
// ---------------------------------------------------------------------------

let _flushInFlight = false;

/**
 * Copy staged events to S3 as date-partitioned Parquet files, then delete
 * the flushed rows from the staging table.
 *
 * Uses a seq-snapshot approach: records the max(seq) before the COPY so that
 * events inserted concurrently during the COPY are not deleted.
 *
 * Safe to call concurrently — a second call while a flush is in progress is
 * a no-op (the caller is responsible for retrying if needed).
 */
export async function flushToS3(): Promise<void> {
  if (_flushInFlight) return;
  _flushInFlight = true;

  try {
    // 1. Snapshot the high-water mark.
    const snapResult = await conn().runAndReadAll(
      `SELECT coalesce(max(seq), -1) AS snap FROM events_staging`,
    );
    const snap = Number(snapResult.getRowObjects()[0]?.['snap'] ?? -1);
    if (snap < 0) return; // nothing staged

    // 2. COPY that slice to S3 as partitioned Parquet.
    //    FILENAME_PATTERN with {uuid} produces a unique file per execution,
    //    so multiple flushes on the same day create separate part files.
    const s3Path = `s3://${S3_BUCKET}/${S3_PREFIX}/`;
    await conn().run(`
      COPY (
        SELECT event_type, event, distinct_id, anonymous_id,
               ts, message_id, properties, context, received_at, dt
        FROM events_staging
        WHERE seq <= ${snap}
      )
      TO '${s3Path}'
      (FORMAT PARQUET, PARTITION_BY (dt), FILENAME_PATTERN 'part-{uuid}', OVERWRITE_OR_IGNORE true)
    `);

    // 3. Remove the flushed rows (rows inserted after snap remain).
    await conn().run(`DELETE FROM events_staging WHERE seq <= ${snap}`);

    const flushedCount = snapResult.getRowObjects().length; // rows flushed, not result rows
    // Log only counts and anonymous_id-safe info — never distinct_id/properties/context.
    console.log(`[ingest] flushed events up to seq=${snap} → ${s3Path}`);
  } catch (err) {
    console.error('[ingest] flush failed:', err instanceof Error ? err.message : err);
    // Leave rows in staging — next flush cycle will retry.
  } finally {
    _flushInFlight = false;
  }
}
