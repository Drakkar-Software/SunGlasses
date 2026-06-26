import type { OverviewData } from '../api';

interface Props {
  data: OverviewData | null;
  loading: boolean;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function KpiCards({ data, loading }: Props) {
  const items = [
    { label: 'Total events', value: data ? fmt(data.total_events) : '—' },
    { label: 'Unique devices', value: data ? fmt(data.unique_devices) : '—' },
    { label: 'Distinct events', value: data ? fmt(data.distinct_events) : '—' },
    {
      label: 'Latest DAU',
      value: data ? fmt(data.latest_dau) : '—',
      sub: data?.latest_dt ?? undefined,
    },
  ];

  return (
    <div className={`kpi-grid${loading ? ' loading' : ''}`}>
      {items.map((item) => (
        <div key={item.label} className="kpi-card">
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value">{item.value}</div>
          {item.sub ? <div className="kpi-sub">{item.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}
