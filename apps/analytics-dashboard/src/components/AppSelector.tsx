import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppInfo, DateRangeParams } from '../api';
import { fetchApps } from '../api';

interface Props {
  range: DateRangeParams;
  value: string | undefined;
  onChange: (app: string | undefined) => void;
}

export function AppSelector({ range, value, onChange }: Props) {
  const [apps, setApps]       = useState<AppInfo[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApps({ from: range.from, to: range.to });
      setApps(data);
    } catch {
      // non-critical — silently ignore
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const selectedLabel = value === undefined
    ? 'All apps'
    : value === '(unknown)'
    ? '(unknown)'
    : value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Select app"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-100"
      >
        <svg aria-hidden="true" className="w-3.5 h-3.5 text-muted-fg shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5 3 12m0 0 3.75 4.5M3 12h18M13.5 7.5 17.25 12m0 0L13.5 16.5" />
        </svg>
        <span className="max-w-[140px] truncate">{selectedLabel}</span>
        <svg aria-hidden="true" className="w-3.5 h-3.5 text-muted-fg shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Apps"
          className="absolute left-0 top-full z-30 mt-1.5 min-w-[200px] rounded-xl border border-border bg-card shadow-lg py-1 text-sm"
        >
          <AppOption
            label="All apps"
            count={apps.reduce((s, a) => s + a.events, 0)}
            selected={value === undefined}
            onSelect={() => { onChange(undefined); setOpen(false); }}
          />
          {loading ? (
            <li className="px-3 py-2 text-muted-fg text-xs">Loading…</li>
          ) : null}
          {apps.map((a) => (
            <AppOption
              key={a.app ?? '(unknown)'}
              label={a.app ?? '(unknown)'}
              count={a.events}
              selected={value === (a.app ?? '(unknown)')}
              onSelect={() => { onChange(a.app ?? '(unknown)'); setOpen(false); }}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AppOption({
  label, count, selected, onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      className={`flex items-center justify-between gap-4 px-3 py-2 cursor-pointer transition-colors duration-75 ${
        selected
          ? 'bg-primary/10 text-primary font-medium'
          : 'hover:bg-muted text-foreground'
      }`}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      tabIndex={0}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-fg tabular shrink-0">{count.toLocaleString()}</span>
    </li>
  );
}
