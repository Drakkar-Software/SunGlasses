import type { OverviewData } from '../api';

interface Props {
  data: OverviewData | null;
  loading: boolean;
}

export function KpiCards({ data, loading }: Props) {
  const items = [
    {
      label: 'Total Events',
      value: data ? data.total_events.toLocaleString() : null,
    },
    {
      label: 'Unique Devices',
      value: data ? data.unique_devices.toLocaleString() : null,
    },
    {
      label: 'Latest DAU',
      value: data ? data.latest_dau.toLocaleString() : null,
      sub: data?.latest_dt ?? undefined,
    },
    {
      label: 'Errors',
      value: data ? data.total_errors.toLocaleString() : null,
      sub: data ? `${data.error_affected_devices.toLocaleString()} device${data.error_affected_devices !== 1 ? 's' : ''} affected` : undefined,
      danger: (data?.total_errors ?? 0) > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-fg">
            {item.label}
          </p>
          <p
            className={`mt-1.5 text-3xl font-bold tabular ${item.danger ? 'text-destructive' : 'text-foreground'}`}
          >
            {loading || item.value === null ? (
              <span className="skeleton inline-block w-16 h-8 rounded" />
            ) : (
              item.value
            )}
          </p>
          {item.sub ? (
            <p className="mt-1 text-xs text-muted-fg truncate">{item.sub}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
