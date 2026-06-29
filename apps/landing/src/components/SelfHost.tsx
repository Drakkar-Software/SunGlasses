import { SectionHeading } from './ui/SectionHeading';

interface Step {
  n: number;
  title: string;
  description: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Self-host the ingest server',
    description: 'A Fastify + DuckDB HTTP endpoint receives batched events from your apps.',
    detail: 'Writes date-partitioned Parquet to S3, Cloudflare R2, or any S3-compatible object store. Validates, normalises, and stores — nothing more.',
  },
  {
    n: 2,
    title: 'Sync to local cache',
    description: 'Pull Parquet batches to a local cache directory, or query S3 directly with DuckDB\'s S3 integration.',
    detail: 'The Starfish local-sync adapter pulls only new partitions incrementally. Offline-capable: once cached, the dashboard runs with no live S3 connection.',
  },
  {
    n: 3,
    title: 'Explore in the analytics dashboard',
    description: 'A React + DuckDB web app runs entirely on your machine or private infra.',
    detail: 'DAU, event volume, error explorer with stack traces, Day-N retention cohorts, per-app filtering, and an ad-hoc SQL console. Light + dark mode. No per-seat pricing.',
  },
];

export function SelfHost() {
  return (
    <section
      id="selfhost"
      aria-label="Self-hosting"
      className="py-24 px-5 sm:px-8 bg-surface/30"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="Own your data"
          heading={
            <>
              No third-party cloud.{' '}
              <span className="text-glare">Ever.</span>
            </>
          }
          sub="Events go nowhere unless you wire an adapter. Self-host the full pipeline — ingest server, S3 Parquet storage, and the analytics dashboard — in your own infrastructure."
          className="mb-16"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {STEPS.map((step) => (
            <div key={step.n} className="relative">
              {/* Connector (desktop only) */}
              {step.n < STEPS.length && (
                <div
                  aria-hidden="true"
                  className="hidden lg:block absolute top-6 left-full w-6 h-px bg-border z-10"
                />
              )}

              <div className="glass rounded-2xl p-6 h-full flex flex-col gap-4">
                {/* Step number */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-glare-dim border border-glare/20 flex items-center justify-center font-mono text-xs font-bold text-glare shrink-0">
                    {step.n}
                  </div>
                  <h3 className="font-heading font-semibold text-foreground text-base leading-snug">
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{step.description}</p>
                <p className="text-xs text-muted-fg leading-relaxed border-t border-border/40 pt-4">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Dashboard feature callout */}
        <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-6">
          <div className="shrink-0">
            <div className="w-12 h-12 rounded-xl bg-glare-dim border border-glare/20 flex items-center justify-center text-2xl">
              ⌂
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-heading font-semibold text-foreground text-lg mb-2">
              What's in the analytics dashboard
            </h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm text-muted-fg list-none m-0 p-0">
              {DASHBOARD_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="text-glare shrink-0" aria-hidden="true">◆</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const DASHBOARD_FEATURES = [
  'Daily active users',
  'Event volume chart',
  'Error explorer + stack traces',
  'Day-N retention cohorts',
  'Top screens & events',
  'Per-app filtering',
  'Ad-hoc SQL console',
  'Light + dark mode',
  'No per-seat pricing',
];
