import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  configureAndTest,
  getLastError,
  getRuntimeConfig,
  getS3Source,
  isDbReady,
  queryRaw,
  usesIamAuth,
  markInitFailed,
} from './duckdb.js';
import {
  configFromEnv,
  parseConfigInput,
  publicStatus,
  type S3ConfigInput,
} from './s3-config.js';
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

function configStatusPayload() {
  return publicStatus(
    getRuntimeConfig(),
    isDbReady(),
    getLastError(),
    usesIamAuth(),
  );
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = Fastify({ logger: false });

app.get('/api/health', async (_req, reply) => {
  const status = configStatusPayload();
  return reply.send({ ok: true, ready: status.ready, source: status.source ?? (getS3Source() || null) });
});

app.get('/api/config/status', async (_req, reply) => {
  return reply.send({ ok: true, ...configStatusPayload() });
});

app.post<{ Body: S3ConfigInput }>('/api/config', async (req, reply) => {
  const parsed = parseConfigInput(req.body ?? {});
  if (typeof parsed === 'string') {
    return reply.code(400).send({ ok: false, error: parsed });
  }

  try {
    await configureAndTest(parsed.config, parsed.useIam);
    console.log(`[dashboard] S3 configured → ${getS3Source()}`);
    return reply.send({ ok: true, ...configStatusPayload() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'S3 connection failed';
    markInitFailed(message);
    console.error('[dashboard] S3 config failed:', message);
    const status = configStatusPayload();
    return reply.code(400).send({ ok: false, ...status, error: message });
  }
});

function requireDb(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!isDbReady()) {
    const status = configStatusPayload();
    reply.code(503).send({
      ok: false,
      ...status,
      error: 'S3 backend is not configured',
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

async function tryEnvConfig(): Promise<void> {
  const env = configFromEnv();
  if (!env) return;
  try {
    await configureAndTest(env, !env.accessKeyId && !env.secretAccessKey);
    console.log(`[dashboard] S3 ready from env → ${getS3Source()}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'S3 connection failed';
    markInitFailed(message);
    console.error('[dashboard] env S3 config failed:', message);
    console.error('[dashboard] open the UI to configure S3 credentials');
  }
}

async function start() {
  try {
    await tryEnvConfig();
    await registerStatic();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    const label = isDbReady() ? getS3Source() : '(awaiting S3 configuration)';
    console.log(`[dashboard] listening on port ${PORT}  →  S3 ${label}`);
  } catch (err) {
    console.error('[dashboard] startup failed:', err);
    process.exit(1);
  }
}

start();
