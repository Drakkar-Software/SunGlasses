import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  configureDirectS3,
  configureStarfish,
  getDataSource,
  getLastError,
  getRuntimeConfig,
  getS3Source,
  isDbReady,
  queryRaw,
  usesIamAuth,
  markInitFailed,
  resetDb,
} from './duckdb.js';
import { statusForS3, statusForStarfish, type ConfigStatus } from './config-status.js';
import {
  configFromEnv as s3ConfigFromEnv,
  envAutoConfigureEnabled,
  formatS3Error,
  parseConfigInput,
  type S3ConfigInput,
} from './s3-config.js';
import { clearStoredConfig, loadStoredConfig, storeConfig } from './s3-config-store.js';
import {
  configFromEnv as starfishConfigFromEnv,
  parseStarfishInput,
  type StarfishConfig,
  type StarfishConfigInput,
} from './starfish-config.js';
import {
  clearStoredStarfishConfig,
  loadStoredStarfishConfig,
  storeStarfishConfig,
} from './starfish-config-store.js';
import { testStarfishConnection } from './starfish-client.js';
import { computeSyncStats, syncParquetCache } from './starfish-sync.js';
import {
  getOverview,
  getTimeseries,
  getTopEvents,
  getTopScreens,
  getTopErrors,
  getDau,
  getRetention,
} from './queries.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env['PORT'] ?? '8788', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

let _starfishConfig: StarfishConfig | null = null;
let _syncStats = null as Awaited<ReturnType<typeof computeSyncStats>> | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RangeQuery {
  from?: string;
  to?: string;
  limit?: string;
  event?: string;
  day?: string;
}

type ConfigInput =
  | (S3ConfigInput & { source?: 'direct_s3' })
  | StarfishConfigInput;

function parseRange(q: RangeQuery) {
  return {
    from: q.from,
    to: q.to,
    limit: q.limit ? parseInt(q.limit, 10) : undefined,
    event: q.event,
    day: q.day ? parseInt(q.day, 10) : undefined,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateRange(q: RangeQuery): string | null {
  if (q.from && !DATE_RE.test(q.from)) return 'invalid from date (use YYYY-MM-DD)';
  if (q.to && !DATE_RE.test(q.to)) return 'invalid to date (use YYYY-MM-DD)';
  return null;
}

/** Reject non-read-only ad-hoc SQL */
export function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim();
  if (!trimmed) return false;
  if (trimmed.includes(';')) return false;
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) return false;
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|COPY|ATTACH|DETACH|INSTALL|LOAD|EXPORT|IMPORT|SET|PRAGMA|CALL|EXECUTE)\b/i;
  return !forbidden.test(trimmed);
}

function configStatusPayload(): ConfigStatus {
  const ds = getDataSource();
  if (ds === 'starfish') {
    return statusForStarfish(_starfishConfig, isDbReady(), getLastError(), _syncStats);
  }
  return statusForS3(getRuntimeConfig(), isDbReady(), getLastError(), usesIamAuth());
}

async function applyStarfishConfig(config: StarfishConfig): Promise<void> {
  await testStarfishConnection(config);
  _syncStats = await syncParquetCache(config);
  await configureStarfish(config.cacheDir);
  _starfishConfig = config;
}

