/**
 * Public API layer — same exported signatures as before.
 * Bodies now call engine/* directly (no /api/* HTTP calls).
 */
import {
  configureDirectS3,
  configureStarfish,
  prepareStarfishFromCache,
  resyncStarfish,
  resetDb,
  isDbReady,
  getDataSource,
  getS3Config,
  getStarfishConfig,
  getSyncStats,
  queryRaw,
  addStarfishApp as engineAddStarfishApp,
  removeStarfishApp as engineRemoveStarfishApp,
} from './engine/duckdb.js';
import type { ProgressFn } from './engine/duckdb.js';
import { computeSyncStats } from './engine/starfish-sync.js';
import { syncStatus } from './engine/sync-status.js';

export type { ProgressFn };
import type { DataSourceKind, ConfigStatus, SyncStats, S3Config, StarfishConfig } from './engine/config.js';
import {
  parseS3Input,
  parseStarfishInput,
  statusForS3,
  statusForStarfish,
} from './engine/config.js';
import {
  getApps,
  getOverview,
  getTimeseries,
  getTopEvents,
  getTopScreens,
  getTopErrors,
  getErrorGroups,
  getErrorTimeseries,
  getErrorDetail,
  getDau,
  getRetention,
} from './engine/queries.js';
import { isReadOnlySql } from './engine/sql-guard.js';

// ── Re-exported types (components import these from api.ts) ───────────────────

export type { DataSourceKind, ConfigStatus, SyncStats };
export type {
  AppRow       as AppInfo,
  OverviewResult as OverviewData,
  TimeseriesRow,
  TopEventRow,
  TopScreenRow,
  TopErrorRow,
  ErrorGroupRow,
  ErrorTimeseriesRow,
  ErrorSample,
  ErrorDetailResult as ErrorDetailData,
  DauRow,
  RetentionRow,
} from './engine/queries.js';

// ── Config types ──────────────────────────────────────────────────────────────

export interface DateRangeParams {
  from?:  string;
  to?:    string;
  limit?: number;
  /** Filter events to a specific context.app.name. Undefined = all apps. */
  app?:   string;
}

export interface S3ConfigInput {
  source?:          'direct_s3';
  s3Bucket?:        string;
  s3Prefix?:        string;
  awsRegion?:       string;
  accessKeyId?:     string;
  secretAccessKey?: string;
  endpointUrl?:     string;
}

export interface StarfishConfigInput {
  source?:       'starfish';
  baseUrl?:      string;
  /** Legacy single-app input — normalised to `apps` by parseStarfishInput. */
  app?:          string;
  apps?:         string[];
  publicRead?:   boolean;
  cap?:          string;
  devEdPrivHex?: string;
}

export type ConfigInput = S3ConfigInput | StarfishConfigInput;

// ── Browser config (sessionStorage) ──────────────────────────────────────────

const BROWSER_CONFIG_KEY = 'sunglasses-dashboard-browser-config';

export interface BrowserConfig {
  mode?:            'direct_s3' | 'starfish';
  remember?:        boolean;
  s3Bucket?:        string;
  s3Prefix?:        string;
  awsRegion?:       string;
  accessKeyId?:     string;
  secretAccessKey?: string;
  endpointUrl?:     string;
  baseUrl?:         string;
  /** Legacy single-app field — kept for reading old sessionStorage; writes use `apps`. */
  app?:             string;
  apps?:            string[];
  publicRead?:      boolean;
  capJson?:         string;
  devEdPrivHex?:    string;
}

