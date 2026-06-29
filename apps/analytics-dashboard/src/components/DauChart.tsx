import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DauRow } from '../api';
import { useChartTheme } from '../hooks/useChartTheme';
import { Empty } from './ui/Empty';

interface Props {
  data: DauRow[];
  loading: boolean;
}

export function DauChart({ data, loading }: Props) {
  const t      = useChartTheme();
  const sorted = [...data].sort((a, b) => a.dt.localeCompare(b.dt));

  if (loading) return <div className="skeleton rounded-xl h-[260px]" />;
  if (sorted.length === 0) return <Empty message="No DAU data for this range." />;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <p className="text-sm font-semibold text-foreground mb-4">Daily active users</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={sorted} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
          <XAxis dataKey="dt" tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: t.muted }} tickLine={false} axisLine={false} width={40} />
          <Tooltip />
          <Bar dataKey="dau" name="DAU" fill={t.chart3} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
