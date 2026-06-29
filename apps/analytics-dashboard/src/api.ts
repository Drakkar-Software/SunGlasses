// ── Date range ───────────────────────────────────────────────────────────────

export interface DateRangeParams {
  from?: string;
  to?: string;
  limit?: number;
  /** Filter events to a specific app (context.app.name). Undefined = all apps. */
  app?: string;
}

// ── Config types ─────────────────────────────────────────────────────────────

export type DataSourceKind = 'direct_s3' | 'starfish' | null;

export interface SyncStats {
  totalFiles: number;
  cacheBytes: number;
  lastSyncAt: string | null;
}

export interface S3ConfigInput {
  source?: 'direct_s3';
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpointUrl?: string;
  useIam?: boolean;
}

export interface StarfishConfigInput {
  source?: 'starfish';
  baseUrl?: string;
  app?: string;
  publicRead?: boolean;
  cap?: string;
  devEdPrivHex?: string;
  cacheDir?: string;
}

export type ConfigInput = S3ConfigInput | StarfishConfigInput;

const BROWSER_CONFIG_KEY = 'sunglasses-dashboard-browser-config';

export interface BrowserConfig {
  mode?: 'direct_s3' | 'starfish';
  remember?: boolean;
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpointUrl?: string;
  useIam?: boolean;
  baseUrl?: string;
  app?: string;
  publicRead?: boolean;
  capJson?: string;
  devEdPrivHex?: string;
}

