import { useState } from 'react';
import { CopyButton } from './ui/CopyButton';
import { SectionHeading } from './ui/SectionHeading';

type Tab = 'web' | 'rn';

const WEB_INSTALL = `pnpm add @drakkar.software/sunglasses-core \\
  @drakkar.software/sunglasses-react \\
  @drakkar.software/sunglasses-storage-localstorage \\
  @drakkar.software/sunglasses-storage-http`;

const WEB_SETUP = `// main.tsx
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider } from '@drakkar.software/sunglasses-react';
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

const client = await SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  adapters: [
    new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' }),
  ],
  defaultOptIn: false, // Privacy-first: user must call optIn() first
  platform: 'web',
});

root.render(
  <SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
    <App />
  </SunglassesProvider>
);

// In any component
const client = useSunglasses();
client.capture('purchase_clicked', { item: 'pro_plan' });`;

const RN_INSTALL = `pnpm add @drakkar.software/sunglasses-core \\
  @drakkar.software/sunglasses-react-native \\
  @drakkar.software/sunglasses-storage-async-storage \\
  @drakkar.software/sunglasses-storage-http \\
  @react-native-async-storage/async-storage \\
  react-native-get-random-values`;

const RN_SETUP = `// app/_layout.tsx (Expo Router)
import 'react-native-get-random-values'; // ⚠ Must be first import
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import {
  SunglassesProvider,
  useSunglasses,
  useExpoRouterScreenTracking,
} from '@drakkar.software/sunglasses-react-native';
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

function InnerLayout() {
  const client = useSunglasses();
  useExpoRouterScreenTracking(client); // auto-tracks Expo Router screens
  return <Stack />;
}

export default function RootLayout() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    SunglassesCore.create({
      storage: new AsyncStorageAdapter(),
      adapters: [new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' })],
      defaultOptIn: false,
      platform: 'react-native',
    }).then(setClient);
  }, []);

  if (!client) return null;
  return (
    <SunglassesProvider client={client}>
      <InnerLayout />
    </SunglassesProvider>
  );
}`;

interface CodeBlockProps {
  code: string;
  label?: string;
}

function CodeBlock({ code, label }: CodeBlockProps) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border/50">
        {label !== undefined ? (
          <span className="font-mono text-xs text-muted-fg">{label}</span>
        ) : (
          <span />
        )}
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 m-0 text-xs leading-relaxed bg-ink/60">
        <code className="font-mono text-foreground/90 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

export function Quickstart() {
  const [tab, setTab] = useState<Tab>('web');

  return (
    <section
      id="quickstart"
      aria-label="Quickstart"
      className="py-24 px-5 sm:px-8 bg-surface/30"
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-4xl mx-auto">
        <SectionHeading
          eyebrow="Get started"
          heading={
            <>
              One SDK.{' '}
              <span className="text-lens">Web and mobile.</span>
            </>
          }
          sub="The same capture / screen / identify API on web and React Native / Expo. Swap the storage adapter — everything else is identical."
          className="mb-10"
        />

        {/* Tab selector */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-border w-fit mb-6" role="tablist">
          {(['web', 'rn'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`quickstart-panel-${t}`}
              id={`quickstart-tab-${t}`}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'px-4 py-2 text-sm font-mono rounded-lg transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lens',
                tab === t
                  ? 'bg-lens text-lens-fg font-semibold shadow-sm'
                  : 'text-muted-fg hover:text-foreground',
              ].join(' ')}
            >
              {t === 'web' ? 'React (web)' : 'React Native / Expo'}
            </button>
          ))}
        </div>

        {/* Web panel */}
        <div
          id="quickstart-panel-web"
          role="tabpanel"
          aria-labelledby="quickstart-tab-web"
          hidden={tab !== 'web'}
          className="space-y-3"
        >
          <CodeBlock code={WEB_INSTALL} label="install" />
          <CodeBlock code={WEB_SETUP} label="main.tsx" />
        </div>

        {/* React Native panel */}
        <div
          id="quickstart-panel-rn"
          role="tabpanel"
          aria-labelledby="quickstart-tab-rn"
          hidden={tab !== 'rn'}
          className="space-y-3"
        >
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-warn/30 bg-warn/5">
            <span className="text-warn mt-0.5 shrink-0" aria-hidden="true">⚠</span>
            <p className="text-sm text-muted-fg leading-relaxed">
              <code className="font-mono text-xs bg-surface px-1 py-0.5 rounded">react-native-get-random-values</code>{' '}
              must be the <strong className="text-foreground">first import</strong> in your entry file.
              Without it, UUID generation fails on React Native.
            </p>
          </div>
          <CodeBlock code={RN_INSTALL} label="install" />
          <CodeBlock code={RN_SETUP} label="app/_layout.tsx" />
        </div>

        {/* Docs link */}
        <p className="mt-6 text-sm text-muted-fg">
          Need consent flows, error capture, or screen tracking?{' '}
          <a
            href="https://drakkar-software.github.io/SunGlasses/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lens hover:text-lens-hover underline underline-offset-2 transition-colors"
          >
            Read the full docs →
          </a>
        </p>
      </div>
    </section>
  );
}
