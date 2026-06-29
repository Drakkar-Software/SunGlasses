import { useEffect, useRef, useState, useTransition } from 'react';

/** A single JSON-like field row in the mock event card. */
function EventField({
  label,
  value,
  pii = false,
  redacted = false,
}: {
  label: string;
  value: string;
  pii?: boolean;
  redacted?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const target = pii && redacted ? '[redacted]' : value;
    if (displayValue === target) return;
    setFading(true);
    const t = setTimeout(() => {
      setDisplayValue(target);
      setFading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [pii, redacted, value, displayValue]);

  const isRedacted = displayValue === '[redacted]';

  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-muted-fg font-mono text-xs shrink-0">{label}:</span>
      <span
        className={[
          'font-mono text-xs transition-opacity duration-200',
          fading ? 'opacity-0' : 'opacity-100',
          isRedacted
            ? 'text-lens font-medium'
            : pii
              ? 'text-warn'
              : 'text-foreground',
        ].join(' ')}
      >
        {isRedacted ? displayValue : `"${displayValue}"`}
      </span>
      {pii && !isRedacted && (
        <span
          aria-hidden="true"
          className="text-[10px] font-mono text-warn/60 border border-warn/20 rounded px-1 py-0 leading-tight shrink-0"
        >
          PII
        </span>
      )}
    </div>
  );
}

interface Props {
  /** Whether the user has consented. Controls whether the stream runs. */
  optedIn: boolean;
}

/**
 * Interactive PII-redaction demo — the landing page's signature element.
 *
 * Shows a mock event with PII fields. A frosted lens sweeps over the card
 * and the PII fields transition to `[redacted]`. An opt-in/opt-out toggle
 * demonstrates the consent gate: zero I/O when opted out.
 */
export function RedactionLens({ optedIn }: Props) {
  const [lensActive, setLensActive] = useState(false);
  const [sweepDone, setSweepDone] = useState(false);
  const [startSweep, setStartSweep] = useState(false);
  const prefersReduced = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  // Trigger the sweep after a short delay so it feels intentional, not rushed.
  useEffect(() => {
    if (prefersReduced.current) {
      setLensActive(true);
      setSweepDone(true);
      return;
    }
    const t = setTimeout(() => setStartSweep(true), 700);
    return () => clearTimeout(t);
  }, []);

  function handleSweepEnd() {
    setSweepDone(true);
    setLensActive(true);
  }

  const showLens = optedIn && startSweep && !sweepDone;
  const isRedacted = lensActive && optedIn;

  return (
    <div className="relative">
      {/* ── Mock event card ───────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden relative">
        {/* Card header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-warn/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <span className="font-mono text-xs text-muted-fg ml-1">SunglassesCore</span>
        </div>

        {/* Event payload */}
        <div className="px-4 py-3.5 space-y-0.5">
          <div className="text-muted-fg font-mono text-xs mb-2">
            {'{'}<span className="ml-1 text-lens-dim">// event payload</span>
          </div>
          <div className="pl-3 space-y-1">
            <EventField label="  event" value="form_submitted" />
            <EventField label="  email" value="alex@example.com" pii redacted={isRedacted} />
            <EventField label="  phone" value="+1 555 867-5309" pii redacted={isRedacted} />
            <EventField label="  plan" value="pro" />
            <EventField label="  amount" value="99" />
          </div>
          <div className="text-muted-fg font-mono text-xs mt-2">{'}'}</div>
        </div>

        {/* The lens sweep — a frosted vertical strip that passes over the card */}
        {showLens && (
          <div
            role="presentation"
            aria-hidden="true"
            className="animate-lens-sweep pointer-events-none absolute inset-y-0 w-2/5"
            style={{
              background:
                'linear-gradient(to right, transparent 0%, color-mix(in srgb, var(--color-lens) 12%, transparent) 20%, color-mix(in srgb, var(--color-lens) 22%, transparent) 50%, color-mix(in srgb, var(--color-lens) 12%, transparent) 80%, transparent 100%)',
              backdropFilter: 'blur(3px) saturate(1.4)',
            }}
            onAnimationEnd={handleSweepEnd}
          />
        )}

        {/* Consent gate overlay — dims the card when opted out */}
        {!optedIn && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl"
            style={{
              background: 'color-mix(in srgb, var(--color-ink) 80%, transparent)',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-muted-fg animate-pulse" />
              <span className="font-mono text-sm font-semibold text-foreground">Stream paused</span>
            </div>
            <p className="font-mono text-xs text-muted-fg">Zero events captured until you opt in</p>
          </div>
        )}
      </div>

      {/* ── Sanitizer status badge ────────────────────────────────── */}
      {isRedacted && (
        <div className="flex items-center gap-1.5 mt-3 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-glare" />
          <span className="font-mono text-xs text-success">PiiSanitizer ran first — always</span>
        </div>
      )}
      {!lensActive && optedIn && (
        <div className="flex items-center gap-1.5 mt-3 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-warn" />
          <span className="font-mono text-xs text-warn">PII exposed — applying sanitizer…</span>
        </div>
      )}
    </div>
  );
}
