/**
 * DuckDB-WASM singleton — browser port of server/duckdb.ts.
 *
 * Uses the self-hosted `eh` (exception-handling) bundle so no SharedArrayBuffer /
 * COOP+COEP cross-origin isolation is required on Cloudflare.
 *
 * Lazy init: getConn() initialises the WASM instance on first call.
 */
import * as duckdb from '@duckdb/duckdb-wasm';
// Self-hosted bundles — Vite resolves these as URLs (no external CDN)
import duckdbMvpWasm   from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbEhWasm    from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEhWorker  from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

import type { S3Config, StarfishConfig, SyncStats, DataSourceKind } from './config.js';
import { formatS3Error } from './config.js';
import {
  syncParquetCache,
  rehydrateRegistry,
  getRegisteredBuffers,
  getRegisteredFiles,
  clearRegistry,
  computeSyncStats,
} from './starfish-sync.js';

// ── Singleton state ───────────────────────────────────────────────────────────

let _db:           duckdb.AsyncDuckDB | null          = null;
let _conn:         duckdb.AsyncDuckDBConnection | null = null;
let _dataSource:   DataSourceKind                     = null;
let _s3Config:     S3Config | null                    = null;
let _starfishConf: StarfishConfig | null              = null;
let _syncStats:    SyncStats | null                   = null;
let _ready:        boolean                            = false;
let _lastError:    string | null                      = null;

// ── WASM init (lazy) ──────────────────────────────────────────────────────────

async function ensureDb(): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db;

  const BUNDLES: duckdb.DuckDBBundles = {
    mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
    eh:  { mainModule: duckdbEhWasm,  mainWorker: duckdbEhWorker },
  };
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  _db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return _db;
}

// ── Connection helpers ────────────────────────────────────────────────────────

