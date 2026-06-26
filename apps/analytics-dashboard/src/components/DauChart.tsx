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

interface Props {
  data: DauRow[];
  loading: boolean;
}

export function DauChart({ data, loading }: Props) {
  const sorted = [...data].sort((a, b) => a.dt.localeCompare(b.dt));

  if (loading) {
    return <div className="chart-placeholder">Loading…</div>;
  }
  if (sorted.length === 0) {
    return <div className="chart-placeholder">No DAU data for this range.</div>;
  }

  return (
    <div className="chart-wrap">
      <h3 className="section-title">Daily active users</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={sorted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="dt" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="dau" name="DAU" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