function formatStarfishError(raw: string, publicRead?: boolean): string {
  const firstLine = raw.split('\n').map((l) => l.trim()).find(Boolean) ?? raw;
  if (/401|403|unauthorized|forbidden/i.test(firstLine)) {
    if (publicRead) {
      return 'Starfish access denied — the events collection may not allow public read/list. Enable admin cap-cert auth or set read_roles to include "public" on the sync server.';
    }
    return 'Starfish access denied — check admin cap-cert, device private key, and platform admin wiring on the sync server.';
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(firstLine)) {
    return `Cannot reach Starfish at the configured URL. Is the sync server running?`;
  }
  return firstLine;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = Fastify({ logger: false });

app.get('/api/health', async (_req, reply) => {
  const status = configStatusPayload();
  return reply.send({
    ok: true,
    ready: status.ready,
    dataSource: status.dataSource,
    source: status.source,
  });
});

app.get('/api/config/status', async (_req, reply) => {
  return reply.send({ ok: true, ...configStatusPayload() });
});

app.post<{ Body: ConfigInput }>('/api/config', async (req, reply) => {
  const body = req.body ?? {};
  const source = body.source ?? ('baseUrl' in body || 'cap' in body || 'publicRead' in body ? 'starfish' : 'direct_s3');

  if (source === 'starfish') {
    const parsed = parseStarfishInput(body as StarfishConfigInput);
    if (typeof parsed === 'string') {
      return reply.code(400).send({ ok: false, error: parsed });
    }
    try {
      resetDb();
      _starfishConfig = null;
      _syncStats = null;
      await clearStoredConfig();
      await applyStarfishConfig(parsed);
      await storeStarfishConfig(parsed);
      console.log(`[dashboard] Starfish configured → ${getS3Source()}`);
      return reply.send({ ok: true, ...configStatusPayload() });
    } catch (e) {
      const message = formatStarfishError(
        e instanceof Error ? e.message : 'Starfish connection failed',
        parsed.publicRead,
      );
      markInitFailed(message);
      console.error('[dashboard] Starfish config failed:', message);
      return reply.code(400).send({ ok: false, ...configStatusPayload(), error: message });
    }
  }

  const parsed = parseConfigInput(body as S3ConfigInput);
  if (typeof parsed === 'string') {
    return reply.code(400).send({ ok: false, error: parsed });
  }

  try {
    resetDb();
    _starfishConfig = null;
    _syncStats = null;
    await clearStoredStarfishConfig();
    await configureDirectS3(parsed.config, parsed.useIam);
    await storeConfig(parsed.config, parsed.useIam);
    console.log(`[dashboard] S3 configured → ${getS3Source()}`);
    return reply.send({ ok: true, ...configStatusPayload() });
  } catch (e) {
    const message = formatS3Error(
      e instanceof Error ? e.message : 'S3 connection failed',
      parsed.config,
    );
    markInitFailed(message);
    console.error('[dashboard] S3 config failed:', message);
    return reply.code(400).send({ ok: false, ...configStatusPayload(), error: message });
  }
});

app.delete('/api/config', async (_req, reply) => {
  await clearStoredConfig();
  await clearStoredStarfishConfig();
  resetDb();
  _starfishConfig = null;
  _syncStats = null;
  console.log('[dashboard] configuration cleared');
  return reply.send({ ok: true, ...configStatusPayload() });
});

app.post('/api/sync', async (_req, reply) => {
  if (getDataSource() !== 'starfish' || !_starfishConfig) {
    return reply.code(400).send({ ok: false, error: 'Starfish mode is not configured' });
  }
  try {
    _syncStats = await syncParquetCache(_starfishConfig);
    await configureStarfish(_starfishConfig.cacheDir);
    return reply.send({ ok: true, ...configStatusPayload() });
  } catch (e) {
    const message = formatStarfishError(
      e instanceof Error ? e.message : 'Sync failed',
      _starfishConfig.publicRead,
    );
    return reply.code(400).send({ ok: false, ...configStatusPayload(), error: message });
  }
});

function requireDb(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!isDbReady()) {
    const status = configStatusPayload();
    reply.code(503).send({
      ok: false,
      ...status,
      error: 'Data backend is not configured',
    });
    return false;
  }
  return true;
}

app.get<{ Querystring: RangeQuery }>('/api/overview', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getOverview(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] overview failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/timeseries', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getTimeseries(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] dashboard timeseries failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/events/top', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getTopEvents(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] events/top failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/screens/top', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getTopScreens(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] screens/top failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/errors/top', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getTopErrors(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] errors/top failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/dau', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getDau(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] dau failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

app.get<{ Querystring: RangeQuery }>('/api/retention', async (req, reply) => {
  if (!requireDb(reply)) return;
  const err = validateDateRange(req.query);
  if (err) return reply.code(400).send({ ok: false, error: err });
  try {
    const data = await getRetention(parseRange(req.query));
    return reply.send({ ok: true, data });
  } catch (e) {
    console.error('[dashboard] retention failed:', e instanceof Error ? e.message : e);
    return reply.code(500).send({ ok: false, error: 'query failed' });
  }
});

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return out;
  });
}

