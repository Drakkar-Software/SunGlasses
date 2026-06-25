import { flushToS3, stagingRowCount } from './duckdb.js';

const FLUSH_INTERVAL_MS = parseInt(process.env['FLUSH_INTERVAL_MS'] ?? '60000', 10);
const FLUSH_MAX_ROWS = parseInt(process.env['FLUSH_MAX_ROWS'] ?? '5000', 10);

let _timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic flush timer. Also installs SIGINT/SIGTERM handlers to
 * perform a final flush before the process exits.
 *
 * Call once after initDb() succeeds.
 */
export function startFlusher(): void {
  _timer = setInterval(async () => {
    await flushToS3();
  }, FLUSH_INTERVAL_MS);

  // Allow the Node event loop to exit even if the timer is still running.
  if (_timer.unref) _timer.unref();

  // Graceful shutdown: flush remaining staged events before exit.
  const shutdown = async (signal: string) => {
    console.log(`[ingest] ${signal} received — flushing staged events before exit…`);
    stopFlusher();
    await flushToS3();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Stop the periodic flush timer (e.g. during tests or controlled shutdown).
 */
export function stopFlusher(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/**
 * Called after each successful batch ingestion. Triggers an immediate flush
 * when the staging table has accumulated enough rows — prevents unbounded
 * memory use when there is a sudden spike of events.
 */
export async function maybeFlushEarly(): Promise<void> {
  const count = await stagingRowCount();
  if (count >= FLUSH_MAX_ROWS) {
    console.log(`[ingest] staging row count ${count} >= ${FLUSH_MAX_ROWS} — flushing early`);
    await flushToS3();
  }
}
