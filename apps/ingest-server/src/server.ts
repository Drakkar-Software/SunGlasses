import Fastify from 'fastify';
import type { SunglassesEvent } from '@drakkar.software/sunglasses-core';
import { initDb, stageBatch } from './duckdb.js';
import { startFlusher, maybeFlushEarly } from './flusher.js';
import { toRow } from './schema.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env['PORT'] ?? '8787', 10);
const INGEST_PATH = process.env['INGEST_PATH'] ?? '/batch';

// ---------------------------------------------------------------------------
// Request/response types
// ---------------------------------------------------------------------------

/** Shape of the POST body emitted by HttpStorageAdapter */
interface BatchBody {
  batch: SunglassesEvent[];
  sentAt: string;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = Fastify({ logger: false });

/** Health probe — useful for load-balancer / container readiness checks. */
app.get('/health', async (_req, reply) => {
  return reply.send({ ok: true });
});

/**
 * Batch ingest endpoint.
 *
 * Accepts: POST { batch: SunglassesEvent[], sentAt: string }
 *
 * On success:  200 { ok: true, count: N }
 * On bad body: 400
 * On DB error: 503 — the SDK's HttpStorageAdapter treats 5xx as retriable,
 *              so events stay in the client queue and are retried on the next
 *              flush cycle (no data loss).
 *
 * Privacy: batch/sentAt contents are never logged — only counts.
 */
app.post<{ Body: BatchBody }>(INGEST_PATH, async (req, reply) => {
  const body = req.body;

  // Basic validation
  if (!body || !Array.isArray(body.batch) || typeof body.sentAt !== 'string') {
    return reply.code(400).send({ ok: false, error: 'invalid body' });
  }

  if (body.batch.length === 0) {
    return reply.send({ ok: true, count: 0 });
  }

  try {
    // Stamp received_at server-side so it reflects actual ingest time,
    // not the client-provided sentAt (which can be skewed or manipulated).
    const receivedAt = new Date().toISOString();
    const rows = body.batch.map((event) => toRow(event, receivedAt));
    await stageBatch(rows);
  } catch (err) {
    // 503 so the client retries — events stay safely in the SDK queue.
    console.error('[ingest] stageBatch failed:', err instanceof Error ? err.message : err);
    return reply.code(503).send({ ok: false, error: 'staging failed' });
  }

  // Log only the count — never the event contents.
  console.log(`[ingest] staged ${body.batch.length} event(s)`);

  // Fire-and-forget: check if we've crossed the row-count threshold.
  maybeFlushEarly().catch((err) =>
    console.error('[ingest] maybeFlushEarly error:', err instanceof Error ? err.message : err),
  );

  return reply.send({ ok: true, count: body.batch.length });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    await initDb();
    startFlusher();

    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[ingest] listening on port ${PORT}  →  POST ${INGEST_PATH}`);
  } catch (err) {
    console.error('[ingest] startup failed:', err);
    process.exit(1);
  }
}

start();
