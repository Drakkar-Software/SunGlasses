import type { ConfigStatus } from '../api';
import { ThemeToggle } from './ThemeToggle';
import { SyncBar } from './DataSourcePanel';
import { AppManager } from './AppManager';

export type Section = 'overview' | 'events' | 'screens' | 'errors' | 'retention' | 'query';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
  {
    id: 'events',
    label: 'Events',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
  },
  {
    id: 'screens',
    label: 'Screens',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
  {
    id: 'errors',
    label: 'Errors',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  {
    id: 'retention',
    label: 'Retention',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    id: 'query',
    label: 'Query',
    icon: (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

interface Props {
  section: Section;
  onSection: (s: Section) => void;
  status: ConfigStatus;
  onSynced: (next: ConfigStatus) => void;
  onChangeConnection: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ section, onSection, status, onSynced, onChangeConnection, mobileOpen, onMobileClose }: Props) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      ) : null}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col w-[var(--sidebar-width)]
          bg-sidebar transition-transform duration-200
          lg:translate-x-0 lg:static lg:z-auto
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
          <svg aria-hidden="true" className="w-6 h-6 text-sidebar-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span className="text-sm font-semibold text-white tracking-tight">SunGlasses</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Sections">
          <ul role="list" className="space-y-0.5">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { onSection(item.id); onMobileClose(); }}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                      transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active
                      ${active
                        ? 'bg-sidebar-active-bg text-sidebar-active'
                        : 'text-sidebar-fg hover:bg-white/5 hover:text-white'}
                    `}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/10 space-y-2">
          <AppManager status={status} onChanged={onSynced} />
          <SyncBar status={status} onSynced={onSynced} compact />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onChangeConnection}
              className="text-xs text-sidebar-fg hover:text-white transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sidebar-active rounded"
            >
              {status.source ? (
                <span className="truncate max-w-[140px] block">{status.source}</span>
              ) : 'Change connection'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}
