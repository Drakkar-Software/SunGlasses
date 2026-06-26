import { DataTable } from './DataTable';
import type { RetentionRow } from '../api';

interface Props {
  data: RetentionRow[];
  loading: boolean;
  day: number;
  onDayChange: (day: number) => void;
}

export function RetentionTable({ data, loading, day, onDayChange }: Props) {
  const rows = data.map((r) => ({
    cohort_date: r.cohort_date,
    cohort_size: r.cohort_size,
    retained: r.retained,
    retention_pct: `${r.retention_pct}%`,
  }));

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title">Retention cohorts</h3>
        <label className="inline-field">
          Day
          <input
            type="number"
            min={1}
            max={90}
            value={day}
            onChange={(e) => onDayChange(parseInt(e.target.value, 10) || 7)}
          />
        </label>
      </div>
      <DataTable
        loading={loading}
        emptyMessage="No cohort data for this range."
        columns={[
          { key: 'cohort_date', label: 'Cohort' },
          { key: 'cohort_size', label: 'Size', align: 'right' },
          { key: 'retained', label: `Day-${day}`, align: 'right' },
          { key: 'retention_pct', label: 'Rate', align: 'right' },
        ]}
        rows={rows}
      />
    </div>
  );
}
