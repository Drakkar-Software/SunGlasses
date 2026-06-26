import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'node:path';
import type { DataSourceKind } from './config-status.js';
import type { S3Config } from './s3-config.js';

// ---------------------------------------------------------------------------
// Runtime config + singleton connection
// ---------------------------------------------------------------------------

let _dataSource: DataSourceKind = null;
let _config: S3Config | null = null;
let _cacheDir: string | null = null;
let _useIam = false;
let _ready = false;
let _lastError: string | null = null;
let _instance: InstanceType<typeof DuckDBInstance> | null = null;
let _conn: Awaited<ReturnType<InstanceType<typeof DuckDBInstance>['connect']>> | null = null;

const sqlEscape = (s: string) => s.replace(/'/g, "''");

export function getDataSource(): DataSourceKind {
  return _dataSource;
}

export function getRuntimeConfig(): S3Config | null {
  return _config;
}

export function getCacheDir(): string | null {
  return _cacheDir;
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

async function setupDirectS3(config: S3Config, useIam: boolean): Promise<void> {
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

  _dataSource = 'direct_s3';
  _config = config;
  _cacheDir = null;
  _useIam = useIam || !hasKeys;
  _ready = true;
  _lastError = null;
}

async function setupStarfishCache(cacheDir: string): Promise<void> {
  resetConnection();

  _instance = await DuckDBInstance.create(':memory:');
  _conn = await _instance.connect();

  const abs = resolve(cacheDir).replace(/\\/g, '/');
  const parquetGlob = `${abs}/**/*.parquet`;
  await _conn.run(`
    CREATE OR REPLACE MACRO events() AS TABLE
      SELECT * FROM read_parquet(
        '${sqlEscape(parquetGlob)}',
        hive_partitioning = true
      )
  `);

  _dataSource = 'starfish';
  _config = null;
  _cacheDir = cacheDir;
  _useIam = false;
  _ready = true;
  _lastError = null;
}

/**
 * Configure DuckDB for direct S3 reads and verify connectivity.
 */
export async function configureDirectS3(config: S3Config, useIam: boolean): Promise<void> {
  await setupDirectS3(config, useIam);
  await testConnection();
}

/** @deprecated Use configureDirectS3 */
export async function configureAndTest(config: S3Config, useIam: boolean): Promise<void> {
  return configureDirectS3(config, useIam);
}

/**
 * Configure DuckDB to read from a local Parquet cache (Starfish sync).
 */
export async function configureStarfish(cacheDir: string): Promise<void> {
  await setupStarfishCache(cacheDir);
  await testConnection();
}

/** Probe read access — succeeds even when there are zero Parquet files. */
export async function testConnection(): Promise<void> {
  await conn().runAndReadAll(`SELECT count(*) AS n FROM events()`);
}

function conn() {
  if (!_conn || !_ready) {
    throw new Error('Data backend is not configured — connect via the setup screen');
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
  if (_dataSource === 'starfish' && _cacheDir) {
    return `starfish cache:${_cacheDir}`;
  }
  if (!_config) return '';
  return `s3://${_config.s3Bucket}/${_config.s3Prefix}/`;
}

export function markInitFailed(message: string): void {
  resetConnection();
  _lastError = message;
}

/** Clear runtime connection and config (e.g. user disconnects from UI). */
export function resetDb(): void {
  resetConnection();
  _dataSource = null;
  _config = null;
  _cacheDir = null;
  _useIam = false;
  _lastError = null;
}