export function loadBrowserConfig(): BrowserConfig | null {
  try {
    const raw = sessionStorage.getItem(BROWSER_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as BrowserConfig;
    // Migration: old sessions stored a single `app` string; normalise to `apps` array.
    if (!cfg.apps && typeof cfg.app === 'string' && cfg.app) {
      cfg.apps = [cfg.app];
    }
    return cfg;
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
    const hasApps = !!(c.apps?.length);
    if (c.publicRead) return Boolean(c.baseUrl && hasApps);
    return Boolean(c.baseUrl && hasApps && c.capJson && c.devEdPrivHex);
  }
  if (!c.s3Bucket) return false;
  return Boolean(c.accessKeyId && c.secretAccessKey);
}

// ── DEFAULT_CONFIG_STATUS ─────────────────────────────────────────────────────

const DEFAULT_CONFIG_STATUS: ConfigStatus = {
  ready:              false,
  dataSource:         null,
  source:             null,
  error:              null,
  bucket:             null,
  prefix:             'events',
  region:             'us-east-1',
  endpointUrl:        null,
  authMode:           'none',
  baseUrl:            null,
  apps:               [],
  cacheDir:           null,
  starfishPublicRead: false,
  sync:               null,
};

// ── Lazy boot from saved config ───────────────────────────────────────────────

type ParsedSavedConfig =
  | { kind: 'starfish'; config: StarfishConfig }
  | { kind: 's3';       config: S3Config };

/** Parse the saved browser config into an engine config, or null when unusable. */
function parseSavedConfig(): ParsedSavedConfig | null {
  if (!canAutoConnectFromBrowser()) return null;
  const saved = loadBrowserConfig();
  if (!saved) return null;

  if (saved.mode === 'starfish') {
    const parsed = parseStarfishInput({
      baseUrl:      saved.baseUrl,
      apps:         saved.apps,
      publicRead:   saved.publicRead,
      cap:          saved.capJson,
      devEdPrivHex: saved.devEdPrivHex,
    });
    return typeof parsed === 'string' ? null : { kind: 'starfish', config: parsed };
  }

  const parsed = parseS3Input({
    s3Bucket:        saved.s3Bucket,
    s3Prefix:        saved.s3Prefix,
    awsRegion:       saved.awsRegion,
    accessKeyId:     saved.accessKeyId,
    secretAccessKey: saved.secretAccessKey,
    endpointUrl:     saved.endpointUrl,
  });
  return typeof parsed === 'string' ? null : { kind: 's3', config: parsed.config };
}

/**
 * Status derived from the saved browser config alone — no engine work. Lets
 * the app shell render immediately on reload while connectLazyFromSaved()
 * brings the engine up in the background. Null when auto-connect isn't
 * possible (no saved config, or credentials not remembered).
 */
export function optimisticStatusFromSaved(): ConfigStatus | null {
  const parsed = parseSavedConfig();
  if (!parsed) return null;
  if (parsed.kind === 'starfish') {
    // Sync stats come straight from the localStorage manifests — synchronous.
    return statusForStarfish(parsed.config, true, null, computeSyncStats(parsed.config.apps));
  }
  return statusForS3(parsed.config, true, null);
}

let _lazyConnect: Promise<ConfigStatus | null> | null = null;

/**
 * Connect in the background from the saved browser config.
 *
 * Starfish: registers IndexedDB-cached batches first (fast, local) so cached
 * data is queryable right away, then downloads new batches, reporting
 * progress to the sync-status store. A download failure keeps the cached
 * data usable and only surfaces in the store. Direct S3: configures the
 * engine and probes the bucket (no data download).
 *
 * Resolves with the final status, or null when there is no usable saved
 * config. Throws when the engine could not become ready at all (bad config,
 * unreachable server with no cache). Idempotent — concurrent callers (React
 * StrictMode double-mount) share one connection attempt.
 */
export function connectLazyFromSaved(): Promise<ConfigStatus | null> {
  _lazyConnect ??= doConnectLazyFromSaved().catch((e: unknown) => {
    _lazyConnect = null; // allow a retry on the next boot
    throw e;
  });
  return _lazyConnect;
}

async function doConnectLazyFromSaved(): Promise<ConfigStatus | null> {
  const parsed = parseSavedConfig();
  if (!parsed) return null;

  if (parsed.kind === 's3') {
    syncStatus.preparing();
    try {
      await configureDirectS3(parsed.config);
    } catch (e) {
      syncStatus.error(e instanceof Error ? e.message : 'Connection failed');
      throw e;
    }
    syncStatus.ready();
    return statusForS3(getS3Config(), true, null);
  }

  syncStatus.preparing();
  try {
    await prepareStarfishFromCache(parsed.config);
  } catch (e) {
    syncStatus.error(e instanceof Error ? e.message : 'Connection failed');
    throw e;
  }
  syncStatus.ready(); // cached data queryable — sections can render now

  try {
    let downloaded = 0;
    const stats = await resyncStarfish((done, total) => {
      downloaded = done;
      syncStatus.downloading(done, total);
    });
    syncStatus.ready(downloaded > 0);
    return statusForStarfish(getStarfishConfig(), true, null, stats);
  } catch (e) {
    // Cached data stays usable — surface the error without tearing down the UI.
    syncStatus.error(e instanceof Error ? e.message : 'Background sync failed');
    return statusForStarfish(getStarfishConfig(), true, null, getSyncStats());
  }
}

// ── Config operations ─────────────────────────────────────────────────────────

/** Return the current engine status (no network call). */
export async function fetchConfigStatus(): Promise<ConfigStatus> {
  if (!isDbReady()) return DEFAULT_CONFIG_STATUS;
  const ds = getDataSource();
  if (ds === 'direct_s3') {
    return statusForS3(getS3Config(), true, null);
  }
  if (ds === 'starfish') {
    return statusForStarfish(getStarfishConfig(), true, null, getSyncStats());
  }
  return DEFAULT_CONFIG_STATUS;
}

/** Connect to a data source — replaces the POST /api/config call. */
export async function saveConfig(input: ConfigInput, onProgress?: ProgressFn): Promise<ConfigStatus> {
  const isStarfish =
    'baseUrl' in input ||
    'cap' in input ||
    'publicRead' in input ||
    (input as StarfishConfigInput).source === 'starfish';

  if (isStarfish) {
    const parsed = parseStarfishInput(input as StarfishConfigInput);
    if (typeof parsed === 'string') throw new Error(parsed);

    saveBrowserConfig({
      mode:        'starfish',
      baseUrl:     parsed.baseUrl,
      apps:        parsed.apps,
      publicRead:  parsed.publicRead,
      capJson:     parsed.publicRead ? undefined : (typeof (input as StarfishConfigInput).cap === 'string' ? (input as StarfishConfigInput).cap as string : undefined),
      devEdPrivHex:parsed.publicRead ? undefined : parsed.devEdPrivHex,
      remember:    loadBrowserConfig()?.remember,
    });

    const stats = await configureStarfish(parsed, onProgress);
    syncStatus.ready();
    return statusForStarfish(getStarfishConfig(), true, null, stats);
  }

  const s3Input = input as S3ConfigInput;
  const parsed  = parseS3Input(s3Input);
  if (typeof parsed === 'string') throw new Error(parsed);

  saveBrowserConfig({
    mode:            'direct_s3',
    s3Bucket:        parsed.config.s3Bucket,
    s3Prefix:        parsed.config.s3Prefix,
    awsRegion:       parsed.config.awsRegion,
    accessKeyId:     parsed.config.accessKeyId,
    secretAccessKey: parsed.config.secretAccessKey,
    endpointUrl:     parsed.config.endpointUrl,
    remember:        loadBrowserConfig()?.remember,
  });

  await configureDirectS3(parsed.config);
  syncStatus.ready();
  return statusForS3(getS3Config(), true, null);
}

/** Disconnect — replaces DELETE /api/config. */
export async function clearConfig(): Promise<void> {
  await resetDb();
  sessionStorage.removeItem(BROWSER_CONFIG_KEY);
  _lazyConnect = null;
  syncStatus.reset();
}

/** Re-sync Starfish data — replaces POST /api/sync. */
export async function triggerSync(onProgress?: ProgressFn): Promise<ConfigStatus> {
  let downloaded = 0;
  try {
    const stats = await resyncStarfish((done, total) => {
      downloaded = done;
      syncStatus.downloading(done, total);
      onProgress?.(done, total);
    });
    // Bump the data version so mounted sections re-query the fresh batches.
    syncStatus.ready(downloaded > 0);
    return statusForStarfish(getStarfishConfig(), true, null, stats);
  } catch (e) {
    syncStatus.error(e instanceof Error ? e.message : 'Sync failed');
    throw e;
  }
}

/** Add an app slug to the active Starfish connection and persist the updated list. */
export async function addStarfishApp(app: string, onProgress?: ProgressFn): Promise<ConfigStatus> {
  const stats = await engineAddStarfishApp(app, onProgress);
  const cfg   = getStarfishConfig();
  const b     = loadBrowserConfig();
  if (b && cfg) saveBrowserConfig({ ...b, apps: cfg.apps });
  syncStatus.ready();
  return statusForStarfish(cfg, true, null, stats);
}

/** Remove an app slug from the active Starfish connection and persist the updated list. */
export async function removeStarfishApp(app: string): Promise<ConfigStatus> {
  const stats = await engineRemoveStarfishApp(app);
  const cfg   = getStarfishConfig();
  const b     = loadBrowserConfig();
  if (b && cfg) saveBrowserConfig({ ...b, apps: cfg.apps });
  syncStatus.ready();
  return statusForStarfish(cfg, true, null, stats);
}

// ── Fetch functions (query → engine/queries) ──────────────────────────────────

function toFilter(
  range: DateRangeParams & {
    day?:           number;
    level?:         string;
    handled?:       boolean;
    error_type?:    string;
    error_message?: string;
  },
) {
  return {
    from:          range.from,
    to:            range.to,
    limit:         range.limit,
    app:           range.app,
    day:           range.day,
    level:         range.level,
    handled:       range.handled,
    errorType:     range.error_type,
    errorMessage:  range.error_message,
  };
}

export function fetchApps(range: DateRangeParams) {
  return getApps({ from: range.from, to: range.to });
}

export function fetchOverview(range: DateRangeParams) {
  return getOverview(toFilter(range));
}

export function fetchTimeseries(range: DateRangeParams) {
  return getTimeseries(toFilter(range));
}

export function fetchTopEvents(range: DateRangeParams) {
  return getTopEvents({ ...toFilter(range), limit: range.limit ?? 20 });
}

export function fetchTopScreens(range: DateRangeParams) {
  return getTopScreens({ ...toFilter(range), limit: range.limit ?? 20 });
}

/** @deprecated Use fetchErrorGroups for the Errors section. */
export function fetchTopErrors(range: DateRangeParams) {
  return getTopErrors({ ...toFilter(range), limit: range.limit ?? 20 });
}

export function fetchErrorGroups(
  range: DateRangeParams & { level?: string; handled?: boolean },
) {
  return getErrorGroups(toFilter(range));
}

export function fetchErrorTimeseries(range: DateRangeParams) {
  return getErrorTimeseries(toFilter(range));
}

export function fetchErrorDetail(
  range: DateRangeParams & { error_type?: string; error_message?: string },
) {
  return getErrorDetail(toFilter(range));
}

export function fetchDau(range: DateRangeParams) {
  return getDau({ ...toFilter(range), limit: range.limit ?? 30 });
}

export function fetchRetention(range: DateRangeParams & { day?: number }) {
  return getRetention({ ...toFilter(range), limit: range.limit ?? 30 });
}

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[] };

export async function runQuery(sql: string): Promise<QueryResult> {
  if (!isReadOnlySql(sql)) {
    throw new Error('Only SELECT / WITH queries are allowed');
  }
  const rows = await queryRaw(sql);
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return { columns, rows };
}

// ── Date utils ────────────────────────────────────────────────────────────────

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

export function relativeTime(iso: string): string {
  const ms    = Date.now() - new Date(iso).getTime();
  const secs  = Math.floor(ms / 1000);
  if (secs < 60)   return `${secs}s ago`;
  const mins  = Math.floor(secs  / 60);
  if (mins < 60)   return `${mins}m ago`;
  const hours = Math.floor(mins  / 60);
  if (hours < 24)  return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Deprecated aliases ────────────────────────────────────────────────────────

/** @deprecated Use fetchErrorDetail */
export const fetchErrorDetails = fetchErrorDetail;
/** @deprecated Use fetchErrorGroups */
export const fetchErrors       = fetchErrorGroups;
