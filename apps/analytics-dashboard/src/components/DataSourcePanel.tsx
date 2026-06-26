import { useState, type FormEvent } from 'react';
import type { ConfigInput, ConfigStatus } from '../api';
import {
  loadBrowserConfig,
  saveBrowserConfig,
  saveConfig,
  triggerSync,
} from '../api';

interface Props {
  status: ConfigStatus | null;
  onConnected: (status: ConfigStatus) => void;
}

type Mode = 'starfish' | 'direct_s3';

export function DataSourcePanel({ status, onConnected }: Props) {
  const browser = loadBrowserConfig();
  const initialMode: Mode =
    status?.dataSource === 'starfish' || browser?.mode === 'starfish' ? 'starfish' : 'direct_s3';

  const [mode, setMode] = useState<Mode>(initialMode);

  // S3 fields
  const [s3Bucket, setS3Bucket] = useState(status?.bucket ?? browser?.s3Bucket ?? '');
  const [s3Prefix, setS3Prefix] = useState(status?.prefix ?? browser?.s3Prefix ?? 'events');
  const [awsRegion, setAwsRegion] = useState(status?.region ?? browser?.awsRegion ?? 'us-east-1');
  const [accessKeyId, setAccessKeyId] = useState(browser?.accessKeyId ?? '');
  const [secretAccessKey, setSecretAccessKey] = useState(browser?.secretAccessKey ?? '');
  const [endpointUrl, setEndpointUrl] = useState(status?.endpointUrl ?? browser?.endpointUrl ?? '');
  const [useIam, setUseIam] = useState(
    status?.authMode === 'iam' || browser?.useIam === true,
  );

  // Starfish fields
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? browser?.baseUrl ?? '');
  const [app, setApp] = useState(status?.app ?? browser?.app ?? '');
  const [capJson, setCapJson] = useState(browser?.capJson ?? '');
  const [devEdPrivHex, setDevEdPrivHex] = useState(browser?.devEdPrivHex ?? '');

  const [remember, setRemember] = useState(browser?.remember === true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(status?.error ?? null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let input: ConfigInput;
    if (mode === 'starfish') {
      input = {
        source: 'starfish',
        baseUrl,
        app,
        cap: capJson,
        devEdPrivHex,
      };
      saveBrowserConfig({
        mode: 'starfish',
        baseUrl,
        app,
        capJson: remember ? capJson : undefined,
        devEdPrivHex: remember ? devEdPrivHex : undefined,
        remember,
      });
    } else {
      input = {
        source: 'direct_s3',
        s3Bucket,
        s3Prefix,
        awsRegion,
        endpointUrl: endpointUrl || undefined,
        useIam,
      };
      if (!useIam) {
        input.accessKeyId = accessKeyId;
        input.secretAccessKey = secretAccessKey;
      }
      saveBrowserConfig({
        mode: 'direct_s3',
        s3Bucket,
        s3Prefix,
        awsRegion,
        endpointUrl,
        useIam,
        accessKeyId: remember ? accessKeyId : undefined,
        secretAccessKey: remember ? secretAccessKey : undefined,
        remember,
      });
    }

    try {
      const next = await saveConfig(input);
      onConnected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>SunGlasses Analytics</h1>
        <p className="setup-lead">
          Connect to your analytics data. Use <strong>Starfish</strong> when S3/Garage is not
          publicly reachable (recommended for Infra sync). Use <strong>Direct S3</strong> for
          local MinIO or when DuckDB can reach the bucket directly.
        </p>

        <div className="source-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={mode === 'starfish' ? 'source-tab active' : 'source-tab'}
            aria-selected={mode === 'starfish'}
            onClick={() => setMode('starfish')}
          >
            Starfish
          </button>
          <button
            type="button"
            role="tab"
            className={mode === 'direct_s3' ? 'source-tab active' : 'source-tab'}
            aria-selected={mode === 'direct_s3'}
            onClick={() => setMode('direct_s3')}
          >
            Direct S3
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <form className="setup-form" onSubmit={handleSubmit}>
          {mode === 'starfish' ? (
            <>
              <fieldset className="form-section">
                <legend>Starfish sync</legend>
                <label className="form-field">
                  <span>Sync base URL *</span>
                  <input
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://sync.example.com/v1/analytics"
                    autoComplete="off"
                  />
                </label>
                <label className="form-field">
                  <span>App slug *</span>
                  <input
                    type="text"
                    required
                    value={app}
                    onChange={(e) => setApp(e.target.value)}
                    placeholder="octochat"
                    autoComplete="off"
                  />
                </label>
              </fieldset>

              <fieldset className="form-section">
                <legend>Admin cap-cert</legend>
                <label className="form-field">
                  <span>Cap certificate JSON *</span>
                  <textarea
                    required
                    rows={6}
                    value={capJson}
                    onChange={(e) => setCapJson(e.target.value)}
                    placeholder='{"v":1,"kind":"device",...}'
                    spellCheck={false}
                  />
                </label>
                <label className="form-field">
                  <span>Device Ed25519 private key (hex) *</span>
                  <input
                    type="password"
                    required
                    value={devEdPrivHex}
                    onChange={(e) => setDevEdPrivHex(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </fieldset>
            </>
          ) : (
            <>
              <fieldset className="form-section">
                <legend>Storage</legend>
                <label className="form-field">
                  <span>S3 bucket *</span>
                  <input
                    type="text"
                    required
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="my-analytics-bucket"
                    autoComplete="off"
                  />
                </label>
                <label className="form-field">
                  <span>Key prefix</span>
                  <input
                    type="text"
                    value={s3Prefix}
                    onChange={(e) => setS3Prefix(e.target.value)}
                    placeholder="events"
                    autoComplete="off"
                  />
                </label>
                <label className="form-field">
                  <span>Region</span>
                  <input
                    type="text"
                    value={awsRegion}
                    onChange={(e) => setAwsRegion(e.target.value)}
                    placeholder="us-east-1"
                    autoComplete="off"
                  />
                </label>
                <label className="form-field">
                  <span>Custom endpoint (MinIO / R2)</span>
                  <input
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="http://localhost:9000"
                    autoComplete="off"
                  />
                </label>
              </fieldset>

              <fieldset className="form-section">
                <legend>Credentials</legend>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={useIam}
                    onChange={(e) => setUseIam(e.target.checked)}
                  />
                  <span>Use IAM role / instance profile (no access keys)</span>
                </label>

                {!useIam ? (
                  <>
                    <label className="form-field">
                      <span>Access key ID *</span>
                      <input
                        type="text"
                        required={!useIam}
                        value={accessKeyId}
                        onChange={(e) => setAccessKeyId(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <label className="form-field">
                      <span>Secret access key *</span>
                      <input
                        type="password"
                        required={!useIam}
                        value={secretAccessKey}
                        onChange={(e) => setSecretAccessKey(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                ) : null}
              </fieldset>
            </>
          )}

          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember in this browser (session only — cleared when the tab closes)</span>
          </label>

          <button type="submit" className="primary-btn setup-submit" disabled={submitting}>
            {submitting ? 'Connecting…' : mode === 'starfish' ? 'Connect via Starfish' : 'Connect to S3'}
          </button>
        </form>

        <p className="setup-hint">
          Settings are sent to this dashboard server and stored in{' '}
          <code>{mode === 'starfish' ? '.starfish-config.local.json' : '.s3-config.local.json'}</code>{' '}
          (gitignored). Starfish mode caches Parquet under <code>.parquet-cache/</code>.
        </p>
      </div>
    </div>
  );
}

export function SyncBar({
  status,
  onSynced,
}: {
  status: ConfigStatus;
  onSynced: (next: ConfigStatus) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  if (status.dataSource !== 'starfish') return null;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const next = await triggerSync();
      onSynced(next);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const sync = status.sync;
  const label = sync
    ? `${sync.totalFiles} file(s) · ${formatBytes(sync.cacheBytes)}`
    : 'No sync yet';

  return (
    <div className="sync-bar">
      <span className="sync-meta">
        {label}
        {sync?.lastSyncAt ? ` · last ${new Date(sync.lastSyncAt).toLocaleString()}` : ''}
      </span>
      <button type="button" className="link-btn" disabled={syncing} onClick={() => void handleSync()}>
        {syncing ? 'Refreshing…' : 'Refresh data'}
      </button>
      {syncError ? <span className="sync-error">{syncError}</span> : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
