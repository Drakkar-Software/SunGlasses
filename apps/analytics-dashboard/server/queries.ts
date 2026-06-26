import { query } from './duckdb.js';

// ---------------------------------------------------------------------------
// Shared filter types
// ---------------------------------------------------------------------------

export interface DateRange {
  /** Inclusive YYYY-MM-DD lower bound on `dt` */
  from?: string;
  /** Inclusive YYYY-MM-DD upper bound on `dt` */
  to?: string;
}

export interface LimitRange extends DateRange {
  limit?: number;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  const n = limit ?? fallback;
  return Math.min(Math.max(1, Math.floor(n)), 500);
}

/** WHERE clause fragment + bound params for optional dt range */
function dtFilter(range: DateRange): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (range.from) {
    parts.push('dt >= ?');
    params.push(range.from);
  }
  if (range.to) {
    parts.push('dt <= ?');
    params.push(range.to);
  }
  const clause = parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  return { clause, params };
}

// ---------------------------------------------------------------------------
// Aggregations (adapted from ingest-server/queries/02-explore.sql)
// ---------------------------------------------------------------------------

export interface OverviewResult {
  total_events: number;
  unique_devices: number;
  distinct_events: number;
  latest_dt: string | null;
  latest_dau: number;
}

export async function getOverview(range: DateRange): Promise<OverviewResult> {
  const { clause, params } = dtFilter(range);
  const rows = await query(
    `
    SELECT
      count(*)                     AS total_events,
      count(DISTINCT anonymous_id) AS unique_devices,
      count(DISTINCT event)        AS distinct_events,
      max(dt)::VARCHAR             AS latest_dt
    FROM events()
    ${clause}
    `,
    params,
  );
  const base = rows[0] ?? {};
  const latestDt = (base['latest_dt'] as string | null) ?? null;

  let latestDau = 0;
  if (latestDt) {
    const dauRows = await query(
      `
      SELECT count(DISTINCT anonymous_id) AS dau
      FROM events()
      WHERE dt = ?
      `,
      [latestDt],
    );
    latestDau = Number(dauRows[0]?.['dau'] ?? 0);
  }

  return {
    total_events: Number(base['total_events'] ?? 0),
    unique_devices: Number(base['unique_devices'] ?? 0),
    distinct_events: Number(base['distinct_events'] ?? 0),
    latest_dt: latestDt,
    latest_dau: latestDau,
  };
}

export interface TimeseriesRow {
  dt: string;
  events: number;
  unique_devices: number;
}

