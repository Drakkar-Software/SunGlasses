// ── S3 config ─────────────────────────────────────────────────────────────────

/** Runtime S3 settings passed to DuckDB httpfs. */
export interface S3Config {
  s3Bucket: string;
  s3Prefix: string;
  awsRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpointUrl: string;
}

export interface S3ConfigInput {
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpointUrl?: string;
}

/** Parse and validate S3 form input. Returns S3Config or an error string. */
export function parseS3Input(
  body: S3ConfigInput,
): { config: S3Config } | string {
  const s3Bucket = body.s3Bucket?.trim() ?? '';
  if (!s3Bucket) return 'S3 bucket is required';

  const accessKeyId     = body.accessKeyId?.trim() ?? '';
  const secretAccessKey = body.secretAccessKey?.trim() ?? '';
  if (!accessKeyId || !secretAccessKey) {
    return 'Access key ID and secret access key are required';
  }

  return {
    config: {
      s3Bucket,
      s3Prefix:       body.s3Prefix?.trim() || 'events',
      awsRegion:      body.awsRegion?.trim() || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      endpointUrl:    body.endpointUrl?.trim() ?? '',
    },
  };
}

/** Turn DuckDB/httpfs errors into a short user-facing message. */
export function formatS3Error(raw: string, config?: S3Config | null): string {
  const firstLine = raw.split('\n').map((l) => l.trim()).find(Boolean) ?? raw;
  const endpoint  = config?.endpointUrl || null;

  if (/could not connect|ECONNREFUSED|connection refused|ENOTFOUND/i.test(firstLine)) {
    if (endpoint && /localhost|127\.0\.0\.1/.test(endpoint)) {
      return `Cannot reach ${endpoint} — is MinIO (or your local S3) running?`;
    }
    return `Cannot reach S3${endpoint ? ` at ${endpoint}` : ''}. Check network, credentials, and bucket name.`;
  }

  if (/403|access denied|invalid access key|signature/i.test(firstLine)) {
    return 'S3 access denied — check access key, secret, and bucket permissions.';
  }

  if (/CORS|Access-Control/i.test(firstLine)) {
    return 'S3 CORS error — add an AllowedOrigins rule for this origin to your bucket\'s CORS policy.';
  }

  if (/404|not found|nosuchbucket/i.test(firstLine)) {
    return `S3 bucket "${config?.s3Bucket ?? '?'}" was not found.`;
  }

  return firstLine.replace(/\s+LINE\s+\d+:.*$/i, '').trim();
}

// ── Starfish config ───────────────────────────────────────────────────────────

import type { CapCert } from '@drakkar.software/starfish-protocol';

export interface StarfishConfig {
  baseUrl:      string;
  apps:         string[];
  /** When true, list/pull require no cap-cert. */
  publicRead:   boolean;
  cap?:         CapCert;
  devEdPrivHex?:string;
}

export interface StarfishConfigInput {
  source?:       'starfish';
  baseUrl?:      string;
  /** Legacy single-app input — normalised to `apps` by parseStarfishInput. */
  app?:          string;
  apps?:         string[];
  publicRead?:   boolean;
  cap?:          CapCert | string;
  devEdPrivHex?: string;
}

export interface SyncStats {
  totalFiles:  number;
  cacheBytes:  number;
  lastSyncAt:  string | null;
}

/** Parse and validate Starfish form input. Returns StarfishConfig or an error string. */
export function parseStarfishInput(body: StarfishConfigInput): StarfishConfig | string {
  const baseUrl = body.baseUrl?.trim() ?? '';
  if (!baseUrl) return 'Starfish base URL is required';

  const rawApps = body.apps ?? (body.app != null ? [body.app] : []);
  const apps    = Array.from(new Set(rawApps.map((s) => s.trim()).filter(Boolean)));
  if (apps.length === 0) return 'At least one app slug is required (e.g. octochat)';

  const publicRead = body.publicRead === true;

  if (publicRead) {
    return { baseUrl: baseUrl.replace(/\/$/, ''), apps, publicRead: true };
  }

  const devEdPrivHex = body.devEdPrivHex?.trim() ?? '';
  if (!devEdPrivHex) return 'Device Ed25519 private key (hex) is required';

  let cap: CapCert;
  try {
    if (typeof body.cap === 'string') {
      cap = JSON.parse(body.cap) as CapCert;
    } else if (body.cap && typeof body.cap === 'object') {
      cap = body.cap;
    } else {
      return 'Cap certificate JSON is required';
    }
  } catch {
    return 'Cap certificate must be valid JSON';
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apps,
    publicRead: false,
    cap,
    devEdPrivHex,
  };
}

// ── Unified ConfigStatus ──────────────────────────────────────────────────────

export type DataSourceKind = 'direct_s3' | 'starfish' | null;

export interface ConfigStatus {
  ready:              boolean;
  dataSource:         DataSourceKind;
  source:             string | null;
  error:              string | null;
  // direct_s3
  bucket:             string | null;
  prefix:             string;
  region:             string;
  endpointUrl:        string | null;
  authMode:           'keys' | 'none';
  // starfish
  baseUrl:            string | null;
  apps:               string[];
  cacheDir:           null; // always null in browser mode (no local fs)
  starfishPublicRead: boolean;
  sync:               SyncStats | null;
}

export function statusForS3(
  config: S3Config | null,
  ready:  boolean,
  error:  string | null,
): ConfigStatus {
  return {
    ready,
    dataSource:         config ? 'direct_s3' : null,
    source:             config ? `s3://${config.s3Bucket}/${config.s3Prefix}/` : null,
    error,
    bucket:             config?.s3Bucket ?? null,
    prefix:             config?.s3Prefix ?? 'events',
    region:             config?.awsRegion ?? 'us-east-1',
    endpointUrl:        config?.endpointUrl || null,
    authMode:           config ? 'keys' : 'none',
    baseUrl:            null,
    apps:               [],
    cacheDir:           null,
    starfishPublicRead: false,
    sync:               null,
  };
}

export function statusForStarfish(
  config: StarfishConfig | null,
  ready:  boolean,
  error:  string | null,
  sync:   SyncStats | null,
): ConfigStatus {
  return {
    ready,
    dataSource:         config ? 'starfish' : null,
    source:             config ? `starfish://${config.apps.join(', ')} @ ${config.baseUrl}` : null,
    error,
    bucket:             null,
    prefix:             config ? `events/${config.apps.join(',')}` : 'events',
    region:             '',
    endpointUrl:        null,
    authMode:           'none',
    baseUrl:            config?.baseUrl ?? null,
    apps:               config?.apps ?? [],
    cacheDir:           null,
    starfishPublicRead: config?.publicRead ?? false,
    sync,
  };
}