app.post<{ Body: { sql?: string } }>('/api/query', async (req, reply) => {
  if (!requireDb(reply)) return;
  const sql = req.body?.sql;
  if (!sql || typeof sql !== 'string') {
    return reply.code(400).send({ ok: false, error: 'sql is required' });
  }
  if (!isReadOnlySql(sql)) {
    return reply.code(400).send({
      ok: false,
      error: 'only single SELECT or WITH statements are allowed',
    });
  }
  try {
    const rows = serializeRows(await queryRaw(sql));
    const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
    console.log(`[dashboard] ad-hoc query returned ${rows.length} row(s)`);
    return reply.send({ ok: true, columns, rows });
  } catch (e) {
    console.error('[dashboard] query failed:', e instanceof Error ? e.message : e);
    return reply.code(400).send({
      ok: false,
      error: e instanceof Error ? e.message : 'query failed',
    });
  }
});

// ---------------------------------------------------------------------------
// Static UI (production build)
// ---------------------------------------------------------------------------

async function registerStatic() {
  if (!existsSync(DIST_DIR)) return;
  await app.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ ok: false, error: 'not found' });
    }
    return reply.sendFile('index.html');
  });
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function tryStoredStarfish(): Promise<boolean> {
  const stored = await loadStoredStarfishConfig();
  if (!stored) return false;
  try {
    await applyStarfishConfig(stored.config);
    console.log(`[dashboard] Starfish ready from saved config → ${getS3Source()}`);
    return true;
  } catch (e) {
    const message = formatStarfishError(
      e instanceof Error ? e.message : 'Starfish connection failed',
      stored.config.publicRead,
    );
    markInitFailed(message);
    console.warn(`[dashboard] Saved Starfish config failed — ${message}`);
    return false;
  }
}

async function tryStoredS3(): Promise<boolean> {
  const stored = await loadStoredConfig();
  if (!stored) return false;
  try {
    await configureDirectS3(stored.config, stored.useIam);
    console.log(`[dashboard] S3 ready from saved UI config → ${getS3Source()}`);
    return true;
  } catch (e) {
    const message = formatS3Error(
      e instanceof Error ? e.message : 'S3 connection failed',
      stored.config,
    );
    markInitFailed(message);
    console.warn(`[dashboard] Saved S3 config failed — ${message}`);
    return false;
  }
}

async function tryEnvStarfish(): Promise<void> {
  const env = starfishConfigFromEnv();
  if (!env) return;
  try {
    await applyStarfishConfig(env);
    console.log(`[dashboard] Starfish ready from env → ${getS3Source()}`);
  } catch (e) {
    const message = formatStarfishError(
      e instanceof Error ? e.message : 'Starfish connection failed',
      env.publicRead,
    );
    markInitFailed(message);
    console.warn(`[dashboard] Starfish not ready from .env — ${message}`);
  }
}

async function tryEnvS3(): Promise<void> {
  const env = s3ConfigFromEnv();
  if (!env) return;
  try {
    await configureDirectS3(env, !env.accessKeyId && !env.secretAccessKey);
    console.log(`[dashboard] S3 ready from env → ${getS3Source()}`);
  } catch (e) {
    const message = formatS3Error(
      e instanceof Error ? e.message : 'S3 connection failed',
      env,
    );
    markInitFailed(message);
    console.warn(`[dashboard] S3 not ready from .env — ${message}`);
  }
}

async function bootstrap(): Promise<void> {
  if (await tryStoredStarfish()) return;
  if (await tryStoredS3()) return;
  if (process.env['STARFISH_CONFIGURE_FROM_ENV'] === 'true') {
    await tryEnvStarfish();
    return;
  }
  if (envAutoConfigureEnabled()) {
    await tryEnvS3();
  }
}

async function start() {
  try {
    await bootstrap();
    await registerStatic();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    const label = isDbReady() ? getS3Source() : '(awaiting configuration)';
    console.log(`[dashboard] listening on port ${PORT}  →  ${label}`);
  } catch (err) {
    console.error('[dashboard] startup failed:', err);
    process.exit(1);
  }
}

start();
