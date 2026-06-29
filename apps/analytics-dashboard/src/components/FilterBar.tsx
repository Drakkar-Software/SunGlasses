import type { DateRangeParams } from '../api';
import { AppSelector } from './AppSelector';
import { DateRangeControls } from './DateRangeControls';

interface Props {
  range: DateRangeParams;
  onRange: (r: DateRangeParams) => void;
  selectedApp: string | undefined;
  onApp: (app: string | undefined) => void;
  onMenuOpen: () => void;
  children?: React.ReactNode;
}

export function FilterBar({ range, onRange, selectedApp, onApp, onMenuOpen, children }: Props) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 flex-wrap bg-background/80 backdrop-blur-sm px-5 py-3 border-b border-border">
      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={onMenuOpen}
        className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-muted-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <AppSelector range={range} value={selectedApp} onChange={onApp} />
      <DateRangeControls range={range} onChange={onRange} />

      {children ? <div className="flex items-center gap-2 ml-auto">{children}</div> : null}
    </header>
  );
}
