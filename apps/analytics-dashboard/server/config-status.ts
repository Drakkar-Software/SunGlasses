import type { S3Config } from './s3-config.js';
import type { StarfishConfig, SyncStats } from './starfish-config.js';

export type DataSourceKind = 'direct_s3' | 'starfish' | null;

export interface ConfigStatus {
  ready: boolean;
  dataSource: DataSourceKind;
  /** Human-readable data location label. */
  source: string | null;
  error: string | null;
  // direct_s3
  bucket: string | null;
  prefix: string;
  region: string;
  endpointUrl: string | null;
  authMode: 'keys' | 'iam' | 'none';
  // starfish
  baseUrl: string | null;
  app: string | null;
  cacheDir: string | null;
  /** Starfish list/pull without cap-cert when the collection allows public read. */
  starfishPublicRead: boolean;
  sync: SyncStats | null;
}

export function statusForS3(
  config: S3Config | null,
  ready: boolean,
  error: string | null,
  useIam: boolean,
): ConfigStatus {
  return {
    ready,
    dataSource: config ? 'direct_s3' : null,
    source: config ? `s3://${config.s3Bucket}/${config.s3Prefix}/` : null,
    error,
    bucket: config?.s3Bucket ?? null,
    prefix: config?.s3Prefix ?? 'events',
    region: config?.awsRegion ?? 'us-east-1',
    endpointUrl: config?.endpointUrl || null,
    authMode: !config ? 'none' : useIam || (!config.accessKeyId && !config.secretAccessKey) ? 'iam' : 'keys',
    baseUrl: null,
    app: null,
    cacheDir: null,
    starfishPublicRead: false,
    sync: null,
  };
}

export function statusForStarfish(
  config: StarfishConfig | null,
  ready: boolean,
  error: string | null,
  sync: SyncStats | null,
): ConfigStatus {
  return {
    ready,
    dataSource: config ? 'starfish' : null,
    source: config ? `starfish://${config.app} @ ${config.baseUrl}` : null,
    error,
    bucket: null,
    prefix: config ? `events/${config.app}` : 'events',
    region: '',
    endpointUrl: null,
    authMode: 'none',
    baseUrl: config?.baseUrl ?? null,
    app: config?.app ?? null,
    cacheDir: config?.cacheDir ?? null,
    starfishPublicRead: config?.publicRead ?? false,
    sync,
  };
}
