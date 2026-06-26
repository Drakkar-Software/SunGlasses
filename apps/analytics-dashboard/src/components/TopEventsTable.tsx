import { DataTable } from './DataTable';
import type { TopEventRow } from '../api';

interface Props {
  data: TopEventRow[];
  loading: boolean;
}

export function TopEventsTable({ data, loading }: Props) {
  return (
    <div className="panel">
      <h3 className="section-title">Top events</h3>
      <DataTable
        loading={loading}
        emptyMessage="No events in this range."
        columns={[
          { key: 'event', label: 'Event' },
          { key: 'event_type', label: 'Type' },
          { key: 'total', label: 'Count', align: 'right' },
          { key: 'unique_devices', label: 'Devices', align: 'right' },
        ]}
        rows={data as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
