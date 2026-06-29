import type { DateRangeParams } from '../api';
import { daysAgo } from '../api';

interface Props {
  range: DateRangeParams;
  onChange: (range: DateRangeParams) => void;
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

export function DateRangeControls({ range, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex flex-col gap-1">
        <span className="sr-only">From date</span>
        <input
          type="date"
          aria-label="From date"
          value={range.from ?? ''}
          onChange={(e) => onChange({ ...range, from: e.target.value || undefined })}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>
      <span className="text-muted-fg text-xs">→</span>
      <label className="flex flex-col gap-1">
        <span className="sr-only">To date</span>
        <input
          type="date"
          aria-label="To date"
          value={range.to ?? ''}
          onChange={(e) => onChange({ ...range, to: e.target.value || undefined })}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        />
      </label>
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ ...range, from: daysAgo(p.days), to: daysAgo(0) })}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-75"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...range, from: undefined, to: undefined })}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-75"
        >
          All
        </button>
      </div>
    </div>
  );
}
