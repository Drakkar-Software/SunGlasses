import { SectionHeading } from './ui/SectionHeading';

interface PipelineStep {
  n: number;
  label: string;
  code: string;
  note: string;
  highlight?: boolean;
}

const STEPS: PipelineStep[] = [
  {
    n: 1,
    label: 'Capture',
    code: 'client.capture(event)',
    note: 'Public API — track, screen, identify, alias. All consent-gated.',
  },
  {
    n: 2,
    label: 'PiiSanitizer',
    code: '// always first, unconditionally',
    note: 'Strips emails, phones, cards before anything else. Cannot be removed or reordered.',
    highlight: true,
  },
  {
    n: 3,
    label: 'Consent gate',
    code: 'if (!canCapture()) return',
    note: 'Zero I/O when opted out. No queue writes, no network calls.',
  },
  {
    n: 4,
    label: 'Middleware',
    code: 'pipeline.process(event)',
    note: 'Your custom enrichment, sampling, or filtering. Async, composable.',
  },
  {
    n: 5,
    label: 'Queue',
    code: 'storage.write(batch)',
    note: 'Persisted locally via IStorageAdapter. Survives app restarts.',
  },
  {
    n: 6,
    label: 'Batch flush',
    code: 'adapter.send(batch)',
    note: 'Exponential-backoff retry. At-least-once delivery. Events stay queued on failure.',
  },
  {
    n: 7,
    label: 'Your ingest',
    code: '→ S3 Parquet',
    note: 'Self-hosted Fastify server → date-partitioned Parquet → DuckDB dashboard.',
  },
];

export function Pipeline() {
  return (
    <section
      id="pipeline"
      aria-label="Event pipeline"
      className="py-24 px-5 sm:px-8 bg-surface/30"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="How events travel"
          heading={
            <>
              Privacy is built into the{' '}
              <span className="text-lens">pipeline</span>.
            </>
          }
          sub="Every event passes through the same ordered stages on-device. PiiSanitizer always runs first — before consent, before middleware, before anything you write."
          className="mb-16"
        />

        {/* Pipeline — horizontal on desktop, vertical on mobile */}
        <div className="relative">
          {/* Connector line (desktop only) */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
          />

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 list-none m-0 p-0">
            {STEPS.map((step) => (
              <li key={step.n}>
                <div
                  className={[
                    'relative flex lg:flex-col items-start lg:items-center gap-4 lg:gap-3 p-4 rounded-xl border transition-colors duration-150',
                    step.highlight
                      ? 'bg-lens-dim border-lens/30 shadow-sm shadow-lens/10'
                      : 'bg-surface/60 border-border/50 hover:border-border',
                  ].join(' ')}
                >
                  {/* Step number */}
                  <div
                    className={[
                      'flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold font-mono shrink-0',
                      step.highlight
                        ? 'bg-lens text-lens-fg'
                        : 'bg-surface-2 text-muted-fg border border-border',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {step.n}
                  </div>

                  <div className="lg:text-center">
                    {/* Label */}
                    <p
                      className={[
                        'font-heading font-semibold text-sm mb-1',
                        step.highlight ? 'text-lens' : 'text-foreground',
                      ].join(' ')}
                    >
                      {step.label}
                    </p>

                    {/* Code snippet */}
                    <p className="font-mono text-[11px] text-muted-fg mb-2 leading-snug">
                      {step.code}
                    </p>

                    {/* Explanatory note */}
                    <p className="text-xs text-muted-fg leading-snug hidden lg:block">
                      {step.note}
                    </p>
                  </div>

                  {/* Mobile: note shown inline */}
                  <p className="text-xs text-muted-fg leading-snug lg:hidden">
                    {step.note}
                  </p>

                  {/* Highlight glow badge */}
                  {step.highlight && (
                    <span
                      className="absolute -top-2 left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-lens text-lens-fg font-bold whitespace-nowrap"
                      aria-label="Always runs first"
                    >
                      always first
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Invariant callout */}
        <div className="mt-12 glass rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-lens-dim flex items-center justify-center text-lens text-xl shrink-0">
            ⌫
          </div>
          <div>
            <p className="font-heading font-semibold text-foreground mb-1">
              PiiSanitizer is unconditionally prepended
            </p>
            <p className="text-sm text-muted-fg leading-relaxed">
              You cannot remove it, reorder it, or skip it. It runs before your middleware,
              before storage writes, before any network call. Even if your middleware throws,
              PII was already gone.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
