/**
 * AppManager — live add / remove of Starfish app slugs from the sidebar.
 * Rendered only when dataSource === 'starfish'.
 */
import { useState, type KeyboardEvent } from 'react';
import type { ConfigStatus } from '../api';
import { addStarfishApp, removeStarfishApp } from '../api';

interface Props {
  status:    ConfigStatus;
  onChanged: (next: ConfigStatus) => void;
}

export function AppManager({ status, onChanged }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  if (status.dataSource !== 'starfish') return null;

  const apps = status.apps;

  async function handleAdd() {
    const slug = inputValue.trim();
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      const next = await addStarfishApp(slug);
      setInputValue('');
      onChanged(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add app');
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); }
  }

  async function handleRemove(app: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await removeStarfishApp(app);
      onChanged(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove app');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* App chips */}
      <div className="flex flex-wrap gap-1">
        {apps.map((app) => (
          <span
            key={app}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.6875rem] text-white"
          >
            <span className="truncate max-w-[80px]" title={app}>{app}</span>
            <button
              type="button"
              disabled={busy || apps.length <= 1}
              onClick={() => void handleRemove(app)}
              title={apps.length <= 1 ? 'At least one app is required' : `Remove ${app}`}
              aria-label={`Remove ${app}`}
              className="shrink-0 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active rounded"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Add app input */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={busy}
          placeholder="+ add app slug"
          aria-label="Add app slug"
          className="flex-1 min-w-0 rounded bg-white/10 px-2 py-0.5 text-[0.6875rem] text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy || !inputValue.trim()}
          onClick={() => void handleAdd()}
          className="shrink-0 text-[0.6875rem] font-medium text-sidebar-active hover:underline disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active rounded"
        >
          {busy ? '…' : 'Add'}
        </button>
      </div>

      {error ? (
        <p className="text-[0.6875rem] text-destructive" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
