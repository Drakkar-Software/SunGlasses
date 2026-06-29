import { useCallback, useEffect, useState, useTransition } from 'react';
import type { DateRangeParams, RetentionRow } from '../../api';
import { fetchRetention } from '../../api';
import { DataTable } from '../DataTable';
import { Empty } from '../ui/Empty';

interface Props {
  range: DateRangeParams;
}

const COLUMNS = [
  { key: 'cohort_date',   label: 'Cohort' },
  { key: 'cohort_size',   label: 'Cohort size',  align: 'right' as const },
  { key: 'retained',      label: 'Day-1 return', align: 'right' as const },
  { key: 'retention_pct', label: 'Retention %',  align: 'right' as const },
];

export function RetentionSection({ range }: Props) {
  const [rows, setRows]              = useState<RetentionRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const data = await fetchRetention({ ...range, limit: 60 });
    startTransition(() => setRows(data));
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const formatted = rows.map((r) => ({
    ...r,
    retention_pct: `${r.retention_pct.toFixed(1)}%`,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Day-1 retention by cohort</p>
          <p className="text-xs text-muted-fg mt-0.5">Devices that returned within 24 h of first seen</p>
        </div>
        {formatted.length === 0 && !isPending ? (
          <Empty message="No retention data. Need at least two consecutive days of events." />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={formatted as unknown as Record<string, unknown>[]}
            loading={isPending && formatted.length === 0}
          />
        )}
      </div>
    </div>
  );
}
