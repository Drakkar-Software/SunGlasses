import { GlassCard } from './ui/GlassCard';
import { SectionHeading } from './ui/SectionHeading';
import { CopyButton } from './ui/CopyButton';

interface Pkg {
  name: string;
  version: string;
  description: string;
  platforms: string[];
  zeroDeps?: boolean;
}

const PACKAGES: Pkg[] = [
  {
    name: 'sunglasses-core',
    version: '0.12.0',
    description: 'Platform-agnostic event engine. All interfaces, PiiSanitizer, consent manager, middleware pipeline, and queue logic.',
    platforms: ['any'],
    zeroDeps: true,
  },
  {
    name: 'sunglasses-react',
    version: '0.12.1',
    description: 'SunglassesProvider, useSunglasses hook, SunglassesErrorBoundary, and screen tracking for React web apps.',
    platforms: ['web'],
  },
  {
    name: 'sunglasses-react-native',
    version: '0.12.1',
    description: 'Provider and hooks for React Native and Expo, including Expo Router and React Navigation screen tracking.',
    platforms: ['ios', 'android', 'expo'],
  },
  {
    name: 'sunglasses-storage-localstorage',
    version: '0.9.0',
    description: 'localStorage adapter — persists the event queue between page reloads on web.',
    platforms: ['web'],
  },
  {
    name: 'sunglasses-storage-async-storage',
    version: '0.9.0',
    description: 'AsyncStorage adapter — persists events across app restarts on React Native.',
    platforms: ['ios', 'android'],
  },
  {
    name: 'sunglasses-storage-http',
    version: '0.9.0',
    description: 'Batched HTTP push adapter with exponential-backoff retry and at-least-once delivery semantics.',
    platforms: ['any'],
  },
];

const PLATFORM_COLORS: Record<string, string> = {
  any:     'bg-lens-dim text-lens border-lens/20',
  web:     'bg-success/10 text-success border-success/20',
  ios:     'bg-surface-2 text-muted-fg border-border',
  android: 'bg-surface-2 text-muted-fg border-border',
  expo:    'bg-glare-dim text-glare border-glare/20',
};

export function Packages() {
  return (
    <section
      id="packages"
      aria-label="Packages"
      className="py-24 px-5 sm:px-8"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          eyebrow="npm packages"
          heading={
            <>
              Install core + one storage +{' '}
              <span className="text-lens">one output.</span>
            </>
          }
          sub="Pick only what you need. The core has zero runtime dependencies. Every other package depends only on core."
          className="mb-14"
        />

        {/* Dependency graph note */}
        <div className="mb-10 flex items-center gap-3 font-mono text-xs text-muted-fg px-1">
          <span className="text-lens">sunglasses-core</span>
          <span aria-hidden="true" className="text-border">←</span>
          <span>react / react-native / storage-* / storage-http</span>
          <span className="hidden sm:inline">(runtime deps: zero on core, core-only on all others)</span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none m-0 p-0">
          {PACKAGES.map((pkg) => {
            const installCmd = `npm i @drakkar.software/${pkg.name}`;
            return (
              <li key={pkg.name}>
                <GlassCard className="h-full flex flex-col gap-3">
                  {/* Package name + version */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-muted-fg mb-0.5">@drakkar.software/</p>
                      <h3 className="font-mono font-semibold text-sm text-foreground">{pkg.name}</h3>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted-fg border border-border shrink-0 tabular">
                      v{pkg.version}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-fg leading-relaxed flex-1">{pkg.description}</p>

                  {/* Platform badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.zeroDeps === true && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono border bg-glare-dim text-glare border-glare/20">
                        zero deps
                      </span>
                    )}
                    {pkg.platforms.map((p) => (
                      <span
                        key={p}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono border ${PLATFORM_COLORS[p] ?? 'bg-surface-2 text-muted-fg border-border'}`}
                      >
                        {p}
                      </span>
                    ))}
                  </div>

                  {/* Install command */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink/40 border border-border/40">
                    <code className="font-mono text-[11px] text-muted-fg flex-1 truncate">
                      {installCmd}
                    </code>
                    <CopyButton text={installCmd} />
                  </div>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
