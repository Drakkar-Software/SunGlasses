/** Runtime S3 settings for DuckDB httpfs (mirrors ingest-server env names). */
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

export function configFromEnv(): S3Config | null {
  const s3Bucket = (process.env['S3_BUCKET'] ?? '').trim();
  if (!s3Bucket) return null;
  return {
    s3Bucket,
    s3Prefix: (process.env['S3_PREFIX'] ?? 'events').trim() || 'events',
    awsRegion: (process.env['AWS_REGION'] ?? 'us-east-1').trim() || 'us-east-1',
    accessKeyId: (process.env['AWS_ACCESS_KEY_ID'] ?? '').trim(),
    secretAccessKey: (process.env['AWS_SECRET_ACCESS_KEY'] ?? '').trim(),
    endpointUrl: (process.env['ENDPOINT_URL'] ?? '').trim(),
  };
}

export function parseConfigInput(body: S3ConfigInput): { config: S3Config; useIam: boolean } | string {
  const s3Bucket = body.s3Bucket?.trim() ?? '';
  if (!s3Bucket) return 'S3 bucket is required';

  const useIam = body.useIam === true;
  const accessKeyId = body.accessKeyId?.trim() ?? '';
  const secretAccessKey = body.secretAccessKey?.trim() ?? '';

  if (!useIam && (!accessKeyId || !secretAccessKey)) {
    return 'Access key and secret are required (or enable IAM / instance profile auth)';
  }

  return {
    useIam,
    config: {
      s3Bucket,
      s3Prefix: body.s3Prefix?.trim() || 'events',
      awsRegion: body.awsRegion?.trim() || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      endpointUrl: body.endpointUrl?.trim() ?? '',
    },
  };
}

export function publicStatus(
  config: S3Config | null,
  ready: boolean,
  error: string | null,
  useIam: boolean,
): S3ConfigStatus {
  return {
    ready,
    source: config ? `s3://${config.s3Bucket}/${config.s3Prefix}/` : null,
    bucket: config?.s3Bucket ?? null,
    prefix: config?.s3Prefix ?? 'events',
    region: config?.awsRegion ?? 'us-east-1',
    endpointUrl: config?.endpointUrl || null,
    authMode: !config ? 'none' : useIam || (!config.accessKeyId && !config.secretAccessKey) ? 'iam' : 'keys',
    error,
  };
}
