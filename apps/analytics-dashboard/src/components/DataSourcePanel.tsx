import { useState, type FormEvent } from 'react';
import type { ConfigInput, ConfigStatus, ProgressFn } from '../api';
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
  const browser      = loadBrowserConfig();
  const initialMode: Mode =
    status?.dataSource === 'starfish' || browser?.mode === 'starfish' ? 'starfish' : 'direct_s3';

  const [mode, setMode] = useState<Mode>(initialMode);

  // S3 fields
  const [s3Bucket,         setS3Bucket]         = useState(status?.bucket     ?? browser?.s3Bucket     ?? '');
  const [s3Prefix,         setS3Prefix]         = useState(status?.prefix     ?? browser?.s3Prefix     ?? 'events');
  const [awsRegion,        setAwsRegion]        = useState(status?.region     ?? browser?.awsRegion    ?? 'us-east-1');
  const [accessKeyId,      setAccessKeyId]      = useState(browser?.accessKeyId      ?? '');
  const [secretAccessKey,  setSecretAccessKey]  = useState(browser?.secretAccessKey  ?? '');
  const [endpointUrl,      setEndpointUrl]      = useState(status?.endpointUrl ?? browser?.endpointUrl ?? '');

  // Starfish fields
  const [baseUrl,      setBaseUrl]      = useState(status?.baseUrl    ?? browser?.baseUrl    ?? '');
  const [appsText,     setAppsText]     = useState(
    status?.apps?.join(', ') ?? browser?.apps?.join(', ') ?? '',
  );
  const [publicRead,   setPublicRead]   = useState(status?.starfishPublicRead ?? browser?.publicRead === true);
  const [capJson,      setCapJson]      = useState(browser?.capJson      ?? '');
  const [devEdPrivHex, setDevEdPrivHex] = useState(browser?.devEdPrivHex ?? '');

  const [remember,    setRemember]    = useState(browser?.remember === true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(status?.error ?? null);
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setProgress(null);

    const apps = appsText.split(',').map((s) => s.trim()).filter(Boolean);

    let input: ConfigInput;
    if (mode === 'starfish') {
      input = { source: 'starfish', baseUrl, apps, publicRead };
      if (!publicRead) { input.cap = capJson; input.devEdPrivHex = devEdPrivHex; }
      saveBrowserConfig({
        mode: 'starfish', baseUrl, apps, publicRead,
        capJson:      remember && !publicRead ? capJson      : undefined,
        devEdPrivHex: remember && !publicRead ? devEdPrivHex : undefined,
        remember,
      });
    } else {
      input = { source: 'direct_s3', s3Bucket, s3Prefix, awsRegion, endpointUrl: endpointUrl || undefined };
      input.accessKeyId     = accessKeyId;
      input.secretAccessKey = secretAccessKey;
      saveBrowserConfig({
        mode: 'direct_s3', s3Bucket, s3Prefix, awsRegion, endpointUrl,
        accessKeyId:     remember ? accessKeyId     : undefined,
        secretAccessKey: remember ? secretAccessKey : undefined,
        remember,
      });
    }

    const onProgress: ProgressFn | undefined = mode === 'starfish'
      ? (done, total) => setProgress({ done, total })
      : undefined;

    try {
      const next = await saveConfig(input, onProgress);
      onConnected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <svg aria-hidden="true" className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span className="text-xl font-bold text-foreground tracking-tight">SunGlasses Analytics</span>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6">
          <p className="text-sm text-muted-fg mb-5">
            Connect to your analytics data. Use <strong className="text-foreground">Starfish</strong> when S3 is not
            publicly reachable. Use <strong className="text-foreground">Direct S3</strong> for MinIO or direct bucket access.
          </p>

          {/* Mode tabs */}
          <div role="tablist" className="flex rounded-lg border border-border bg-muted p-1 mb-5">
            {(['starfish', 'direct_s3'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                  mode === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-fg hover:text-foreground'
                }`}
              >
                {m === 'starfish' ? 'Starfish' : 'Direct S3'}
              </button>
            ))}
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive-bg p-3 mb-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'starfish' ? (
              <>
                <Field
                  label="Sync base URL"
                  required
                  hint="Full external API root including the /sync/v1/<namespace> prefix, e.g. https://host/sync/v1/analytics — not just the host."
                >
                  <input
                    type="url" required value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://sync.example.com/sync/v1/analytics"
                    autoComplete="off"
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="App slugs"
                  required
                  hint="One or more slugs, comma-separated. Add or remove apps later from the sidebar."
                >
                  <input
                    type="text" required value={appsText}
                    onChange={(e) => setAppsText(e.target.value)}
                    placeholder="my-app, other-app"
                    autoComplete="off"
                    className={inputCls}
                  />
                </Field>
                <CheckField
                  checked={publicRead}
                  onChange={setPublicRead}
                  label="Public read — no cap-cert"
                />
                {!publicRead ? (
                  <>
                    <Field label="Cap certificate JSON" required>
                      <textarea
                        required rows={4} value={capJson}
                        onChange={(e) => setCapJson(e.target.value)}
                        placeholder='{"v":1,"kind":"device",...}'
                        spellCheck={false}
                        className={`${inputCls} font-mono text-xs`}
                      />
                    </Field>
                    <Field label="Device Ed25519 private key (hex)" required>
                      <input
                        type="password" required value={devEdPrivHex}
                        onChange={(e) => setDevEdPrivHex(e.target.value)}
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </Field>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Field label="S3 bucket" required>
                  <input
                    type="text" required value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="my-analytics-bucket"
                    autoComplete="off"
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Key prefix">
                    <input
                      type="text" value={s3Prefix}
                      onChange={(e) => setS3Prefix(e.target.value)}
                      placeholder="events"
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Region">
                    <input
                      type="text" value={awsRegion}
                      onChange={(e) => setAwsRegion(e.target.value)}
                      placeholder="us-east-1"
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Custom endpoint (MinIO / R2 / Cloudflare)">
                  <input
                    type="url" value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="http://localhost:9000"
                    autoComplete="off"
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Access key ID" required>
                    <input
                      type="text" required value={accessKeyId}
                      onChange={(e) => setAccessKeyId(e.target.value)}
                      autoComplete="off"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Secret access key" required>
                    <input
                      type="password" required value={secretAccessKey}
                      onChange={(e) => setSecretAccessKey(e.target.value)}
                      autoComplete="new-password"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </>
            )}

            <CheckField
              checked={remember}
              onChange={setRemember}
              label="Remember credentials in this browser tab (cleared when the tab closes)"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-100"
            >
              {submitting ? 'Connecting…' : mode === 'starfish' ? 'Connect via Starfish' : 'Connect to S3'}
            </button>

            {submitting && progress ? (
              <SyncProgress done={progress.done} total={progress.total} />
            ) : null}
          </form>

          <p className="mt-4 text-xs text-muted-fg">
            Credentials stay in this browser tab only — never sent to any server.
            Your S3 bucket or Starfish server must allow this origin via <strong className="text-foreground">CORS</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-fg/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}{required ? <span className="text-destructive ml-0.5" aria-hidden="true">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-fg">{hint}</span> : null}
    </label>
  );
}

function CheckField({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

// ── SyncBar ───────────────────────────────────────────────────────────────────

export function SyncBar({
  status,
  onSynced,
  compact,
}: {
  status: ConfigStatus;
  onSynced: (next: ConfigStatus) => void;
  compact?: boolean;
}) {
  const [syncing,   setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [progress,  setProgress]  = useState<{ done: number; total: number } | null>(null);

  if (status.dataSource !== 'starfish') return null;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setProgress(null);
    try {
      const next = await triggerSync((done, total) => setProgress({ done, total }));
      onSynced(next);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }

  const sync  = status.sync;
  const label = sync
    ? `${sync.totalFiles} file${sync.totalFiles !== 1 ? 's' : ''} · ${formatBytes(sync.cacheBytes)}`
    : 'No sync yet';

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] text-sidebar-fg truncate">{label}</span>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSync()}
            aria-label="Refresh data from Starfish"
            className="shrink-0 text-[0.6875rem] text-sidebar-active hover:underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active rounded"
          >
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
        {syncing && progress ? (
          <SyncProgressCompact done={progress.done} total={progress.total} />
        ) : null}
        {syncError ? <span className="text-[0.6875rem] text-destructive">{syncError}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-fg flex-1">{label}</span>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void handleSync()}
          className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
        >
          {syncing ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>
      {syncing && progress ? (
        <SyncProgress done={progress.done} total={progress.total} />
      ) : null}
      {syncError ? <span className="text-xs text-destructive">{syncError}</span> : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024)              return `${n} B`;
  if (n < 1024 * 1024)      return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Progress indicators ───────────────────────────────────────────────────────

/** Full-width progress bar with label — used in the setup form. */
export function SyncProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="h-[3px] w-full rounded-full bg-primary/15 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemax={total}
          aria-label={`Downloading ${done} of ${total} files`}
        />
      </div>
      <p className="text-xs text-muted-fg tabular-nums">
        {done < total
          ? `Downloading ${done} / ${total} ${total === 1 ? 'file' : 'files'}…`
          : `Downloaded ${total} ${total === 1 ? 'file' : 'files'}`}
      </p>
    </div>
  );
}

/** Compact progress bar — used inside the sidebar SyncBar and AppManager. */
export function SyncProgressCompact({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="space-y-0.5" role="status" aria-live="polite">
      <div className="h-[2px] w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-sidebar-active transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemax={total}
          aria-label={`Downloading ${done} of ${total} files`}
        />
      </div>
      <p className="text-[0.625rem] text-sidebar-fg tabular-nums">
        {done} / {total} {total === 1 ? 'file' : 'files'}
      </p>
    </div>
  );
}