export async function getTimeseries(
  range: DateRange & { event?: string },
): Promise<TimeseriesRow[]> {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (range.from) {
    parts.push('dt >= ?');
    params.push(range.from);
  }
  if (range.to) {
    parts.push('dt <= ?');
    params.push(range.to);
  }
  if (range.event) {
    parts.push('event = ?');
    params.push(range.event);
  }
  const where = parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';

  const rows = await query(
    `
    SELECT
      dt,
      count(*)                     AS events,
      count(DISTINCT anonymous_id) AS unique_devices
    FROM events()
    ${where}
    GROUP BY dt
    ORDER BY dt ASC
    `,
    params,
  );

  return rows.map((r) => ({
    dt: String(r['dt'] ?? ''),
    events: Number(r['events'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

export interface TopEventRow {
  event: string;
  event_type: string;
  total: number;
  unique_devices: number;
}

export async function getTopEvents(range: LimitRange): Promise<TopEventRow[]> {
  const limit = clampLimit(range.limit, 20);
  const { clause, params } = dtFilter(range);
  const rows = await query(
    `
    SELECT
      event,
      event_type,
      count(*)                     AS total,
      count(DISTINCT anonymous_id) AS unique_devices
    FROM events()
    ${clause}
    GROUP BY event, event_type
    ORDER BY total DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => ({
    event: String(r['event'] ?? ''),
    event_type: String(r['event_type'] ?? ''),
    total: Number(r['total'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

export interface TopScreenRow {
  path: string | null;
  views: number;
  unique_devices: number;
}

export async function getTopScreens(range: LimitRange): Promise<TopScreenRow[]> {
  const limit = clampLimit(range.limit, 20);
  const { clause: dtClause, params: dtParams } = dtFilter(range);
  const where =
    dtClause.length > 0
      ? `${dtClause} AND event = '$screen'`
      : `WHERE event = '$screen'`;

  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$$path') AS path,
      count(*)                                     AS views,
      count(DISTINCT anonymous_id)                 AS unique_devices
    FROM events()
    ${where}
    GROUP BY path
    ORDER BY views DESC
    LIMIT ?
    `,
    [...dtParams, limit],
  );
  return rows.map((r) => ({
    path: r['path'] != null ? String(r['path']) : null,
    views: Number(r['views'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

export interface TopErrorRow {
  error_type: string | null;
  level: string | null;
  occurrences: number;
  affected_devices: number;
}

export async function getTopErrors(range: LimitRange): Promise<TopErrorRow[]> {
  const limit = clampLimit(range.limit, 20);
  const { clause: dtClause, params: dtParams } = dtFilter(range);
  const where =
    dtClause.length > 0
      ? `${dtClause} AND event = '$error'`
      : `WHERE event = '$error'`;

  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$error_type')  AS error_type,
      json_extract_string(properties, '$.$error_level') AS level,
      count(*)                                           AS occurrences,
      count(DISTINCT anonymous_id)                       AS affected_devices
    FROM events()
    ${where}
    GROUP BY error_type, level
    ORDER BY occurrences DESC
    LIMIT ?
    `,
    [...dtParams, limit],
  );
  return rows.map((r) => ({
    error_type: r['error_type'] != null ? String(r['error_type']) : null,
    level: r['level'] != null ? String(r['level']) : null,
    occurrences: Number(r['occurrences'] ?? 0),
    affected_devices: Number(r['affected_devices'] ?? 0),
  }));
}

export interface DauRow {
  dt: string;
  dau: number;
}

export async function getDau(range: LimitRange): Promise<DauRow[]> {
  const limit = clampLimit(range.limit, 30);
  const { clause, params } = dtFilter(range);
  const rows = await query(
    `
    SELECT
      dt,
      count(DISTINCT anonymous_id) AS dau
    FROM events()
    ${clause}
    GROUP BY dt
    ORDER BY dt DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => ({
    dt: String(r['dt'] ?? ''),
    dau: Number(r['dau'] ?? 0),
  }));
}

export interface RetentionRow {
  cohort_date: string;
  cohort_size: number;
  retained: number;
  retention_pct: number;
}

export async function getRetention(
  range: LimitRange & { day?: number },
): Promise<RetentionRow[]> {
  const limit = clampLimit(range.limit, 30);
  const dayN = Math.min(Math.max(1, Math.floor(range.day ?? 7)), 90);
  const { clause, params } = dtFilter(range);

  const rows = await query(
    `
    WITH filtered AS (
      SELECT * FROM events()
      ${clause}
    ),
    first_seen AS (
      SELECT anonymous_id, min(dt) AS first_dt
      FROM filtered
      GROUP BY anonymous_id
    ),
    day_n AS (
      SELECT DISTINCT e.anonymous_id
      FROM filtered e
      JOIN first_seen f ON e.anonymous_id = f.anonymous_id
      WHERE DATEDIFF('day', f.first_dt::DATE, e.dt::DATE) = ?
    )
    SELECT
      f.first_dt            AS cohort_date,
      count(f.anonymous_id) AS cohort_size,
      count(d.anonymous_id) AS retained,
      round(100.0 * count(d.anonymous_id) / nullif(count(f.anonymous_id), 0), 1) AS retention_pct
    FROM first_seen f
    LEFT JOIN day_n d ON f.anonymous_id = d.anonymous_id
    GROUP BY f.first_dt
    ORDER BY f.first_dt DESC
    LIMIT ?
    `,
    [...params, dayN, limit],
  );

  return rows.map((r) => ({
    cohort_date: String(r['cohort_date'] ?? ''),
    cohort_size: Number(r['cohort_size'] ?? 0),
    retained: Number(r['retained'] ?? 0),
    retention_pct: Number(r['retention_pct'] ?? 0),
  }));
}
