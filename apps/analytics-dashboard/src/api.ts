export interface DateRangeParams {
  from?: string;
  to?: string;
  limit?: number;
}

export interface S3ConfigInput {
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpointUrl?: string;
  useIam?: boolean;
}

export interface S3ConfigStatus {
  ready: boolean;
  source: string | null;
  bucket: string | null;
  prefix: string;
  region: string;
  endpointUrl: string | null;
  authMode: 'keys' | 'iam' | 'none';
  error: string | null;
}

export interface OverviewData {
  total_events: number;
  unique_devices: number;
  distinct_events: number;
  latest_dt: string | null;
  latest_dau: number;
}

export interface TimeseriesRow {
  dt: string;
  events: number;
  unique_devices: number;
}

export interface TopEventRow {
  event: string;
  event_type: string;
  total: number;
  unique_devices: number;
}

export interface TopScreenRow {
  path: string | null;
  views: number;
  unique_devices: number;
}

export interface TopErrorRow {
  error_type: string | null;
  level: string | null;
  occurrences: number;
  affected_devices: number;
}

export interface DauRow {
  dt: string;
  dau: number;
}

export interface RetentionRow {
  cohort_date: string;
  cohort_size: number;
  retained: number;
  retention_pct: number;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const res = await fetch(`/api${path}${qs(params)}`);
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

function toParams(range: DateRangeParams & { day?: number }): Record<string, string | number | undefined> {
  return { from: range.from, to: range.to, limit: range.limit, day: range.day };
}

export function fetchOverview(range: DateRangeParams) {
  return get<OverviewData>('/overview', toParams(range));
}

export function fetchTimeseries(range: DateRangeParams) {
  return get<TimeseriesRow[]>('/timeseries', toParams(range));
}

export function fetchTopEvents(range: DateRangeParams) {
  return get<TopEventRow[]>('/events/top', { ...toParams(range), limit: range.limit ?? 20 });
}

export function fetchTopScreens(range: DateRangeParams) {
  return get<TopScreenRow[]>('/screens/top', { ...toParams(range), limit: range.limit ?? 20 });
}

export function fetchTopErrors(range: DateRangeParams) {
  return get<TopErrorRow[]>('/errors/top', { ...toParams(range), limit: range.limit ?? 20 });
}

export function fetchDau(range: DateRangeParams) {
  return get<DauRow[]>('/dau', { ...toParams(range), limit: range.limit ?? 30 });
}

export function fetchRetention(range: DateRangeParams & { day?: number }) {
  return get<RetentionRow[]>('/retention', {
    ...toParams(range),
    limit: range.limit ?? 30,
    day: range.day ?? 7,
  });
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Query failed (${res.status})`);
  }
  return { columns: body.columns as string[], rows: body.rows as Record<string, unknown>[] };
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return formatDate(d);
}

export async function fetchConfigStatus(): Promise<S3ConfigStatus> {
  const res = await fetch('/api/config/status');
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `Config status failed (${res.status})`);
  }
  return {
    ready: Boolean(body.ready),
    source: body.source ?? null,
    bucket: body.bucket ?? null,
    prefix: body.prefix ?? 'events',
    region: body.region ?? 'us-east-1',
    endpointUrl: body.endpointUrl ?? null,
    authMode: body.authMode ?? 'none',
    error: body.error ?? null,
  };
}

export async function saveS3Config(input: S3ConfigInput): Promise<S3ConfigStatus> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `S3 configuration failed (${res.status})`);
  }
  return {
    ready: Boolean(body.ready),
    source: body.source ?? null,
    bucket: body.bucket ?? null,
    prefix: body.prefix ?? 'events',
    region: body.region ?? 'us-east-1',
    endpointUrl: body.endpointUrl ?? null,
    authMode: body.authMode ?? 'none',
    error: body.error ?? null,
  };
}
