import { DataTable } from './DataTable';
import type { TopScreenRow } from '../api';

interface Props {
  data: TopScreenRow[];
  loading: boolean;
}

export function ScreensTable({ data, loading }: Props) {
  const rows = data.map((r) => ({
    path: r.path ?? '(unknown)',
    views: r.views,
    unique_devices: r.unique_devices,
  }));

  return (
    <div className="panel">
      <h3 className="section-title">Top screens</h3>
      <DataTable
        loading={loading}
        emptyMessage="No screen views in this range."
        columns={[
          { key: 'path', label: 'Path' },
          { key: 'views', label: 'Views', align: 'right' },
          { key: 'unique_devices', label: 'Devices', align: 'right' },
        ]}
        rows={rows}
      />
    </div>
  );
}
