import { useState } from 'react';
import { runQuery } from '../api';
import { DataTable } from './DataTable';

const DEFAULT_SQL = `SELECT event, count(*) AS n
FROM events()
GROUP BY event
ORDER BY n DESC
LIMIT 10`;

export function QueryConsole() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [columns, setColumns] = useState<{ key: string; label: string }[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const result = await runQuery(sql);
      setColumns(result.columns.map((c) => ({ key: c, label: c })));
      setRows(result.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed');
      setRows([]);
      setColumns([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="query-console">
      <p className="query-warning">
        Read-only SQL against your S3 Parquet data. The <code>events()</code> macro is
        pre-defined. Do not expose this console on untrusted networks.
      </p>
      <textarea
        className="query-input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={8}
        spellCheck={false}
      />
      <div className="query-actions">
        <button type="button" className="primary-btn" onClick={handleRun} disabled={loading}>
          {loading ? 'Running…' : 'Run query'}
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {columns.length > 0 || loading ? (
        <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="Query returned no rows." />
      ) : null}
    </div>
  );
}
