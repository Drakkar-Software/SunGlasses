import { Empty } from './ui/Empty';

interface Col {
  key: string;
  label: string;
  align?: 'left' | 'right';
  mono?: boolean;
}

interface Props {
  columns: Col[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = 'No data.',
  onRowClick,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-8 rounded" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <Empty message={emptyMessage} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`
                  px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wide
                  text-muted-fg border-b border-border
                  ${col.align === 'right' ? 'text-right' : 'text-left'}
                `}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`
                border-b border-border/50 last:border-0
                transition-colors duration-75
                ${onRowClick ? 'cursor-pointer hover:bg-muted' : 'hover:bg-muted/50'}
              `}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`
                    px-4 py-3 text-foreground
                    ${col.align === 'right' ? 'text-right tabular' : ''}
                    ${col.mono ? 'font-mono text-xs' : ''}
                  `}
                >
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
