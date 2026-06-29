import { useCallback, useEffect, useState, useTransition } from 'react';
import type { DateRangeParams, TopEventRow } from '../../api';
import { fetchTopEvents } from '../../api';
import { DataTable } from '../DataTable';

interface Props {
  range: DateRangeParams;
}

const COLUMNS = [
  { key: 'event',          label: 'Event' },
  { key: 'event_type',     label: 'Type' },
  { key: 'total',          label: 'Total',   align: 'right' as const },
  { key: 'unique_devices', label: 'Devices', align: 'right' as const },
];

export function EventsSection({ range }: Props) {
  const [rows, setRows]              = useState<TopEventRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const data = await fetchTopEvents({ ...range, limit: 50 });
    startTransition(() => setRows(data));
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Top events</p>
        <p className="text-xs text-muted-fg mt-0.5">Top 50 by total occurrences</p>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows as unknown as Record<string, unknown>[]}
        loading={isPending && rows.length === 0}
        emptyMessage="No events recorded in this range."
      />
    </div>
  );
}
