import { useCallback, useEffect, useState } from 'react';
import type { ConfigStatus, DateRangeParams } from './api';
import {
  clearConfig,
  connectLazyFromSaved,
  daysAgo,
  fetchConfigStatus,
  optimisticStatusFromSaved,
} from './api';
import { DataSourcePanel } from './components/DataSourcePanel';
import { Sidebar } from './components/Sidebar';
import type { Section } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { OverviewSection } from './components/sections/OverviewSection';
import { EventsSection } from './components/sections/EventsSection';
import { ScreensSection } from './components/sections/ScreensSection';
import { ErrorsSection } from './components/sections/ErrorsSection';
import { RetentionSection } from './components/sections/RetentionSection';
import { QuerySection } from './components/sections/QuerySection';
import { useDataVersion } from './hooks/useSyncStatus';

// ── Loading / Error screens ───────────────────────────────────────────────────

function FullScreenLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg
          aria-hidden="true"
          className="w-8 h-8 text-primary animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
        <p className="text-sm text-muted-fg">Connecting…</p>
      </div>
    </div>
  );
}

/**
 * Placeholder for the main content area while the engine registers cached
 * data (WASM init + IndexedDB rehydrate — local, no download). The shell
 * around it (sidebar, filters) is already interactive; background downloads
 * happen after this clears, with progress in the top bar.
 */
function PreparingData() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <svg
          aria-hidden="true"
          className="w-6 h-6 text-primary animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
        <p className="text-sm text-muted-fg">Preparing cached data…</p>
      </div>
    </div>
  );
}

// ── Section titles ────────────────────────────────────────────────────────────

const SECTION_TITLE: Record<Section, string> = {
  overview:  'Overview',
  events:    'Events',
  screens:   'Screens',
  errors:    'Errors',
  retention: 'Retention',
  query:     'Query console',
};

// ── App shell ─────────────────────────────────────────────────────────────────

function AppShell({
  status,
  onStatusChange,
  onDisconnect,
}: {
  status: ConfigStatus;
  onStatusChange: (s: ConfigStatus) => void;
  onDisconnect: () => void;
}) {
  const [section, setSection]       = useState<Section>('overview');
  const [mobileOpen, setMobile]     = useState(false);
  const [selectedApp, setApp]       = useState<string | undefined>(undefined);
  const [appSelectKey, setSelectKey] = useState(0);
  const [range, setRange]           = useState<DateRangeParams>({
    from: daysAgo(30),
    to:   daysAgo(0),
  });

  // 0 until the engine has registered data; bumped when a sync changes it.
  // Re-rendering here gives every section a fresh `range` identity, which
  // re-runs their queries — and gates them off before the engine is ready.
  const dataVersion = useDataVersion();
  const engineReady = dataVersion > 0;

  // Re-query the app dropdown once data lands (it keys off refreshKey, not range identity).
  useEffect(() => {
    if (dataVersion > 0) setSelectKey((k) => k + 1);
  }, [dataVersion]);

  const rangeWithApp = { ...range, app: selectedApp };

  const handleDisconnect = useCallback(async () => {
    await clearConfig().catch(() => undefined);
    onDisconnect();
  }, [onDisconnect]);

  // Increment key so AppSelector re-queries after an app is added or removed.
  const handleSynced = useCallback((s: ConfigStatus) => {
    onStatusChange(s);
    setSelectKey((k) => k + 1);
  }, [onStatusChange]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        section={section}
        onSection={setSection}
        status={status}
        onSynced={handleSynced}
        onChangeConnection={handleDisconnect}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobile(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <FilterBar
          range={range}
          onRange={setRange}
          selectedApp={selectedApp}
          onApp={setApp}
          onMenuOpen={() => setMobile(true)}
          appSelectKey={appSelectKey}
        >
          <SyncStatusIndicator />
        </FilterBar>

        <main className="flex-1 overflow-y-auto p-5">
          <h1 className="sr-only">{SECTION_TITLE[section]}</h1>

          {!engineReady ? (
            <PreparingData />
          ) : (
            <>
              {section === 'overview'  ? <OverviewSection  range={rangeWithApp} /> : null}
              {section === 'events'    ? <EventsSection    range={rangeWithApp} /> : null}
              {section === 'screens'   ? <ScreensSection   range={rangeWithApp} /> : null}
              {section === 'errors'    ? <ErrorsSection    range={rangeWithApp} /> : null}
              {section === 'retention' ? <RetentionSection range={rangeWithApp} /> : null}
              {section === 'query'     ? <QuerySection /> : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Root App component ────────────────────────────────────────────────────────

export function App() {
  const [configStatus,  setConfigStatus]  = useState<ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [showSetup,     setShowSetup]     = useState(false);

  // Boot: render the shell immediately from the saved browser config (if any)
  // and bring the engine up in the background — cached data first, then a
  // lazy download of new batches with progress in the top-bar indicator.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const status = await fetchConfigStatus();
        if (!status.ready) {
          const optimistic = optimisticStatusFromSaved();
          if (optimistic) {
            // Saved connection: show the dashboard now, connect lazily.
            if (!cancelled) {
              setConfigStatus(optimistic);
              setConfigLoading(false);
            }
            try {
              const final = await connectLazyFromSaved();
              if (!cancelled) setConfigStatus(final ?? status);
            } catch (e) {
              // Engine could not become ready at all — back to setup with the error.
              if (!cancelled) {
                setConfigStatus({
                  ...optimistic,
                  ready: false,
                  error: e instanceof Error ? e.message : 'Connection failed',
                });
              }
            }
            return;
          }
        }
        if (!cancelled) setConfigStatus(status);
      } catch (e) {
        if (!cancelled) {
          setConfigStatus({
            ready:             false,
            dataSource:        null,
            source:            null,
            bucket:            null,
            prefix:            'events',
            region:            'us-east-1',
            endpointUrl:       null,
            authMode:          'none',
            baseUrl:           null,
            apps:              [],
            cacheDir:          null,
            starfishPublicRead: false,
            sync:              null,
            error:             e instanceof Error ? e.message : 'Could not reach the API server',
          });
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleConnected = useCallback((status: ConfigStatus) => {
    setConfigStatus(status);
    setShowSetup(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    setConfigStatus(null);
    setShowSetup(true);
    setConfigLoading(false);
  }, []);

  if (configLoading) return <FullScreenLoading />;

  if (!configStatus?.ready || showSetup) {
    return (
      <DataSourcePanel
        status={configStatus}
        onConnected={handleConnected}
      />
    );
  }

  return (
    <AppShell
      status={configStatus}
      onStatusChange={setConfigStatus}
      onDisconnect={handleDisconnect}
    />
  );
}