const sqlEscape = (s: string): string => s.replace(/'/g, "''");

async function resetConnection(): Promise<void> {
  if (_conn) {
    await _conn.close().catch(() => undefined);
    _conn = null;
  }
  _ready     = false;
  _lastError = null;
}

function conn(): duckdb.AsyncDuckDBConnection {
  if (!_conn || !_ready) {
    throw new Error('Data backend is not configured — connect via the setup screen');
  }
  return _conn;
}

// ── S3 setup ─────────────────────────────────────────────────────────────────

async function setupDirectS3(config: S3Config): Promise<void> {
  await resetConnection();
  const db   = await ensureDb();
  _conn      = await db.connect();

  // httpfs is required for s3:// reads
  try { await _conn.query('INSTALL httpfs'); } catch { /* bundled — INSTALL is a no-op */ }
  await _conn.query('LOAD httpfs');

  const hasKeys = config.accessKeyId.length > 0 && config.secretAccessKey.length > 0;
  if (hasKeys) {
    const endpointHost   = config.endpointUrl.replace(/^https?:\/\//, '');
    const endpointClause = config.endpointUrl ? `, ENDPOINT '${sqlEscape(endpointHost)}'` : '';
    const useSSL         = config.endpointUrl ? `, USE_SSL ${config.endpointUrl.startsWith('https') ? 'true' : 'false'}` : '';
    const urlStyle       = config.endpointUrl ? `, URL_STYLE 'path'` : '';
    await _conn.query(`
      CREATE OR REPLACE SECRET sg_s3 (
        TYPE    s3,
        KEY_ID  '${sqlEscape(config.accessKeyId)}',
        SECRET  '${sqlEscape(config.secretAccessKey)}',
        REGION  '${sqlEscape(config.awsRegion)}'
        ${endpointClause}
        ${useSSL}
        ${urlStyle}
      )
    `);
  }

  const parquetGlob = `s3://${config.s3Bucket}/${config.s3Prefix}/**/*.parquet`;
  await _conn.query(`
    CREATE OR REPLACE MACRO events() AS TABLE
      SELECT * FROM read_parquet('${sqlEscape(parquetGlob)}', hive_partitioning = true)
  `);

  _dataSource = 'direct_s3';
  _s3Config   = config;
  _starfishConf = null;
  _syncStats    = null;
  _ready        = true;
  _lastError    = null;
}

// ── Starfish setup ────────────────────────────────────────────────────────────

async function setupStarfishCache(
  config:    StarfishConfig,
  syncStats: SyncStats,
): Promise<void> {
  await resetConnection();
  const db  = await ensureDb();
  _conn     = await db.connect();

  // Register all in-memory Parquet buffers
  const buffers = getRegisteredBuffers();
  for (const { name, data } of buffers) {
    await db.registerFileBuffer(name, data);
  }

  const files = getRegisteredFiles();
  if (files.length === 0) {
    // No data yet — create an empty macro that returns zero rows
    await _conn.query(`
      CREATE OR REPLACE MACRO events() AS TABLE
        SELECT
          '' AS dt, '' AS ts, '' AS event, '' AS event_type,
          '' AS anonymous_id, '' AS context, '' AS properties
        LIMIT 0
    `);
  } else {
    const fileList = files.map((f) => `'${sqlEscape(f)}'`).join(', ');
    await _conn.query(`
      CREATE OR REPLACE MACRO events() AS TABLE
        SELECT * FROM read_parquet([${fileList}], hive_partitioning = true)
    `);
  }

  _dataSource   = 'starfish';
  _s3Config     = null;
  _starfishConf = config;
  _syncStats    = syncStats;
  _ready        = true;
  _lastError    = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isDbReady(): boolean         { return _ready; }
export function getDataSource(): DataSourceKind { return _dataSource; }
export function getLastError(): string | null { return _lastError; }
export function getS3Config(): S3Config | null { return _s3Config; }
export function getStarfishConfig(): StarfishConfig | null { return _starfishConf; }
export function getSyncStats(): SyncStats | null { return _syncStats; }

/** Configure DuckDB for Direct S3 reads and verify connectivity. */
export async function configureDirectS3(config: S3Config): Promise<void> {
  try {
    await setupDirectS3(config);
    await testConnection();
  } catch (e) {
    _ready     = false;
    _lastError = formatS3Error(e instanceof Error ? e.message : String(e), config);
    throw new Error(_lastError);
  }
}

/** Configure DuckDB for Starfish (sync batches into memory, then register). */
export async function configureStarfish(config: StarfishConfig): Promise<SyncStats> {
  try {
    // Pull any new batches from the Starfish server
    const stats = await syncParquetCache(config);
    await setupStarfishCache(config, stats);
    await testConnection();
    return stats;
  } catch (e) {
    _ready     = false;
    _lastError = e instanceof Error ? e.message : String(e);
    throw new Error(_lastError);
  }
}

/** Re-sync Starfish (pull new batches, rebuild macro). */
export async function resyncStarfish(): Promise<SyncStats> {
  if (!_starfishConf) throw new Error('Not connected to Starfish');
  const config = _starfishConf;
  try {
    const stats = await syncParquetCache(config);
    // Re-setup with the updated file list
    await setupStarfishCache(config, stats);
    await testConnection();
    _syncStats = stats;
    return stats;
  } catch (e) {
    _lastError = e instanceof Error ? e.message : String(e);
    throw new Error(_lastError);
  }
}

/** Probe read access — succeeds even when there are zero Parquet files. */
export async function testConnection(): Promise<void> {
  await conn().query(`SELECT count(*) AS n FROM events()`);
}

/** Clear the DuckDB connection and in-memory state. */
export async function resetDb(): Promise<void> {
  await resetConnection();
  clearRegistry();
  _dataSource   = null;
  _s3Config     = null;
  _starfishConf = null;
  _syncStats    = null;
  _lastError    = null;
}

// ── Query execution ───────────────────────────────────────────────────────────

export type QueryRow = Record<string, unknown>;

function arrowToRows(table: Awaited<ReturnType<duckdb.AsyncDuckDBConnection['query']>>): QueryRow[] {
  return table.toArray().map((r) => {
    const row: QueryRow = {};
    for (const field of table.schema.fields) {
      const v = (r as Record<string, unknown>)[field.name];
      // Coerce BigInt → Number to match the old server's serializeRows behaviour
      row[field.name] = typeof v === 'bigint' ? Number(v) : v;
    }
    return row;
  });
}

/** Execute parameterized SQL and return plain row objects. */
export async function query(sql: string, params: unknown[] = []): Promise<QueryRow[]> {
  const c = conn();
  if (params.length > 0) {
    const stmt = await c.prepare(sql);
    try {
      const table = await stmt.query(...(params as Parameters<typeof stmt.query>));
      return arrowToRows(table);
    } finally {
      await stmt.close();
    }
  }
  const table = await c.query(sql);
  return arrowToRows(table);
}

/** Execute raw SQL (ad-hoc console — no params). */
export async function queryRaw(sql: string): Promise<QueryRow[]> {
  return query(sql);
}
