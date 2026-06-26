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
    <div className="date-controls">
      <label className="date-field">
        <span>From</span>
        <input
          type="date"
          value={range.from ?? ''}
          onChange={(e) => onChange({ ...range, from: e.target.value || undefined })}
        />
      </label>
      <label className="date-field">
        <span>To</span>
        <input
          type="date"
          value={range.to ?? ''}
          onChange={(e) => onChange({ ...range, to: e.target.value || undefined })}
        />
      </label>
      <div className="preset-group">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="preset-btn"
            onClick={() =>
              onChange({ ...range, from: daysAgo(p.days), to: daysAgo(0) })
            }
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="preset-btn"
          onClick={() => onChange({ ...range, from: undefined, to: undefined })}
        >
          All
        </button>
      </div>
    </div>
  );
}
