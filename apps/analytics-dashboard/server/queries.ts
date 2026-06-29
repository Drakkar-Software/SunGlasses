import { query } from './duckdb.js';

// ---------------------------------------------------------------------------
// Shared filter types
// ---------------------------------------------------------------------------

export interface DateRange {
  from?: string;
  to?: string;
}

export interface FilterParams extends DateRange {
  /** Filter by context.app.name. Pass the sentinel "(unknown)" for null rows. */
  app?: string;
  /** Force a specific event name (added to WHERE). */
  event?: string;
  /** Error-level filter, e.g. "error" or "warning". */
  level?: string;
  /** Error handled filter. */
  handled?: boolean;
  /** For error detail: filter to a specific error_type. */
  errorType?: string;
  /** For error detail: filter to a specific error_message. */
  errorMessage?: string;
  limit?: number;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  const n = limit ?? fallback;
  return Math.min(Math.max(1, Math.floor(n)), 500);
}

/**
 * Build a WHERE clause from filter params.
 * All constraints are ANDed together.
 */
function buildFilters(
  p: FilterParams,
  extra: string[] = [],
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];

  if (p.from) { parts.push('dt >= ?'); params.push(p.from); }
  if (p.to)   { parts.push('dt <= ?'); params.push(p.to); }

  if (p.app !== undefined) {
    if (p.app === '(unknown)' || p.app === '') {
      parts.push("json_extract_string(context, '$.app.name') IS NULL");
    } else {
      parts.push("json_extract_string(context, '$.app.name') = ?");
      params.push(p.app);
    }
  }

  if (p.event !== undefined) {
    parts.push('event = ?');
    params.push(p.event);
  }

  if (p.level !== undefined) {
    parts.push("json_extract_string(properties, '$.$error_level') = ?");
    params.push(p.level);
  }

  if (p.handled !== undefined) {
    parts.push(
      `json_extract_string(properties, '$.$error_handled') = '${p.handled ? 'true' : 'false'}'`,
    );
  }

  if (p.errorType !== undefined) {
    parts.push("json_extract_string(properties, '$.$error_type') = ?");
    params.push(p.errorType);
  }

  if (p.errorMessage !== undefined) {
    parts.push("json_extract_string(properties, '$.$error_message') = ?");
    params.push(p.errorMessage);
  }

  parts.push(...extra);

  const clause = parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  return { clause, params };
}

// ---------------------------------------------------------------------------
// Apps list
// ---------------------------------------------------------------------------

export interface AppRow {
  app: string | null;
  events: number;
  last_seen: string | null;
}

