import { DataTable } from './DataTable';
import type { TopErrorRow } from '../api';

interface Props {
  data: TopErrorRow[];
  loading: boolean;
}

export function ErrorsTable({ data, loading }: Props) {
  const rows = data.map((r) => ({
    error_type: r.error_type ?? '(unknown)',
    level: r.level ?? '—',
    occurrences: r.occurrences,
    affected_devices: r.affected_devices,
  }));

  return (
    <div className="panel">
      <h3 className="section-title">Top errors</h3>
      <DataTable
        loading={loading}
        emptyMessage="No errors in this range."
        columns={[
          { key: 'error_type', label: 'Type' },
          { key: 'level', label: 'Level' },
          { key: 'occurrences', label: 'Count', align: 'right' },
          { key: 'affected_devices', label: 'Devices', align: 'right' },
        ]}
        rows={rows}
      />
    </div>
  );
}
