import { useCallback, useEffect, useState } from 'react';
import type { DateRangeParams, S3ConfigStatus } from './api';
import {
  daysAgo,
  fetchConfigStatus,
  fetchDau,
  fetchOverview,
  fetchRetention,
  fetchTimeseries,
  fetchTopErrors,
  fetchTopEvents,
  fetchTopScreens,
  type DauRow,
  type OverviewData,
  type RetentionRow,
  type TimeseriesRow,
  type TopErrorRow,
  type TopEventRow,
  type TopScreenRow,
} from './api';
import { DateRangeControls } from './components/DateRangeControls';
import { DauChart } from './components/DauChart';
import { ErrorsTable } from './components/ErrorsTable';
import { KpiCards } from './components/KpiCards';
import { QueryConsole } from './components/QueryConsole';
import { RetentionTable } from './components/RetentionTable';
import { S3ConfigPanel } from './components/S3ConfigPanel';
import { ScreensTable } from './components/ScreensTable';
import { TimeSeriesChart } from './components/TimeSeriesChart';
import { TopEventsTable } from './components/TopEventsTable';

type Tab = 'overview' | 'breakdowns' | 'retention' | 'query';

export function App() {
  const [s3Status, setS3Status] = useState<S3ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<DateRangeParams>({
    from: daysAgo(30),
    to: daysAgo(0),
  });
  const [retentionDay, setRetentionDay] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesRow[]>([]);
  const [dau, setDau] = useState<DauRow[]>([]);
  const [topEvents, setTopEvents] = useState<TopEventRow[]>([]);
  const [topScreens, setTopScreens] = useState<TopScreenRow[]>([]);
  const [topErrors, setTopErrors] = useState<TopErrorRow[]>([]);
  const [retention, setRetention] = useState<RetentionRow[]>([]);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingBreakdowns, setLoadingBreakdowns] = useState(false);
  const [loadingRetention, setLoadingRetention] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchConfigStatus();
        if (!cancelled) setS3Status(status);
      } catch (e) {
        if (!cancelled) {
          setS3Status({
            ready: false,
            source: null,
            bucket: null,
            prefix: 'events',
            region: 'us-east-1',
            endpointUrl: null,
            authMode: 'none',
            error: e instanceof Error ? e.message : 'Could not reach the API server',
          });
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnected = useCallback((status: S3ConfigStatus) => {
    setS3Status(status);
    setShowSettings(false);
    setError(null);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const [ov, ts, dauData] = await Promise.all([
        fetchOverview(range),
        fetchTimeseries(range),
        fetchDau(range),
      ]);
      setOverview(ov);
      setTimeseries(ts);
      setDau(dauData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoadingOverview(false);
    }
  }, [range]);

  const loadBreakdowns = useCallback(async () => {
    setLoadingBreakdowns(true);
    setError(null);
    try {
      const [events, screens, errors] = await Promise.all([
        fetchTopEvents(range),
        fetchTopScreens(range),
        fetchTopErrors(range),
      ]);
      setTopEvents(events);
      setTopScreens(screens);
      setTopErrors(errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load breakdowns');
    } finally {
      setLoadingBreakdowns(false);
    }
  }, [range]);

  const loadRetention = useCallback(async () => {
    setLoadingRetention(true);
    setError(null);
    try {
      const data = await fetchRetention({ ...range, day: retentionDay });
      setRetention(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retention');
    } finally {
      setLoadingRetention(false);
    }
  }, [range, retentionDay]);

  const dashboardReady = s3Status?.ready === true && !showSettings;

  useEffect(() => {
    if (!dashboardReady || tab !== 'overview') return;
    void loadOverview();
  }, [dashboardReady, tab, loadOverview]);

  useEffect(() => {
    if (!dashboardReady || tab !== 'breakdowns') return;
    void loadBreakdowns();
  }, [dashboardReady, tab, loadBreakdowns]);

  useEffect(() => {
    if (!dashboardReady || tab !== 'retention') return;
    void loadRetention();
  }, [dashboardReady, tab, loadRetention]);

  if (configLoading) {
    return (
      <div className="setup-screen">
        <div className="setup-card setup-loading">Loading…</div>
      </div>
    );
  }

  if (!s3Status?.ready || showSettings) {
    return <S3ConfigPanel status={s3Status} onConnected={handleConnected} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdowns', label: 'Breakdowns' },
    { id: 'retention', label: 'Retention' },
    { id: 'query', label: 'Query' },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>SunGlasses Analytics</h1>
          <p className="subtitle">
            {s3Status.source ? (
              <>
                <span className="source-label">{s3Status.source}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowSettings(true)}
                >
                  Change S3
                </button>
              </>
            ) : (
              'Read-only dashboard over S3 Parquet'
            )}
          </p>
        </div>
        <DateRangeControls range={range} onChange={setRange} />
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="main">
        {tab === 'overview' && (
          <>
            <KpiCards data={overview} loading={loadingOverview} />
            <TimeSeriesChart data={timeseries} loading={loadingOverview} />
            <DauChart data={dau} loading={loadingOverview} />
          </>
        )}

        {tab === 'breakdowns' && (
          <div className="breakdowns-grid">
            <TopEventsTable data={topEvents} loading={loadingBreakdowns} />
            <ScreensTable data={topScreens} loading={loadingBreakdowns} />
            <ErrorsTable data={topErrors} loading={loadingBreakdowns} />
          </div>
        )}

        {tab === 'retention' && (
          <RetentionTable
            data={retention}
            loading={loadingRetention}
            day={retentionDay}
            onDayChange={setRetentionDay}
          />
        )}

        {tab === 'query' && <QueryConsole />}
      </main>
    </div>
  );
}
