import { Button } from './ui/Button';
import { SectionHeading } from './ui/SectionHeading';

const DASHBOARD_URL = 'https://dashboard.sunglasses.drakkar.software';

const BARS = [
  { id: 'mon', label: 'M', pct: 61 },
  { id: 'tue', label: 'T', pct: 74 },
  { id: 'wed', label: 'W', pct: 68 },
  { id: 'thu', label: 'T', pct: 86 },
  { id: 'fri', label: 'F', pct: 93 },
  { id: 'sat', label: 'S', pct: 52 },
  { id: 'sun', label: 'S', pct: 47 },
];

const STAT_CARDS = [
  { label: 'Daily active users', value: '2,847', sub: '+8.3% vs prior', colorClass: 'text-lens' },
  { label: 'Events captured',    value: '41.2k', sub: '↑ from 38.1k',  colorClass: 'text-success' },
  { label: 'Error rate',         value: '1.2%',  sub: '↓ from 3.1%',   colorClass: 'text-destructive' },
];

const TOP_EVENTS = [
  { name: 'screen_view',      count: '18,402', delta: '+4.2%',  up: true  },
  { name: 'purchase_clicked', count: '3,271',  delta: '+11.8%', up: true  },
  { name: 'auth_error',       count: '142',    delta: '−23.1%', up: false },
];

const PILLS = [
  'DAU & retention cohorts',
  'Error explorer',
  'Ad-hoc SQL console',
  'Per-app filtering',
  'Light + dark mode',
  'No per-seat pricing',
];

export function DashboardShowcase() {
  return (
    <section
      id="dashboard"
      aria-label="Analytics dashboard showcase"
      className="py-24 px-5 sm:px-8 bg-ink"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.45fr] gap-12 lg:gap-20 items-center">

          {/* Copy + pills + CTA */}
          <div>
            <SectionHeading
              eyebrow="Analytics dashboard"
              heading={
                <>
                  Your data,{' '}
                  <span className="text-lens">finally legible.</span>
                </>
              }
              sub="A React + DuckDB app that runs on your machine or private infra. Query event Parquet files directly — no accounts, no per-seat pricing, no data leaving your infrastructure."
              className="mb-8"
            />

            <ul className="flex flex-wrap gap-2 list-none m-0 p-0 mb-8" aria-label="Dashboard features">
              {PILLS.map((pill) => (
                <li
                  key={pill}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono text-muted-fg bg-surface border border-border"
                >
                  <span className="text-lens shrink-0" aria-hidden="true">◆</span>
                  {pill}
                </li>
              ))}
            </ul>

            <Button
              href={DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              Open dashboard
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </Button>
          </div>

          {/* Mock dashboard preview */}
          <div className="relative">
            {/* diffuse lens glow behind the card */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 90% 90% at 50% 50%, color-mix(in srgb, var(--color-lens) 14%, transparent), transparent 70%)',
                filter: 'blur(48px)',
                transform: 'scale(1.35)',
              }}
            />

            <div className="relative glass rounded-2xl overflow-hidden">
              {/* App chrome header */}
              <div className="flex items-center justify-between px-4 py-3 bg-surface/60 border-b border-border/60">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-warn/50" />
                  <span className="w-2.5 h-2.5 rounded-full bg-success/50" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="animate-glare text-success leading-none"
                    style={{ fontSize: 9 }}
                    aria-hidden="true"
                  >
                    ●
                  </span>
                  <span className="font-mono text-[11px] text-muted-fg">sunglasses-dashboard</span>
                </div>
                <span className="font-mono text-[10px] text-muted-fg/60 bg-ink/60 px-2 py-0.5 rounded border border-border/40">
                  Last 30 days
                </span>
              </div>

              {/* Stat cards */}
              <div
                className="grid grid-cols-3 gap-px"
                style={{ background: 'var(--color-border)' }}
              >
                {STAT_CARDS.map(({ label, value, sub, colorClass }) => (
                  <div key={label} className="px-4 py-3 bg-surface/50">
                    <p className="font-mono text-[10px] text-muted-fg/70 uppercase tracking-wide mb-1 leading-tight">
                      {label}
                    </p>
                    <p className={`font-heading font-bold text-xl tabular ${colorClass}`}>{value}</p>
                    <p className="font-mono text-[10px] text-muted-fg/50 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              <div className="px-4 pt-4 pb-3 bg-ink/30 border-y border-border/40">
                <p className="font-mono text-[10px] text-muted-fg/60 uppercase tracking-wide mb-3">
                  Active users — this week
                </p>
                <div
                  className="flex items-end gap-1.5 h-14"
                  role="img"
                  aria-label="Bar chart of daily active users this week"
                >
                  {BARS.map(({ id, label, pct }) => (
                    <div key={id} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: 'var(--color-lens)',
                          opacity: 0.35 + (pct / 100) * 0.6,
                        }}
                      />
                      <span
                        className="font-mono text-muted-fg/50 leading-none"
                        style={{ fontSize: 9 }}
                        aria-hidden="true"
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top events table */}
              <div className="px-4 py-3">
                <p className="font-mono text-[10px] text-muted-fg/60 uppercase tracking-wide mb-2.5">
                  Top events
                </p>
                <div className="space-y-2">
                  {TOP_EVENTS.map(({ name, count, delta, up }) => (
                    <div key={name} className="flex items-center justify-between gap-4">
                      <span className="font-mono text-xs text-foreground/80 truncate">{name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs tabular text-muted-fg">{count}</span>
                        <span
                          className={`font-mono text-[10px] tabular ${up ? 'text-success' : 'text-destructive'}`}
                        >
                          {delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
