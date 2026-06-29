import { useState, useTransition } from 'react';
import { Button } from './ui/Button';
import { CopyButton } from './ui/CopyButton';
import { RedactionLens } from './RedactionLens';

const DOCS_URL = 'https://drakkar-software.github.io/SunGlasses/';
const GITHUB_URL = 'https://github.com/Drakkar-Software/SunGlasses';
const INSTALL_CMD = 'npm i @drakkar.software/sunglasses-react';

export function Hero() {
  const [optedIn, setOptedIn] = useState(true);
  const [, startTransition] = useTransition();

  function handleConsentToggle() {
    startTransition(() => setOptedIn((v) => !v));
  }

  return (
    <section
      className="bg-hero min-h-screen flex items-center pt-24 pb-20 px-5 sm:px-8"
      aria-label="Hero"
    >
      <div className="max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Left: copy + CTAs ──────────────────────────────── */}
          <div className="animate-fade-up">
            {/* Eyebrow */}
            <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-lens mb-6">
              <span className="w-4 h-px bg-lens" aria-hidden="true" />
              Privacy-first analytics
            </p>

            {/* Headline */}
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-[4rem] xl:text-[4.5rem] font-bold text-foreground leading-[1.08] tracking-tight mb-6">
              Privacy you can{' '}
              <span className="text-lens">see through.</span>
            </h1>

            {/* Subhead */}
            <p className="text-lg sm:text-xl text-muted-fg leading-relaxed mb-10 max-w-xl">
              Track screen views, button taps, and custom events across React, React Native &amp; Expo —
              with PII stripped automatically, opt-out consent by default, and zero third-party cloud required.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Button
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                size="lg"
              >
                Read the docs
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M7 7h10v10" />
                </svg>
              </Button>
              <Button
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="lg"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
                </svg>
                GitHub
              </Button>
            </div>

            {/* Install chip */}
            <div className="inline-flex items-center gap-2 glass rounded-xl px-4 py-2.5">
              <span className="text-muted-fg font-mono text-xs select-none">$</span>
              <code className="font-mono text-sm text-foreground">{INSTALL_CMD}</code>
              <CopyButton text={INSTALL_CMD} />
            </div>
          </div>

          {/* ── Right: interactive demo ────────────────────────── */}
          <div className="animate-fade-up" style={{ animationDelay: '0.12s' }}>
            <RedactionLens optedIn={optedIn} />

            {/* Consent toggle */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={optedIn}
                aria-label={optedIn ? 'Opt out of event tracking' : 'Opt in to event tracking'}
                onClick={handleConsentToggle}
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors duration-200 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-lens',
                  optedIn ? 'bg-lens border-transparent' : 'bg-surface-2 border-border',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-px',
                    optedIn ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
              <span className="font-mono text-xs text-muted-fg">
                {optedIn ? (
                  <span className="text-success">opted in</span>
                ) : (
                  <span className="text-warn">opted out</span>
                )}{' '}
                — toggle to see the consent gate
              </span>
            </div>
          </div>
        </div>

        {/* ── Trust chips ──────────────────────────────────────── */}
        <div className="mt-20 pt-10 border-t border-border/50">
          <p className="text-xs font-mono text-muted-fg/60 text-center uppercase tracking-widest mb-6">
            Privacy guarantees enforced in code
          </p>
          <ul className="flex flex-wrap justify-center gap-3 list-none m-0 p-0">
            {TRUST_CHIPS.map(({ icon, label }) => (
              <li key={label}>
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono text-muted-fg border border-border/50 hover:border-lens/30 hover:text-foreground transition-colors duration-150">
                  <span aria-hidden="true" className="text-lens">{icon}</span>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const TRUST_CHIPS = [
  { icon: '⊘', label: 'Opt-out by default' },
  { icon: '⌫', label: 'PII stripped before storage' },
  { icon: '◎', label: 'Anonymous UUIDs — never derived from PII' },
  { icon: '⧫', label: 'Zero-dependency core' },
  { icon: '⌂', label: 'Self-hostable' },
  { icon: '◉', label: 'Open source · MIT' },
];
