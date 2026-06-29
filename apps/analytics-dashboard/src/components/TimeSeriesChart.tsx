import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TimeseriesRow } from '../api';
import { useChartTheme } from '../hooks/useChartTheme';
import { Empty } from './ui/Empty';

interface Props {
  data: TimeseriesRow[];
  loading: boolean;
}

export function TimeSeriesChart({ data, loading }: Props) {
  const t = useChartTheme();

  if (loading) {
    return <div className="skeleton rounded-xl h-[280px]" />;
  }
  if (data.length === 0) return <Empty />;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <p className="text-sm font-semibold text-foreground mb-4">Event volume</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
          <XAxis dataKey="dt" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} width={40} />
          <Tooltip />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="events"
            name="Events"
            stroke={t.chart1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="unique_devices"
            name="Devices"
            stroke={t.chart2}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
