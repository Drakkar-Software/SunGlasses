import { DuckDBInstance } from '@duckdb/node-api';
import type { S3Config } from './s3-config.js';

// ---------------------------------------------------------------------------
// Runtime config + singleton connection
// ---------------------------------------------------------------------------

let _config: S3Config | null = null;
let _useIam = false;
let _ready = false;
let _lastError: string | null = null;
let _instance: InstanceType<typeof DuckDBInstance> | null = null;
let _conn: Awaited<ReturnType<InstanceType<typeof DuckDBInstance>['connect']>> | null = null;

const sqlEscape = (s: string) => s.replace(/'/g, "''");

export function getRuntimeConfig(): S3Config | null {
  return _config;
}

export function isDbReady(): boolean {
  return _ready;
}

export function getLastError(): string | null {
  return _lastError;
}

export function usesIamAuth(): boolean {
  return _useIam;
}

function resetConnection(): void {
  if (_conn) {
    _conn.closeSync();
    _conn = null;
  }
  _instance = null;
  _ready = false;
}

async function setupConnection(config: S3Config, useIam: boolean): Promise<void> {
  resetConnection();

  _instance = await DuckDBInstance.create(':memory:');
  _conn = await _instance.connect();

  await _conn.run(`INSTALL httpfs`);
  await _conn.run(`LOAD httpfs`);

  const hasKeys = config.accessKeyId.length > 0 && config.secretAccessKey.length > 0;

  if (hasKeys && !useIam) {
    const endpointHost = config.endpointUrl.replace(/^https?:\/\//, '');
    const endpointClause = config.endpointUrl
      ? `, ENDPOINT '${sqlEscape(endpointHost)}'`
      : '';
    const useSSL = config.endpointUrl
      ? `, USE_SSL ${config.endpointUrl.startsWith('https') ? 'true' : 'false'}`
      : '';
    const urlStyle = config.endpointUrl ? `, URL_STYLE 'path'` : '';
    await _conn.run(`
      CREATE OR REPLACE SECRET sg_s3 (
        TYPE       s3,
        KEY_ID     '${sqlEscape(config.accessKeyId)}',
        SECRET     '${sqlEscape(config.secretAccessKey)}',
        REGION     '${sqlEscape(config.awsRegion)}'
        ${endpointClause}
        ${useSSL}
        ${urlStyle}
      )
    `);
  } else {
    await _conn.run(`
      CREATE OR REPLACE SECRET sg_s3 (
        TYPE     s3,
        PROVIDER credential_chain,
        REGION   '${sqlEscape(config.awsRegion)}'
      )
    `);
  }

  const parquetGlob = `s3://${config.s3Bucket}/${config.s3Prefix}/**/*.parquet`;
  await _conn.run(`
    CREATE OR REPLACE MACRO events() AS TABLE
      SELECT * FROM read_parquet(
        '${sqlEscape(parquetGlob)}',
        hive_partitioning = true
      )
  `);

  _config = config;
  _useIam = useIam || !hasKeys;
  _ready = true;
  _lastError = null;
}

/**
 * Initialise DuckDB with the current runtime config. Idempotent when already ready.
 */
export async function initDb(config?: S3Config, useIam = false): Promise<void> {
  if (_ready && _conn && !config) return;

  const cfg = config ?? _config;
  if (!cfg?.s3Bucket) {
    throw new Error('S3 bucket is not configured');
  }

  await setupConnection(cfg, useIam);
}

/**
 * Apply config and verify S3 Parquet is readable before marking ready.
 */
export async function configureAndTest(config: S3Config, useIam: boolean): Promise<void> {
  await setupConnection(config, useIam);
  await testConnection();
}

/** Probe read access — succeeds even when the prefix has zero Parquet files. */
export async function testConnection(): Promise<void> {
  await conn().runAndReadAll(`SELECT count(*) AS n FROM events()`);
}

function conn() {
  if (!_conn || !_ready) {
    throw new Error('S3 backend is not configured — connect via the setup screen');
  }
  return _conn;
}

export type QueryRow = Record<string, unknown>;

export async function query(sql: string, params: unknown[] = []): Promise<QueryRow[]> {
  const result = await conn().runAndReadAll(
    sql,
    params as Parameters<ReturnType<typeof conn>['runAndReadAll']>[1],
  );
  return result.getRowObjects() as QueryRow[];
}

export async function queryRaw(sql: string): Promise<QueryRow[]> {
  const result = await conn().runAndReadAll(sql);
  return result.getRowObjects() as QueryRow[];
}

export function getS3Source(): string {
  if (!_config) return '';
  return `s3://${_config.s3Bucket}/${_config.s3Prefix}/`;
}

export function markInitFailed(message: string): void {
  resetConnection();
  _lastError = message;
}
