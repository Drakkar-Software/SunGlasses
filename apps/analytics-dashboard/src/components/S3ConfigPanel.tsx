import { useState, type FormEvent } from 'react';
import type { S3ConfigInput, S3ConfigStatus } from '../api';
import { saveS3Config } from '../api';

const STORAGE_KEY = 'sunglasses-s3-config-draft';

interface Draft extends S3ConfigInput {
  useIam: boolean;
}

function loadDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...parsed, secretAccessKey: '' };
  } catch {
    return {};
  }
}

function saveDraft(draft: Draft): void {
  const { secretAccessKey: _secret, ...rest } = draft;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

interface Props {
  status: S3ConfigStatus | null;
  onConnected: (status: S3ConfigStatus) => void;
}

export function S3ConfigPanel({ status, onConnected }: Props) {
  const draft = loadDraft();
  const [s3Bucket, setS3Bucket] = useState(status?.bucket ?? draft.s3Bucket ?? '');
  const [s3Prefix, setS3Prefix] = useState(status?.prefix ?? draft.s3Prefix ?? 'events');
  const [awsRegion, setAwsRegion] = useState(status?.region ?? draft.awsRegion ?? 'us-east-1');
  const [accessKeyId, setAccessKeyId] = useState(draft.accessKeyId ?? '');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [endpointUrl, setEndpointUrl] = useState(status?.endpointUrl ?? draft.endpointUrl ?? '');
  const [useIam, setUseIam] = useState(
    status?.authMode === 'iam' || draft.useIam === true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(status?.error ?? null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const input: S3ConfigInput = {
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

    saveDraft({ ...input, useIam });

    try {
      const next = await saveS3Config(input);
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
          Connect to the S3 bucket where your <code>ingest-server</code> writes Parquet event
          files. Use the same bucket, prefix, and credentials as the ingest server.
        </p>

        {error ? <div className="error-banner">{error}</div> : null}

        <form className="setup-form" onSubmit={handleSubmit}>
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

          <button type="submit" className="primary-btn setup-submit" disabled={submitting}>
            {submitting ? 'Connecting…' : 'Connect to S3'}
          </button>
        </form>

        <p className="setup-hint">
          Credentials are sent to this dashboard server only and kept in memory for the current
          process. You can also set <code>S3_BUCKET</code> and <code>AWS_*</code> in{' '}
          <code>.env</code> to skip this screen.
        </p>
      </div>
    </div>
  );
}
