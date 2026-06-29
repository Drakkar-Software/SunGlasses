import { SectionHeading } from './ui/SectionHeading';

interface Row {
  feature: string;
  us: string;
  them: string;
  usGood: boolean;
}

const ROWS: Row[] = [
  { feature: 'Default consent state', us: 'Opted out', them: 'Opted in', usGood: true },
  { feature: 'PII sanitization', us: 'Automatic, built-in', them: 'Your problem', usGood: true },
  { feature: 'Anonymous ID source', us: 'Fresh UUID v4', them: 'Often device-derived', usGood: true },
  { feature: 'Self-hostable', us: 'Yes — S3 + DuckDB', them: 'Rarely', usGood: true },
  { feature: 'Cross-platform SDK', us: 'One surface (web + RN)', them: 'Usually separate libs', usGood: true },
  { feature: 'Open source', us: 'Yes · MIT', them: 'Sometimes', usGood: true },
  { feature: 'GDPR data export', us: 'exportUserData()', them: 'Vendor-dependent', usGood: true },
];

function Check({ good }: { good: boolean }) {
  if (good) {
    return (
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.75 10.5 18.75 19.5 5.25" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-destructive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}

export function Compare() {
  return (
    <section
      id="compare"
      aria-label="Comparison"
      className="py-24 px-5 sm:px-8"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-4xl mx-auto">
        <SectionHeading
          eyebrow="vs. the status quo"
          heading={
            <>
              Built for privacy.{' '}
              <span className="text-lens">Not bolted on.</span>
            </>
          }
          sub="Most SDKs are built to collect as much as possible and ask permission later. SunGlasses flips that model."
          className="mb-12"
        />

        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm" aria-label="SunGlasses vs typical analytics SDKs">
            <thead>
              <tr className="border-b border-border/60">
                <th scope="col" className="text-left px-5 py-3.5 text-muted-fg font-mono text-xs font-medium w-1/2">
                  Feature
                </th>
                <th scope="col" className="text-left px-5 py-3.5 font-heading font-bold text-sm text-lens w-1/4">
                  SunGlasses
                </th>
                <th scope="col" className="text-left px-5 py-3.5 text-muted-fg font-mono text-xs font-medium w-1/4">
                  Typical SDKs
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.feature}
                  className={[
                    'border-b border-border/30 last:border-0',
                    i % 2 === 0 ? '' : 'bg-surface/30',
                  ].join(' ')}
                >
                  <td className="px-5 py-3.5 text-muted-fg text-sm">{row.feature}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2 text-foreground font-medium">
                      <Check good={row.usGood} />
                      {row.us}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2 text-muted-fg">
                      <Check good={false} />
                      {row.them}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
