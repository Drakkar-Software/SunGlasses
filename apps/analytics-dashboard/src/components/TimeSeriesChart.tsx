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

interface Props {
  data: TimeseriesRow[];
  loading: boolean;
}

export function TimeSeriesChart({ data, loading }: Props) {
  if (loading) {
    return <div className="chart-placeholder">Loading…</div>;
  }
  if (data.length === 0) {
    return <div className="chart-placeholder">No data for this range.</div>;
  }

  return (
    <div className="chart-wrap">
      <h3 className="section-title">Event volume</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="dt" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="events"
            name="Events"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="unique_devices"
            name="Devices"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
