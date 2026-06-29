import { SunglassesMark } from './SunglassesMark';
import { Button } from './ui/Button';

const DOCS_URL = 'https://drakkar-software.github.io/SunGlasses/';
const GITHUB_URL = 'https://github.com/Drakkar-Software/SunGlasses';
const DASHBOARD_URL = 'https://dashboard.sunglasses.drakkar.software';

const DOC_LINKS = [
  { label: 'Getting started', href: `${DOCS_URL}getting-started/intro` },
  { label: 'Web setup', href: `${DOCS_URL}getting-started/web-setup` },
  { label: 'React Native setup', href: `${DOCS_URL}getting-started/react-native-setup` },
  { label: 'Consent', href: `${DOCS_URL}privacy/consent` },
  { label: 'PII sanitization', href: `${DOCS_URL}privacy/pii-sanitization` },
  { label: 'Error capture', href: `${DOCS_URL}guides/error-capture` },
  { label: 'Screen tracking', href: `${DOCS_URL}guides/screen-tracking` },
  { label: 'Config reference', href: `${DOCS_URL}reference/config` },
];

const PKG_LINKS = [
  { label: '@drakkar.software/sunglasses-core', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-core' },
  { label: '@drakkar.software/sunglasses-react', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-react' },
  { label: '@drakkar.software/sunglasses-react-native', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-react-native' },
  { label: 'storage-localstorage', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-storage-localstorage' },
  { label: 'storage-async-storage', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-storage-async-storage' },
  { label: 'storage-http', href: 'https://www.npmjs.com/package/@drakkar.software/sunglasses-storage-http' },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 pt-16 pb-10 px-5 sm:px-8 bg-ink">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-14">

          {/* Brand column */}
          <div className="lg:col-span-1">
            <a
              href="#"
              className="flex items-center gap-2.5 text-foreground hover:text-lens transition-colors mb-4"
              aria-label="SunGlasses home"
            >
              <SunglassesMark size={30} />
              <span className="font-heading font-bold text-base">SunGlasses</span>
            </a>
            <p className="text-sm text-muted-fg leading-relaxed mb-6">
              Privacy-first event tracking for React, React Native &amp; Expo.
              Zero PII. Zero drama.
            </p>
            <Button
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              Read the docs
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </Button>
          </div>

          {/* Documentation links */}
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-fg mb-4">
              Documentation
            </p>
            <ul className="space-y-2.5 list-none m-0 p-0">
              {DOC_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-fg hover:text-lens transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Package links */}
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-fg mb-4">
              npm packages
            </p>
            <ul className="space-y-2.5 list-none m-0 p-0">
              {PKG_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-muted-fg hover:text-lens transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Final CTA column */}
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-fg mb-4">
              Ship with confidence
            </p>
            <p className="text-sm text-muted-fg leading-relaxed mb-5">
              Your data stays on your infrastructure. No third-party cloud, no per-seat pricing,
              no surprises in GDPR audits.
            </p>
            <a
              href={DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-fg hover:text-lens transition-colors mb-3"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Analytics dashboard
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-fg hover:text-foreground transition-colors"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-8 border-t border-border/40">
          <p className="text-xs text-muted-fg/60">
            © {year} Drakkar Software. Released under the MIT License.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={`${DOCS_URL}privacy/pii-sanitization`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-fg/60 hover:text-muted-fg transition-colors"
            >
              Privacy model
            </a>
            <a
              href={`${DOCS_URL}contributing/privacy-invariants`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-fg/60 hover:text-muted-fg transition-colors"
            >
              Privacy invariants
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
