# SunGlasses

Privacy-first event tracking for Expo / React Native and web apps.

Track screen views, button taps, and custom events — with built-in PII sanitization, opt-out-by-default consent management, and pluggable storage backends.

## Why SunGlasses?

- **Privacy by default** — users start opted out; no data is collected until they explicitly consent.
- **PII sanitization** — emails, phone numbers, and credit card patterns are stripped automatically before any event is queued or sent.
- **Anonymous identities** — a stable UUID is generated locally; it never contains user data.
- **Pluggable storage** — persist locally (localStorage / AsyncStorage) and/or push to an HTTP server, or sync to Starfish.
- **Cross-platform** — one SDK surface for React (web) and React Native / Expo.
- **Middleware pipeline** — drop or transform events before they leave the device.

## Packages

| Package | Platform | Description |
|---------|----------|-------------|
| `@sunglasses/core` | Any | Platform-agnostic event engine + all interfaces |
| `@sunglasses/react` | Web | React context provider + hooks |
| `@sunglasses/react-native` | RN / Expo | React Native provider + screen tracking hooks |
| `@sunglasses/storage-localstorage` | Web | localStorage persistence adapter |
| `@sunglasses/storage-async-storage` | React Native | AsyncStorage persistence adapter |
| `@sunglasses/storage-http` | Any | Batched HTTP push output adapter |
| `@sunglasses/adapter-starfish` | Any | Drakkar-Software/Starfish document-sync adapter |

## Quickstart — Web (React + Vite)

```bash
pnpm add @sunglasses/core @sunglasses/react @sunglasses/storage-localstorage
```

```tsx
// main.tsx
import { SunglassesCore } from '@sunglasses/core';
import { SunglassesProvider } from '@sunglasses/react';
import { LocalStorageAdapter } from '@sunglasses/storage-localstorage';
import { HttpStorageAdapter } from '@sunglasses/storage-http';

const client = await SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  adapters: [
    new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' }),
  ],
  defaultOptIn: false, // Privacy-first: user must call optIn() first
  platform: 'web',
  debug: process.env.NODE_ENV === 'development',
});

root.render(
  <SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
    <App />
  </SunglassesProvider>
);
```

```tsx
// Anywhere in your app
import { useSunglasses } from '@sunglasses/react';

function BuyButton() {
  const client = useSunglasses();

  return (
    <button onClick={() => client.capture('purchase_clicked', { item: 'pro_plan' })}>
      Upgrade
    </button>
  );
}
```

## Quickstart — React Native / Expo

```bash
pnpm add @sunglasses/core @sunglasses/react-native @sunglasses/storage-async-storage
pnpm add @react-native-async-storage/async-storage react-native-get-random-values
```

```tsx
// app/_layout.tsx (Expo Router)
import 'react-native-get-random-values'; // Must be first import
import { SunglassesCore } from '@sunglasses/core';
import { SunglassesProvider, useSunglasses, useExpoRouterScreenTracking } from '@sunglasses/react-native';
import { AsyncStorageAdapter } from '@sunglasses/storage-async-storage';

function InnerLayout() {
  const client = useSunglasses();
  useExpoRouterScreenTracking(client); // Auto-tracks Expo Router screens
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
  return <SunglassesProvider client={client}><InnerLayout /></SunglassesProvider>;
}
```

## Privacy — How It Works

### Consent

```ts
// User must explicitly opt in before any event is collected
await client.optIn();

// Revoke consent at any time — clears the queue immediately
await client.optOut();

// Check current status
client.getConsentStatus(); // 'opted-in' | 'opted-out' | 'unknown'
```

When opted out:
- `capture()`, `screen()`, `identify()`, `alias()` return immediately
- No queue writes, no storage writes, no network calls

### PII Sanitization

Built-in sanitization runs before every event is queued:
- Email addresses → `[redacted]`
- Phone numbers → `[redacted]`
- IPv4 addresses → `[redacted]`
- Credit card numbers → `[redacted]`
- Common key names (`email`, `phone`, `password`, `ssn`, `credit_card`) are removed

Configure an allowlist for full control:
```ts
SunglassesCore.create({
  allowedProperties: ['page', 'action', 'plan'], // only these keys pass through
  ...
});
```

### Anonymous IDs

A UUID v4 is generated on first run and persisted locally. It is:
- Never derived from user data
- Never sent to any third party without your adapter
- Regenerated only when `client.reset()` is called

## API Reference

### `SunglassesCore.create(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adapters` | `IAnalyticsAdapter[]` | required | Output destinations |
| `storage` | `IStorageAdapter` | required | Local persistence |
| `defaultOptIn` | `boolean` | `false` | Start opted in or out |
| `allowedProperties` | `string[]` | — | Allowlist for event properties |
| `deniedProperties` | `string[]` | — | Blocklist for event properties |
| `anonymizeUserId` | `boolean` | `false` | SHA-256 hash `distinctId` |
| `flushInterval` | `number` | `30000` | Auto-flush interval (ms) |
| `maxQueueSize` | `number` | `500` | Max events in queue |
| `maxBatchSize` | `number` | `50` | Events per adapter call |
| `platform` | `'web' \| 'react-native'` | `'web'` | Platform label |
| `debug` | `boolean` | `false` | Verbose console logging |
| `disabled` | `boolean` | `false` | Hard-disable all tracking |
| `middleware` | `IMiddleware[]` | `[]` | Custom middleware chain |

### Client Methods

```ts
client.capture(eventName, properties?)   // Track a custom event
client.screen(screenName, properties?)   // Track a screen/page view
client.identify(userId, traits?)         // Link session to a user
client.alias(newId, existingId)          // Merge two identities
client.reset()                           // Clear identity + queue
client.optIn()                           // Grant consent
client.optOut()                          // Revoke consent + clear queue
client.getConsentStatus()                // 'opted-in' | 'opted-out' | 'unknown'
client.flush()                           // Force-send queued events
client.shutdown()                        // Flush + stop timers (call on unmount)
```

## Custom Middleware

```ts
import type { IMiddleware, SunglassesEvent, MiddlewareNext } from '@sunglasses/core';

const myMiddleware: IMiddleware = {
  name: 'AddAppVersion',
  async process(event: SunglassesEvent, next: MiddlewareNext) {
    // Drop internal events
    if (event.event.startsWith('$internal_')) return null;
    // Enrich the event
    return next({ ...event, properties: { ...event.properties, app_version: '2.0' } });
  },
};

SunglassesCore.create({ middleware: [myMiddleware], ... });
```

## Starfish Integration

```ts
import { StarfishAnalyticsAdapter } from '@sunglasses/adapter-starfish';

SunglassesCore.create({
  adapters: [
    new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      authToken: 'your-bearer-token',
    }),
  ],
  ...
});
```

Events are stored as a JSON document per identity at `storagePath`. The adapter uses Starfish's optimistic locking (`baseHash`) to handle concurrent writes safely.

## Contributing

See [CLAUDE.md](./CLAUDE.md) for developer setup, architecture decisions, and privacy invariants.
