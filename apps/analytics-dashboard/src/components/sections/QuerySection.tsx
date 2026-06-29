import { useCallback, useRef, useState, useTransition } from 'react';
import { runQuery } from '../../api';
import type { QueryResult } from '../../api';
import { DataTable } from '../DataTable';

const PLACEHOLDER = `-- Write DuckDB SQL here. Use events() to access your data.
-- Example:
SELECT event, count(*) AS total
FROM events()
WHERE dt >= current_date - INTERVAL 7 DAY
GROUP BY event
ORDER BY total DESC
LIMIT 20`;

export function QuerySection() {
  const [sql, setSql]                = useState('');
  const [result, setResult]          = useState<QueryResult | null>(null);
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef                  = useRef<HTMLTextAreaElement>(null);

  const run = useCallback(async () => {
    if (!sql.trim()) return;
    setError(null);
    setResult(null);
    try {
      const data = await runQuery(sql);
      startTransition(() => setResult(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [sql]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void run();
      }
    },
    [run],
  );

  const columns = result
    ? result.columns.map((c) => ({ key: c, label: c, mono: true }))
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">SQL console</p>
            <p className="text-xs text-muted-fg mt-0.5">Run read-only DuckDB queries against your events</p>
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={isPending || !sql.trim()}
            aria-label="Run query (⌘ Enter)"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-100"
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.84Z" />
            </svg>
            Run
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKey}
          placeholder={PLACEHOLDER}
          aria-label="SQL query"
          rows={8}
          spellCheck={false}
          className="w-full px-5 py-4 font-mono text-xs text-foreground bg-card resize-none border-b border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive-bg p-4">
          <p className="text-xs font-semibold text-destructive mb-1">Query error</p>
          <pre className="text-xs font-mono text-destructive whitespace-pre-wrap break-all">{error}</pre>
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs text-muted-fg">
              {result.rows.length.toLocaleString()} row{result.rows.length !== 1 ? 's' : ''}
              {' '}· {result.columns.length} column{result.columns.length !== 1 ? 's' : ''}
            </p>
          </div>
          <DataTable columns={columns} rows={result.rows} />
        </div>
      ) : null}

      {isPending ? (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded" />)}
        </div>
      ) : null}
    </div>
  );
}
