import { GlassCard } from './ui/GlassCard';
import { SectionHeading } from './ui/SectionHeading';

interface Feature {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}

const FEATURES: Feature[] = [
  {
    icon: '⊘',
    title: 'Opt-out by default',
    description:
      'Zero data collected until the user explicitly consents. Flip to opt-in-by-default with a single config flag. The consent gate is unconditional — every public method checks before any I/O.',
    badge: 'defaultOptIn: false',
  },
  {
    icon: '⌫',
    title: 'Automatic PII sanitization',
    description:
      'Emails, phone numbers, credit card patterns, and IPv4 addresses are stripped from every event before they touch storage or the wire. Not opt-in. Always on. PiiSanitizer runs before any middleware.',
    badge: 'always first',
  },
  {
    icon: '◎',
    title: 'Anonymous by design',
    description:
      'Stable UUIDs generated locally — never derived from user data or device fingerprints. The only bridge from anonymous to known is an explicit identify() call. distinctId is never logged.',
  },
  {
    icon: '⚡',
    title: 'Built-in error capture',
    description:
      'captureException, SunglassesErrorBoundary, global error handlers, and unhandled rejection tracking — all consent-gated and PII-sanitized. Drop your error SDK for the events you actually need.',
    badge: 'no Sentry required',
  },
  {
    icon: '⬡',
    title: 'Middleware pipeline',
    description:
      'Drop, transform, or enrich events before they leave the device. Composable, async, and typed. Write sampling, enrichment, or filtering rules as pure functions.',
    badge: 'composable',
  },
  {
    icon: '⊕',
    title: 'Pluggable storage & output',
    description:
      'Persist to localStorage or AsyncStorage. Push via batched HTTP with exponential-backoff retry and at-least-once delivery. Bring your own IStorageAdapter or IAnalyticsAdapter.',
  },
  {
    icon: '⌂',
    title: 'Self-hosted dashboard',
    description:
      'Query your events with DuckDB over S3-compatible Parquet. DAU, event volume, error explorer with stack traces, Day-N retention cohorts, per-app filtering, and a SQL console. No cloud, no per-seat pricing.',
    badge: 'no cloud required',
  },
  {
    icon: '◈',
    title: 'TypeScript-first',
    description:
      'Every interface, event shape, adapter contract, and config option is fully typed. IDE auto-complete from setup to middleware to custom adapters. Zero runtime any.',
  },
];

export function Features() {
  return (
    <section
      id="features"
      aria-label="Features"
      className="py-24 px-5 sm:px-8"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="What's included"
          heading="Everything you need. Nothing you don't."
          sub="Eight carefully considered features — each one a deliberate choice, not a default. Together they cover the full lifecycle of privacy-first product analytics."
          center
          className="mb-16"
        />

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 list-none m-0 p-0">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <GlassCard className="h-full flex flex-col gap-3 hover:border-lens/30 transition-colors duration-200">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-lens-dim flex items-center justify-center text-lens text-xl shrink-0">
                  {f.icon}
                </div>

                {/* Title + badge */}
                <div className="flex items-start gap-2 flex-wrap">
                  <h3 className="font-heading font-semibold text-base text-foreground leading-snug">
                    {f.title}
                  </h3>
                  {f.badge !== undefined && (
                    <span className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-lens-dim text-lens border border-lens/20 shrink-0 leading-none mt-0.5">
                      {f.badge}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-muted-fg leading-relaxed flex-1">
                  {f.description}
                </p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
