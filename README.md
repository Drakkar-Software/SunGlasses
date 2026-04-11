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

## Event Frequency Counting

Track how many times each event fires, bucketed by day, week, month, or all-time. Counts survive app restarts.

```ts
const client = await SunglassesCore.create({
  enableEventCounting: true,
  // Optional: attach counts to event properties automatically
  middleware: [
    new FrequencyMiddleware({
      counter: client.eventCounter!,
      periods: ['daily', 'monthly'],
    }),
  ],
  ...
});

// Check counts at any time
const todayClicks = await client.getEventCount('button_clicked', 'daily');
const thisMonthClicks = await client.getEventCount('button_clicked', 'monthly');
const totalClicks = await client.getEventCount('button_clicked', 'all-time');

// Reset a specific event's counts
await client.resetEventCount('button_clicked');
```

When `FrequencyMiddleware` is active, these properties are added to each event:
```json
{ "$count_daily": 3, "$count_monthly": 12 }
```

## Cleanup After Flush

Automatically prune old events from remote stores after each successful flush. Currently implemented by `StarfishAnalyticsAdapter`.

```ts
SunglassesCore.create({
  cleanupAfterFlush: {
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,  // Remove events older than 30 days
    maxEventsPerIdentity: 1000,            // Keep at most 1000 events per user
  },
  adapters: [
    new StarfishAnalyticsAdapter({ ... }),
  ],
  ...
});
```

Cleanup is fire-and-forget — it never blocks the flush. Adapters that don't implement `cleanupAfterFlush` are silently skipped.

## Sampling (Volume Reduction)

Randomly drop a fraction of events to reduce analytics costs:

```ts
import { SamplingMiddleware } from '@sunglasses/core';

// Keep only 10% of events (drop 90%)
const sampling = new SamplingMiddleware({ sampleRate: 0.1 });

// Consistent sampling: same user always included or excluded
const consistentSampling = new SamplingMiddleware({
  sampleRate: 0.2,
  consistentSampling: true,  // Based on anonymousId hash
});

// Sample only specific events
const targeted = new SamplingMiddleware({
  sampleRate: 0.05,
  onlyFor: ['page_view', 'hover'],  // High-volume events only
});

SunglassesCore.create({ middleware: [sampling], ... });
```

`$screen`, `$identify`, and `$alias` events are never sampled — only `capture` events are affected. A `$sample_rate` property is added to kept events.

## Custom Adapters

Implement `IAnalyticsAdapter` to send events to any destination:

```ts
import type { IAnalyticsAdapter, SunglassesEvent, CleanupConfig } from '@sunglasses/core';

class FirebaseAdapter implements IAnalyticsAdapter {
  async send(batch: SunglassesEvent[]): Promise<void> {
    // batch is frozen — do not mutate it
    for (const event of batch) {
      await firebase.analytics().logEvent(event.event, event.properties);
    }
  }

  async reset(): Promise<void> {
    // Called on client.reset() — clear remote session if needed
  }

  async shutdown(): Promise<void> {
    // Called on client.shutdown() — flush any pending state
  }

  // Optional: prune remote data after flush
  async cleanupAfterFlush(delivered: SunglassesEvent[], config: CleanupConfig): Promise<void> {
    // Remove delivered events from your remote store
  }
}
```

**Adapter rules (enforced by the privacy invariants):**
- `send()` must never mutate the input `batch` array — it is frozen
- `send()` may throw; the core will keep events in the queue and retry next flush
- `send()` is called by the core only when the user has opted in

## Custom Storage Adapters

Implement `IStorageAdapter` to use any key-value store:

```ts
import type { IStorageAdapter } from '@sunglasses/core';

class SecureStorageAdapter implements IStorageAdapter {
  async read(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }
  async write(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }
  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}
```

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Adapter `send()` throws | Events stay in queue; retry on next flush |
| All adapters fail | Events stay in queue; no data is lost |
| Storage quota exceeded | Write silently ignored; queue state may be inconsistent |
| Network timeout (HTTP adapter) | Exponential backoff retry; discard after `maxRetries` |
| Starfish 409 conflict | Pull → re-merge → re-push, up to `maxRetries` |
| Middleware throws | Event is dropped; error is logged; pipeline continues |

## Troubleshooting

**Events are never sent**
- Check consent: `client.getConsentStatus()` must be `'opted-in'`
- Check `disabled: false` in your config
- Enable `debug: true` and watch the console

**Events are missing properties**
- If `allowedProperties` is set, all other keys are stripped
- Check `deniedProperties` for accidental matches
- PII patterns (email, phone, IP, credit card) are redacted automatically

**Queue grows but never empties**
- All adapters are failing — check network and endpoint config
- Events persist across restarts until an adapter succeeds

**Starfish sync conflicts**
- 409s are retried automatically (up to `maxRetries`)
- High contention (many concurrent clients) may exhaust retries — increase `maxRetries`

**Event counting returns 0**
- Ensure `enableEventCounting: true` in your config
- Counts only accumulate for `capture()` events (not screen/identify/alias)

## Contributing

See [CLAUDE.md](./CLAUDE.md) for developer setup, architecture decisions, and privacy invariants.
