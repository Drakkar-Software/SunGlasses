import { useEffect, useState } from 'react';
import { SunglassesMark } from './SunglassesMark';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/Button';

const DOCS_URL = 'https://drakkar-software.github.io/SunGlasses/';
const GITHUB_URL = 'https://github.com/Drakkar-Software/SunGlasses';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Privacy', href: '#pipeline' },
  { label: 'Packages', href: '#packages' },
];

function GithubIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-50 transition-all duration-200',
        scrolled ? 'glass border-b border-border py-2.5' : 'py-4',
      ].join(' ')}
    >
      <nav
        className="max-w-6xl mx-auto px-5 sm:px-8 flex items-center gap-4"
        aria-label="Main navigation"
      >
        {/* Brand */}
        <a
          href="#"
          className="flex items-center gap-2.5 text-foreground hover:text-lens transition-colors duration-150 shrink-0"
          aria-label="SunGlasses home"
        >
          <SunglassesMark size={26} />
          <span className="font-heading font-bold text-base tracking-tight hidden sm:inline">
            SunGlasses
          </span>
        </a>

        {/* Internal anchor links — hidden on small screens */}
        <ul className="hidden md:flex items-center gap-0.5 ml-6 list-none m-0 p-0" role="list">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                className="px-3 py-1.5 text-sm text-muted-fg hover:text-foreground rounded-lg hover:bg-surface-2 transition-colors duration-150 block"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* GitHub icon link */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View SunGlasses on GitHub"
            className="p-2 text-muted-fg hover:text-foreground rounded-lg hover:bg-surface-2 transition-colors duration-150 hidden sm:flex"
          >
            <GithubIcon />
          </a>

          <ThemeToggle />

          {/* Docs — primary CTA */}
          <Button
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            className="ml-1"
          >
            Docs
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </Button>
        </div>
      </nav>
    </header>
  );
}
