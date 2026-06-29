import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sg-landing-theme';

function getSystemPreference(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null;
  applyTheme(saved ?? getSystemPreference());
}

/** "Shades on" = dark mode / "Shades off" = light mode */
export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    applyTheme(dark ? 'dark' : 'light');
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light mode (shades off)' : 'Switch to dark mode (shades on)'}
      onClick={() => setDark((d) => !d)}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-fg hover:text-foreground hover:bg-surface-2 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lens"
    >
      {dark ? (
        /* Sun — shades off */
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ) : (
        /* Moon — shades on */
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
      <span className="hidden sm:inline text-xs font-mono tracking-tight">
        {dark ? 'Shades off' : 'Shades on'}
      </span>
    </button>
  );
}