export function loadBrowserConfig(): BrowserConfig | null {
  try {
    const raw = sessionStorage.getItem(BROWSER_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrowserConfig;
  } catch {
    return null;
  }
}

export function saveBrowserConfig(config: BrowserConfig): void {
  if (!config.remember) {
    const { secretAccessKey: _s, accessKeyId: _k, devEdPrivHex: _d, capJson: _c, ...rest } = config;
    sessionStorage.setItem(BROWSER_CONFIG_KEY, JSON.stringify({ ...rest, remember: false }));
    return;
  }
  sessionStorage.setItem(BROWSER_CONFIG_KEY, JSON.stringify(config));
}

export function canAutoConnectFromBrowser(): boolean {
  const c = loadBrowserConfig();
  if (!c?.remember) return false;
  if (c.mode === 'starfish') {
    if (c.publicRead) return Boolean(c.baseUrl && c.app);
    return Boolean(c.baseUrl && c.app && c.capJson && c.devEdPrivHex);
  }
  if (!c.s3Bucket) return false;
  if (c.useIam) return true;
  return Boolean(c.accessKeyId && c.secretAccessKey);
}

export interface ConfigStatus {
  ready: boolean;
  dataSource: DataSourceKind;
  source: string | null;
  bucket: string | null;
  prefix: string;
  region: string;
  endpointUrl: string | null;
  authMode: 'keys' | 'iam' | 'none';
  baseUrl: string | null;
  app: string | null;
  cacheDir: string | null;
  starfishPublicRead: boolean;
  sync: SyncStats | null;
  error: string | null;
}

// ── Row types ─────────────────────────────────────────────────────────────────

export interface AppInfo {
  app: string | null;
  events: number;
  last_seen: string | null;
}

export interface OverviewData {
  total_events:           number;
  unique_devices:         number;
  distinct_events:        number;
  latest_dt:              string | null;
  latest_dau:             number;
  total_errors:           number;
  error_affected_devices: number;
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
  screen_name: string | null;
  views: number;
  unique_devices: number;
}

export interface TopErrorRow {
  error_type: string | null;
  level: string | null;
  occurrences: number;
  affected_devices: number;
}

export interface ErrorGroupRow {
  error_type:       string | null;
  message:          string | null;
  level:            string | null;
  handled:          string | null;
  occurrences:      number;
  affected_devices: number;
  first_seen:       string | null;
  last_seen:        string | null;
}

export interface ErrorTimeseriesRow {
  error_type: string | null;
  message:    string | null;
  dt:         string;
  occurrences:number;
}

export interface ErrorSample {
  stack:            string | null;
  component_stack:  string | null;
  cause:            string | null;
  source:           string | null;
  fatal:            boolean | null;
}

export interface ErrorDetailData {
  timeseries:  { dt: string; occurrences: number }[];
  samples:     ErrorSample[];
  breakdowns:  {
    app_version:      string | null;
    platform:         string | null;
    occurrences:      number;
    affected_devices: number;
  }[];
}

export interface DauRow {
  dt: string;
  dau: number;
}

export interface RetentionRow {
  cohort_date:   string;
  cohort_size:   number;
  retained:      number;
  retention_pct: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const res  = await fetch(`/api${path}${qs(params)}`);
  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data as T;
}

function toParams(
  range: DateRangeParams & {
    day?: number;
    level?: string;
    handled?: boolean;
    error_type?: string;
    error_message?: string;
  },
): Record<string, string | number | boolean | undefined> {
  return {
    from:          range.from,
    to:            range.to,
    limit:         range.limit,
    app:           range.app,
    day:           range.day,
    level:         range.level,
    handled:       range.handled,
    error_type:    range.error_type,
    error_message: range.error_message,
  };
}

// ── Fetch functions ───────────────────────────────────────────────────────────

export function fetchApps(range: DateRangeParams) {
  return get<AppInfo[]>('/apps', toParams(range));
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

/** @deprecated Use fetchErrorGroups for the errors section */
export function fetchTopErrors(range: DateRangeParams) {
  return get<TopErrorRow[]>('/errors/top', { ...toParams(range), limit: range.limit ?? 20 });
}

export function fetchErrorGroups(
  range: DateRangeParams & { level?: string; handled?: boolean },
) {
  return get<ErrorGroupRow[]>('/errors', toParams(range));
}

export function fetchErrorTimeseries(range: DateRangeParams) {
  return get<ErrorTimeseriesRow[]>('/errors/timeseries', toParams(range));
}

export function fetchErrorDetail(
  range: DateRangeParams & { error_type?: string; error_message?: string },
) {
  return get<ErrorDetailData>('/errors/detail', toParams(range));
}

export function fetchDau(range: DateRangeParams) {
  return get<DauRow[]>('/dau', { ...toParams(range), limit: range.limit ?? 30 });
}

export function fetchRetention(range: DateRangeParams & { day?: number }) {
  return get<RetentionRow[]>('/retention', { ...toParams(range), limit: range.limit ?? 30 });
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const res  = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Query failed (${res.status})`);
  return { columns: body.columns as string[], rows: body.rows as Record<string, unknown>[] };
}

// ── Config helpers ────────────────────────────────────────────────────────────

function parseConfigStatus(body: Record<string, unknown>): ConfigStatus {
  return {
    ready:              Boolean(body.ready),
    dataSource:         (body.dataSource as DataSourceKind) ?? null,
    source:             (body.source as string | null) ?? null,
    bucket:             (body.bucket as string | null) ?? null,
    prefix:             (body.prefix as string) ?? 'events',
    region:             (body.region as string) ?? 'us-east-1',
    endpointUrl:        (body.endpointUrl as string | null) ?? null,
    authMode:           (body.authMode as ConfigStatus['authMode']) ?? 'none',
    baseUrl:            (body.baseUrl as string | null) ?? null,
    app:                (body.app as string | null) ?? null,
    cacheDir:           (body.cacheDir as string | null) ?? null,
    starfishPublicRead: Boolean(body.starfishPublicRead),
    sync:               (body.sync as SyncStats | null) ?? null,
    error:              (body.error as string | null) ?? null,
  };
}

export async function fetchConfigStatus(): Promise<ConfigStatus> {
  const res  = await fetch('/api/config/status');
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Config status failed (${res.status})`);
  return parseConfigStatus(body);
}

export async function saveConfig(input: ConfigInput): Promise<ConfigStatus> {
  const res  = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Configuration failed (${res.status})`);
  return parseConfigStatus(body);
}

export async function clearConfig(): Promise<void> {
  await fetch('/api/config', { method: 'DELETE' });
}

export async function triggerSync(): Promise<ConfigStatus> {
  const res  = await fetch('/api/sync', { method: 'POST' });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Sync failed (${res.status})`);
  return parseConfigStatus(body);
}

// ── Date utils ────────────────────────────────────────────────────────────────

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return formatDate(d);
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const day = Math.floor(h / 24);
  return `${day}d ago`;
}

// ── Deprecated aliases ────────────────────────────────────────────────────────
/** @deprecated */ export const saveS3Config        = saveConfig;
/** @deprecated */ export const clearS3Config       = clearConfig;
/** @deprecated */ export const loadBrowserS3Config = loadBrowserConfig;
/** @deprecated */ export const saveBrowserS3Config = saveBrowserConfig;
/** @deprecated */ export type S3ConfigStatus = ConfigStatus;
