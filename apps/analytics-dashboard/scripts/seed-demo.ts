/**
 * seed-demo.ts
 * Generates demo Parquet fixtures under .parquet-cache/demo/ so you can
 * explore the dashboard's App Filter and Errors features without real data.
 *
 * Usage:
 *   pnpm --filter analytics-dashboard seed:demo
 *
 * Then connect the dashboard to the demo cache:
 *   Data source → Starfish → Sync base URL: (leave blank, use Direct S3 below)
 *   — OR —
 *   Data source → Direct S3 → custom endpoint doesn't matter; just point the
 *   server at the local cache dir by setting in the server config.
 *
 * Easier: after running this script, start the server with
 *   PARQUET_DIR=.parquet-cache/demo pnpm dev:server
 * and connect the web app to http://localhost:8788 using any dummy S3 config
 * (the local DuckDB macro will read from PARQUET_DIR automatically if the
 * env var is supported by your queries.ts version).
 */

import path from 'node:path';
import fs from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';

const OUT_DIR = path.resolve(process.cwd(), '.parquet-cache/demo');

const APPS = ['octochat-mobile', 'octochat-web'] as const;
const PLATFORMS = ['ios', 'android', 'web'] as const;
const APP_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'] as const;

const ERROR_TYPES = [
  { type: 'TypeError', msg: "Cannot read properties of undefined (reading 'id')", stack: `TypeError: Cannot read properties of undefined (reading 'id')\n  at MessageList.render (MessageList.tsx:42)\n  at React.renderWithHooks\n  at React.updateFunctionComponent` },
  { type: 'NetworkError', msg: 'Failed to fetch: net::ERR_CONNECTION_RESET', stack: null },
  { type: 'RangeError', msg: 'Maximum call stack size exceeded', stack: `RangeError: Maximum call stack size exceeded\n  at deepClone (utils.ts:18)\n  at deepClone (utils.ts:18)\n  at deepClone (utils.ts:18)` },
  { type: 'AuthError', msg: 'JWT token expired or invalid', stack: null },
] as const;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function rndInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dateStr(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

interface EventRow {
  event_type: string;
  event: string;
  distinct_id: string;
  anonymous_id: string;
  ts: string;
  message_id: string;
  properties: string;
  context: string;
  dt: string;
}

function buildContext(app: string, version: string, platform: string): string {
  return JSON.stringify({
    app: { name: app, version, build: '100' },
    platform,
    os: { name: platform === 'web' ? 'Chrome' : platform },
  });
}

function buildRows(): EventRow[] {
  const rows: EventRow[] = [];
  const devices: Record<string, string[]> = {};

  // Seed deterministic device pools per app
  for (const app of APPS) {
    const count = app === 'octochat-mobile' ? 30 : 15;
    devices[app] = Array.from({ length: count }, () => uuid());
  }

  // 60 days of events
  for (let d = 60; d >= 0; d--) {
    const dt = dateStr(d);

    for (const app of APPS) {
      const devicePool = devices[app];
      const dailyDevices = devicePool.slice(0, rndInt(5, devicePool.length));

      for (const anonId of dailyDevices) {
        const version  = pick(APP_VERSIONS);
        const platform = app === 'octochat-web' ? 'web' : pick(['ios', 'android'] as const);
        const ctx      = buildContext(app, version, platform);

        // 3–8 normal events per device per day
        const normalCount = rndInt(3, 8);
        for (let i = 0; i < normalCount; i++) {
          const event = pick([
            'app_open', 'message_sent', 'chat_opened', 'profile_viewed',
            'settings_opened', 'notification_received', '$screen',
          ]);
          rows.push({
            event_type:  event === '$screen' ? 'screen' : 'track',
            event,
            distinct_id: `user_${anonId.slice(0, 8)}`,  // never displayed
            anonymous_id: anonId,
            ts:          `${dt}T${String(rndInt(8, 22)).padStart(2, '0')}:${String(rndInt(0, 59)).padStart(2, '0')}:00Z`,
            message_id:  uuid(),
            properties:  JSON.stringify(
              event === '$screen'
                ? { $screen_name: pick(['/home', '/chat', '/profile', '/settings']) }
                : {},
            ),
            context: ctx,
            dt,
          });
        }

        // ~20% chance of an error event
        if (Math.random() < 0.2) {
          const err     = pick(ERROR_TYPES);
          const handled = Math.random() > 0.4;
          const level   = handled ? pick(['warning', 'error']) : 'error';
          rows.push({
            event_type:  'track',
            event:       '$error',
            distinct_id: `user_${anonId.slice(0, 8)}`,
            anonymous_id: anonId,
            ts:           `${dt}T${String(rndInt(0, 23)).padStart(2, '0')}:${String(rndInt(0, 59)).padStart(2, '0')}:00Z`,
            message_id:   uuid(),
            properties: JSON.stringify({
              $error_type:    err.type,
              $error_message: err.msg,
              $error_handled: String(handled),
              $error_level:   level,
              ...(err.stack != null ? { $error_stack: err.stack } : {}),
            }),
            context: ctx,
            dt,
          });
        }
      }
    }
  }

  return rows;
}

async function main() {
  console.log('Generating demo Parquet data…');
  const rows = buildRows();
  console.log(`  Generated ${rows.length} rows across ${APPS.join(', ')}`);

  // Write one Parquet file per dt partition
  const byDt = new Map<string, EventRow[]>();
  for (const row of rows) {
    if (!byDt.has(row.dt)) byDt.set(row.dt, []);
    byDt.get(row.dt)!.push(row);
  }

  const db   = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  // Register arrow schema via a CREATE TABLE
  await conn.run(`
    CREATE TABLE staging (
      event_type   VARCHAR,
      event        VARCHAR,
      distinct_id  VARCHAR,
      anonymous_id VARCHAR,
      ts           VARCHAR,
      message_id   VARCHAR,
      properties   VARCHAR,
      context      VARCHAR,
      dt           VARCHAR
    )
  `);

  let totalFiles = 0;
  for (const [dt, dtRows] of [...byDt.entries()].sort()) {
    const dir  = path.join(OUT_DIR, `dt=${dt}`);
    const file = path.join(dir, 'part-0000.parquet');
    fs.mkdirSync(dir, { recursive: true });

    // Bulk-insert via VALUES
    await conn.run('DELETE FROM staging');
    const appender = await conn.createAppender('main', 'staging');
    for (const r of dtRows) {
      appender.appendVarchar(r.event_type);
      appender.appendVarchar(r.event);
      appender.appendVarchar(r.distinct_id);
      appender.appendVarchar(r.anonymous_id);
      appender.appendVarchar(r.ts);
      appender.appendVarchar(r.message_id);
      appender.appendVarchar(r.properties);
      appender.appendVarchar(r.context);
      appender.appendVarchar(r.dt);
      appender.endRow();
    }
    await appender.close();

    await conn.run(`COPY staging TO '${file}' (FORMAT parquet, COMPRESSION zstd)`);
    totalFiles++;
    process.stdout.write(`  ${dt}: ${dtRows.length} rows → ${path.relative(process.cwd(), file)}\r`);
  }

  await conn.close();
  await db.close();

  console.log(`\nDone! ${totalFiles} partition files written to ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log('\nTo use: connect the dashboard in Starfish mode and set the cache dir to:');
  console.log(`  ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log('Or start the dev server with:\n  STARFISH_CACHE_DIR=.parquet-cache/demo pnpm dev:server');
}

main().catch((err) => {
  console.error('seed:demo failed:', err);
  process.exit(1);
});
