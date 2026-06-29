import { useCallback, useEffect, useState } from 'react';
import type { ConfigStatus, DateRangeParams } from './api';
import {
  canAutoConnectFromBrowser,
  clearConfig,
  daysAgo,
  fetchConfigStatus,
  loadBrowserConfig,
  saveConfig,
} from './api';
import { DataSourcePanel } from './components/DataSourcePanel';
import { Sidebar } from './components/Sidebar';
import type { Section } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { OverviewSection } from './components/sections/OverviewSection';
import { EventsSection } from './components/sections/EventsSection';
import { ScreensSection } from './components/sections/ScreensSection';
import { ErrorsSection } from './components/sections/ErrorsSection';
import { RetentionSection } from './components/sections/RetentionSection';
import { QuerySection } from './components/sections/QuerySection';

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
  const [section, setSection]   = useState<Section>('overview');
  const [mobileOpen, setMobile] = useState(false);
  const [selectedApp, setApp]   = useState<string | undefined>(undefined);
  const [range, setRange]       = useState<DateRangeParams>({
    from: daysAgo(30),
    to:   daysAgo(0),
  });

  const rangeWithApp = { ...range, app: selectedApp };

  const handleDisconnect = useCallback(async () => {
    await clearConfig().catch(() => undefined);
    onDisconnect();
  }, [onDisconnect]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        section={section}
        onSection={setSection}
        status={status}
        onSynced={onStatusChange}
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
        />

        <main className="flex-1 overflow-y-auto p-5">
          <h1 className="sr-only">{SECTION_TITLE[section]}</h1>

          {section === 'overview'  ? <OverviewSection  range={rangeWithApp} /> : null}
          {section === 'events'    ? <EventsSection    range={rangeWithApp} /> : null}
          {section === 'screens'   ? <ScreensSection   range={rangeWithApp} /> : null}
          {section === 'errors'    ? <ErrorsSection    range={rangeWithApp} /> : null}
          {section === 'retention' ? <RetentionSection range={rangeWithApp} /> : null}
          {section === 'query'     ? <QuerySection /> : null}
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

  // Boot: fetch status and optionally auto-connect from saved browser config
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        let status = await fetchConfigStatus();
        if (!cancelled && !status.ready && canAutoConnectFromBrowser()) {
          const saved = loadBrowserConfig();
          if (saved?.mode === 'starfish' && saved.baseUrl && saved.app) {
            if (saved.publicRead || (saved.capJson && saved.devEdPrivHex)) {
              try {
                status = await saveConfig({
                  source:       'starfish',
                  baseUrl:      saved.baseUrl,
                  app:          saved.app,
                  publicRead:   saved.publicRead,
                  cap:          saved.capJson,
                  devEdPrivHex: saved.devEdPrivHex,
                });
              } catch { /* fall through to setup screen */ }
            }
          } else if (saved?.s3Bucket) {
            try {
              status = await saveConfig({
                source:          'direct_s3',
                s3Bucket:        saved.s3Bucket,
                s3Prefix:        saved.s3Prefix,
                awsRegion:       saved.awsRegion,
                endpointUrl:     saved.endpointUrl,
                useIam:          saved.useIam,
                accessKeyId:     saved.accessKeyId,
                secretAccessKey: saved.secretAccessKey,
              });
            } catch { /* fall through to setup screen */ }
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
            app:               null,
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
