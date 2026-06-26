interface Props {
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable({ columns, rows, loading, emptyMessage = 'No data.' }: Props) {
  if (loading) {
    return <div className="table-placeholder">Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="table-placeholder">{emptyMessage}</div>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === 'right' ? 'align-right' : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? 'align-right' : undefined}>
                  {formatCell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}