export async function getApps(range: DateRange): Promise<AppRow[]> {
  const { clause, params } = buildFilters(range);
  const rows = await query(
    `
    SELECT
      json_extract_string(context, '$.app.name') AS app,
      count(*)  AS events,
      max(dt)::VARCHAR AS last_seen
    FROM events()
    ${clause}
    GROUP BY app
    ORDER BY events DESC
    LIMIT 50
    `,
    params,
  );
  return rows.map((r) => ({
    app: r['app'] != null ? String(r['app']) : null,
    events: Number(r['events'] ?? 0),
    last_seen: r['last_seen'] != null ? String(r['last_seen']) : null,
  }));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewResult {
  total_events: number;
  unique_devices: number;
  distinct_events: number;
  latest_dt: string | null;
  latest_dau: number;
  total_errors: number;
  error_affected_devices: number;
}

export async function getOverview(filter: FilterParams): Promise<OverviewResult> {
  const { clause, params } = buildFilters(filter);
  const rows = await query(
    `
    SELECT
      count(*)                                                        AS total_events,
      count(DISTINCT anonymous_id)                                    AS unique_devices,
      count(DISTINCT event)                                           AS distinct_events,
      max(dt)::VARCHAR                                                AS latest_dt,
      count(*)       FILTER (WHERE event = '$error')                  AS total_errors,
      count(DISTINCT anonymous_id) FILTER (WHERE event = '$error')    AS error_affected_devices
    FROM events()
    ${clause}
    `,
    params,
  );

  const base = rows[0] ?? {};
  const latestDt = (base['latest_dt'] as string | null) ?? null;

  let latestDau = 0;
  if (latestDt) {
    const { params: dauParams } = buildFilters(filter);
    const dauRows = await query(
      `
      SELECT count(DISTINCT anonymous_id) AS dau
      FROM events()
      WHERE dt = ?
      ${filter.app !== undefined ? "AND json_extract_string(context, '$.app.name') = ?" : ''}
      `,
      filter.app !== undefined ? [latestDt, filter.app] : [latestDt],
    );
    latestDau = Number(dauRows[0]?.['dau'] ?? 0);
  }

  return {
    total_events:           Number(base['total_events'] ?? 0),
    unique_devices:         Number(base['unique_devices'] ?? 0),
    distinct_events:        Number(base['distinct_events'] ?? 0),
    latest_dt:              latestDt,
    latest_dau:             latestDau,
    total_errors:           Number(base['total_errors'] ?? 0),
    error_affected_devices: Number(base['error_affected_devices'] ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Timeseries
// ---------------------------------------------------------------------------

export interface TimeseriesRow {
  dt: string;
  events: number;
  unique_devices: number;
}

export async function getTimeseries(filter: FilterParams): Promise<TimeseriesRow[]> {
  const { clause, params } = buildFilters(filter);
  const rows = await query(
    `
    SELECT
      dt,
      count(*)                     AS events,
      count(DISTINCT anonymous_id) AS unique_devices
    FROM events()
    ${clause}
    GROUP BY dt
    ORDER BY dt ASC
    `,
    params,
  );
  return rows.map((r) => ({
    dt:             String(r['dt'] ?? ''),
    events:         Number(r['events'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Top events
// ---------------------------------------------------------------------------

export interface TopEventRow {
  event: string;
  event_type: string;
  total: number;
  unique_devices: number;
}

export async function getTopEvents(filter: FilterParams): Promise<TopEventRow[]> {
  const limit = clampLimit(filter.limit, 20);
  const { clause, params } = buildFilters(filter);
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
    event:          String(r['event'] ?? ''),
    event_type:     String(r['event_type'] ?? ''),
    total:          Number(r['total'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Top screens
// ---------------------------------------------------------------------------

export interface TopScreenRow {
  screen_name: string | null;
  views: number;
  unique_devices: number;
}

export async function getTopScreens(filter: FilterParams): Promise<TopScreenRow[]> {
  const limit = clampLimit(filter.limit, 20);
  const { clause, params } = buildFilters({ ...filter, event: '$screen' });
  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$screen_name') AS screen_name,
      count(*)                                           AS views,
      count(DISTINCT anonymous_id)                       AS unique_devices
    FROM events()
    ${clause}
    GROUP BY screen_name
    ORDER BY views DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => ({
    screen_name:    r['screen_name'] != null ? String(r['screen_name']) : null,
    views:          Number(r['views'] ?? 0),
    unique_devices: Number(r['unique_devices'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Top errors (legacy — kept for backwards compat with /api/errors/top)
// ---------------------------------------------------------------------------

export interface TopErrorRow {
  error_type: string | null;
  level: string | null;
  occurrences: number;
  affected_devices: number;
}

export async function getTopErrors(filter: FilterParams): Promise<TopErrorRow[]> {
  const limit = clampLimit(filter.limit, 20);
  const { clause, params } = buildFilters({ ...filter, event: '$error' });
  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$error_type')  AS error_type,
      json_extract_string(properties, '$.$error_level') AS level,
      count(*)                                           AS occurrences,
      count(DISTINCT anonymous_id)                       AS affected_devices
    FROM events()
    ${clause}
    GROUP BY error_type, level
    ORDER BY occurrences DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => ({
    error_type:      r['error_type'] != null ? String(r['error_type']) : null,
    level:           r['level']      != null ? String(r['level'])      : null,
    occurrences:     Number(r['occurrences'] ?? 0),
    affected_devices:Number(r['affected_devices'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Error groups (new — replaces top errors for the Errors section)
// ---------------------------------------------------------------------------

export interface ErrorGroupRow {
  error_type:       string | null;
  message:          string | null;
  level:            string | null;
  handled:          string | null; // 'true' | 'false' as string
  occurrences:      number;
  affected_devices: number;
  first_seen:       string | null;
  last_seen:        string | null;
}

export async function getErrorGroups(filter: FilterParams): Promise<ErrorGroupRow[]> {
  const limit = clampLimit(filter.limit, 50);
  const { clause, params } = buildFilters({ ...filter, event: '$error' });
  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$error_type')    AS error_type,
      json_extract_string(properties, '$.$error_message') AS message,
      json_extract_string(properties, '$.$error_level')   AS level,
      json_extract_string(properties, '$.$error_handled') AS handled,
      count(*)                                             AS occurrences,
      count(DISTINCT anonymous_id)                         AS affected_devices,
      min(ts)::VARCHAR                                     AS first_seen,
      max(ts)::VARCHAR                                     AS last_seen
    FROM events()
    ${clause}
    GROUP BY error_type, message, level, handled
    ORDER BY occurrences DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows.map((r) => ({
    error_type:       r['error_type'] != null ? String(r['error_type']) : null,
    message:          r['message']    != null ? String(r['message'])    : null,
    level:            r['level']      != null ? String(r['level'])      : null,
    handled:          r['handled']    != null ? String(r['handled'])    : null,
    occurrences:      Number(r['occurrences'] ?? 0),
    affected_devices: Number(r['affected_devices'] ?? 0),
    first_seen:       r['first_seen'] != null ? String(r['first_seen']) : null,
    last_seen:        r['last_seen']  != null ? String(r['last_seen'])  : null,
  }));
}

// ---------------------------------------------------------------------------
// Error timeseries (for sparklines in the group list)
// ---------------------------------------------------------------------------

export interface ErrorTimeseriesRow {
  error_type: string | null;
  message:    string | null;
  dt:         string;
  occurrences:number;
}

export async function getErrorTimeseries(filter: FilterParams): Promise<ErrorTimeseriesRow[]> {
  const { clause, params } = buildFilters({ ...filter, event: '$error' });
  const rows = await query(
    `
    SELECT
      json_extract_string(properties, '$.$error_type')    AS error_type,
      json_extract_string(properties, '$.$error_message') AS message,
      dt,
      count(*) AS occurrences
    FROM events()
    ${clause}
    GROUP BY error_type, message, dt
    ORDER BY error_type, message, dt
    `,
    params,
  );
  return rows.map((r) => ({
    error_type:  r['error_type'] != null ? String(r['error_type']) : null,
    message:     r['message']    != null ? String(r['message'])    : null,
    dt:          String(r['dt'] ?? ''),
    occurrences: Number(r['occurrences'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Error detail
// ---------------------------------------------------------------------------

export interface ErrorDetailResult {
  timeseries:  { dt: string; occurrences: number }[];
  stacks:      string[];
  breakdowns:  {
    app_version:     string | null;
    platform:        string | null;
    occurrences:     number;
    affected_devices:number;
  }[];
}

export async function getErrorDetail(filter: FilterParams): Promise<ErrorDetailResult> {
  const { clause: c1, params: p1 } = buildFilters({ ...filter, event: '$error' });
  const { clause: c2, params: p2 } = buildFilters({ ...filter, event: '$error' });
  const { clause: c3, params: p3 } = buildFilters({ ...filter, event: '$error' });

  const [tsRows, stackRows, breakRows] = await Promise.all([
    query(
      `
      SELECT dt, count(*) AS occurrences
      FROM events()
      ${c1}
      GROUP BY dt
      ORDER BY dt
      `,
      p1,
    ),
    query(
      `
      SELECT DISTINCT json_extract_string(properties, '$.$error_stack') AS stack
      FROM events()
      ${c2}
      AND json_extract_string(properties, '$.$error_stack') IS NOT NULL
      LIMIT 3
      `,
      p2,
    ),
    query(
      `
      SELECT
        json_extract_string(context, '$.app.version') AS app_version,
        json_extract_string(context, '$.platform')    AS platform,
        count(*)                                       AS occurrences,
        count(DISTINCT anonymous_id)                   AS affected_devices
      FROM events()
      ${c3}
      GROUP BY app_version, platform
      ORDER BY occurrences DESC
      LIMIT 10
      `,
      p3,
    ),
  ]);

  return {
    timeseries: tsRows.map((r) => ({
      dt:          String(r['dt'] ?? ''),
      occurrences: Number(r['occurrences'] ?? 0),
    })),
    stacks: stackRows
      .map((r) => (r['stack'] != null ? String(r['stack']) : ''))
      .filter(Boolean),
    breakdowns: breakRows.map((r) => ({
      app_version:      r['app_version'] != null ? String(r['app_version']) : null,
      platform:         r['platform']    != null ? String(r['platform'])    : null,
      occurrences:      Number(r['occurrences'] ?? 0),
      affected_devices: Number(r['affected_devices'] ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// DAU
// ---------------------------------------------------------------------------

export interface DauRow {
  dt: string;
  dau: number;
}

export async function getDau(filter: FilterParams): Promise<DauRow[]> {
  const limit = clampLimit(filter.limit, 30);
  const { clause, params } = buildFilters(filter);
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
    dt:  String(r['dt'] ?? ''),
    dau: Number(r['dau'] ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface RetentionRow {
  cohort_date:   string;
  cohort_size:   number;
  retained:      number;
  retention_pct: number;
}

export async function getRetention(
  filter: FilterParams & { day?: number },
): Promise<RetentionRow[]> {
  const limit  = clampLimit(filter.limit, 30);
  const dayN   = Math.min(Math.max(1, Math.floor(filter.day ?? 7)), 90);
  const { clause, params } = buildFilters(filter);

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
      round(
        100.0 * count(d.anonymous_id) / nullif(count(f.anonymous_id), 0),
        1
      ) AS retention_pct
    FROM first_seen f
    LEFT JOIN day_n d ON f.anonymous_id = d.anonymous_id
    GROUP BY f.first_dt
    ORDER BY f.first_dt DESC
    LIMIT ?
    `,
    [...params, dayN, limit],
  );

  return rows.map((r) => ({
    cohort_date:   String(r['cohort_date'] ?? ''),
    cohort_size:   Number(r['cohort_size'] ?? 0),
    retained:      Number(r['retained'] ?? 0),
    retention_pct: Number(r['retention_pct'] ?? 0),
  }));
}
