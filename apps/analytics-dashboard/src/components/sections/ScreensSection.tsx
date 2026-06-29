import { useCallback, useEffect, useState, useTransition } from 'react';
import type { DateRangeParams, TopScreenRow } from '../../api';
import { fetchTopScreens } from '../../api';
import { DataTable } from '../DataTable';

interface Props {
  range: DateRangeParams;
}

const COLUMNS = [
  { key: 'path',           label: 'Screen / Path' },
  { key: 'views',          label: 'Views',   align: 'right' as const },
  { key: 'unique_devices', label: 'Devices', align: 'right' as const },
];

export function ScreensSection({ range }: Props) {
  const [rows, setRows]              = useState<TopScreenRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const data = await fetchTopScreens({ ...range, limit: 50 });
    startTransition(() => setRows(data));
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Top screens</p>
        <p className="text-xs text-muted-fg mt-0.5">Top 50 by total views</p>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={isPending && rows.length === 0}
        emptyMessage="No screen events recorded in this range."
      />
    </div>
  );
}
