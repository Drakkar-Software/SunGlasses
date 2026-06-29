import { useCallback, useEffect, useState, useTransition } from 'react';
import type { DateRangeParams, OverviewData, TimeseriesRow, DauRow } from '../../api';
import { fetchOverview, fetchTimeseries, fetchDau } from '../../api';
import { KpiCards } from '../KpiCards';
import { TimeSeriesChart } from '../TimeSeriesChart';
import { DauChart } from '../DauChart';

interface Props {
  range: DateRangeParams;
}

export function OverviewSection({ range }: Props) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesRow[]>([]);
  const [dau, setDau]              = useState<DauRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const [ov, ts, d] = await Promise.all([
      fetchOverview(range),
      fetchTimeseries(range),
      fetchDau({ ...range, limit: 30 }),
    ]);
    startTransition(() => {
      setOverview(ov);
      setTimeseries(ts);
      setDau(d);
    });
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <KpiCards data={overview} loading={isPending && overview === null} />
      <TimeSeriesChart data={timeseries} loading={isPending && timeseries.length === 0} />
      <DauChart data={dau} loading={isPending && dau.length === 0} />
    </div>
  );
}
