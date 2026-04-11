<p align="center">
  <img src="./logo.png" alt="SunGlasses" width="320" />
</p>

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
| `@drakkar.software/sunglasses-core` | Any | Platform-agnostic event engine + all interfaces |
| `@drakkar.software/sunglasses-react` | Web | React context provider + hooks |
| `@drakkar.software/sunglasses-react-native` | RN / Expo | React Native provider + screen tracking hooks |
| `@drakkar.software/sunglasses-storage-localstorage` | Web | localStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-async-storage` | React Native | AsyncStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-http` | Any | Batched HTTP push output adapter |
| `@drakkar.software/sunglasses-adapter-starfish` | Any | Drakkar-Software/Starfish document-sync adapter |
| `@drakkar.software/sunglasses-adapter-console` | Any | Development adapter — pretty-prints events to console |
| `@drakkar.software/sunglasses-error-capture` | Web / RN | Sentry bridge + React error boundary for `$error` events |

## Quickstart — Web (React + Vite)

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react @drakkar.software/sunglasses-storage-localstorage
```

```tsx
// main.tsx
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
import { useSunglasses } from '@drakkar.software/sunglasses-react';

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
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react-native @drakkar.software/sunglasses-storage-async-storage
pnpm add @react-native-async-storage/async-storage react-native-get-random-values
```

```tsx
// app/_layout.tsx (Expo Router)
import 'react-native-get-random-values'; // Must be first import
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider, useSunglasses, useExpoRouterScreenTracking } from '@drakkar.software/sunglasses-react-native';
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';

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
| `respectDoNotTrack` | `boolean` | `true` | Auto opt-out if GPC/DNT browser signal detected (web only) |
| `flushInterval` | `number` | `30000` | Auto-flush interval (ms) |
| `maxQueueSize` | `number` | `500` | Max events in queue |
| `maxBatchSize` | `number` | `50` | Events per adapter call |
| `platform` | `'web' \| 'react-native'` | `'web'` | Platform label |
| `debug` | `boolean` | `false` | Verbose console logging |
| `disabled` | `boolean` | `false` | Hard-disable all tracking |
| `middleware` | `IMiddleware[]` | `[]` | Custom middleware chain |
| `consentPolicyVersion` | `string` | — | Reset consent when policy version changes |
| `consentExpiryMs` | `number` | — | Reset consent after N ms of age (e.g. 1 year) |
| `enableSessionTracking` | `boolean` | `false` | Attach session IDs and emit `$session_start` events |
| `enableEventCounting` | `boolean` | `false` | Count events by daily/weekly/monthly/all-time |
| `enableLocalArchive` | `boolean` | `false` | Keep a permanent local copy of all events (GDPR Art. 20) |
| `cleanupAfterFlush` | `CleanupConfig` | — | Prune old events from adapters after delivery |

### Client Methods

```ts
// Event tracking
client.capture(eventName, properties?, options?)  // Track a custom event
client.screen(screenName, properties?)            // Track a screen/page view
client.identify(userId, traits?)                  // Link session to a user
client.alias(newId, existingId)                   // Merge two identities
client.group(groupId, traits?)                    // Associate with an org/workspace

// Super properties (auto-merged into every event)
client.register({ environment: 'prod' })          // Register persistent properties
client.unregister('environment')                  // Remove specific key(s)
client.getRegisteredProperties()                  // Snapshot of registered props

// Consent
client.optIn()                                    // Grant consent
client.optOut()                                   // Revoke consent + clear queue
client.getConsentStatus()                         // 'opted-in' | 'opted-out' | 'unknown'
client.getConsentHistory()                        // Audit trail of consent changes

// Identity
client.reset()                                    // Clear identity + queue + session

// GDPR
client.exportUserData()                           // Art. 20 — full local data snapshot
client.deleteUserData({ resetConsent? })          // Art. 17 — erase all local data

// Lifecycle
client.flush()                                    // Force-send queued events
client.shutdown()                                 // Flush + stop timers (call on unmount)

// Diagnostics
client.getQueuedEventCount()                      // Current queue depth
client.getEventCount(name, period, date?)         // Event frequency (requires enableEventCounting)
```

### `CaptureOptions`

Pass a third argument to `capture()` for advanced use cases:

```ts
// Back-date an offline event
client.capture('purchase_completed', { amount: 29.99 }, {
  timestamp: '2026-01-15T10:00:00.000Z',
});

// Inject a server-side deduplication ID
client.capture('order_created', { orderId: '123' }, {
  messageId: '550e8400-e29b-41d4-a716-446655440000',
});
```

### UTM / Attribution Capture

**Web** — reads `utm_*` params from `window.location.search` and `document.referrer`:

```ts
import { captureUtmParams } from '@drakkar.software/sunglasses-react';

const client = await SunglassesCore.create({ ... });
captureUtmParams(client); // call once at startup
```

**React Native (Expo Router)** — reads params from the current Expo Router URL via
`useGlobalSearchParams()`. Place in your root `_layout.tsx`:

```tsx
import { useExpoRouterUtmCapture } from '@drakkar.software/sunglasses-react-native';

export default function RootLayout() {
  const client = useSunglasses();
  useExpoRouterUtmCapture(client); // captures on mount + re-captures on new deep links
  return <Stack />;
}
```

**React Native (plain Linking API)** — handles cold start + re-opens. Works with
both Expo and bare React Native:

```tsx
import { useLinkingUtmCapture } from '@drakkar.software/sunglasses-react-native';

export default function App() {
  const client = useSunglasses();
  useLinkingUtmCapture(client);
  return <NavigationContainer>...</NavigationContainer>;
}
```

You can also call `captureDeepLinkUtmParams(client, url)` directly if you manage
deep link handling yourself.

## Custom Middleware

```ts
import type { IMiddleware, SunglassesEvent, MiddlewareNext } from '@drakkar.software/sunglasses-core';

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

[Starfish](https://github.com/Drakkar-Software/Starfish) is a document-sync backend developed by Drakkar-Software.

```ts
import { StarfishAnalyticsAdapter } from '@drakkar.software/sunglasses-adapter-starfish';

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
import { SamplingMiddleware } from '@drakkar.software/sunglasses-core';

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
import type { IAnalyticsAdapter, SunglassesEvent, CleanupConfig } from '@drakkar.software/sunglasses-core';

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
import type { IStorageAdapter } from '@drakkar.software/sunglasses-core';

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

## Error Capture (`@drakkar.software/sunglasses-error-capture`)

Capture unhandled errors as `$error` analytics events using the Sentry bridge. All errors run through the existing PiiSanitizer middleware automatically.

```bash
pnpm add @drakkar.software/sunglasses-error-capture
```

### Sentry bridge — both Sentry and SunGlasses receive errors

```ts
import * as Sentry from '@sentry/browser'; // or @sentry/react-native
import { createSentryBeforeSend } from '@drakkar.software/sunglasses-error-capture';

Sentry.init({
  dsn: 'https://...',
  beforeSend: createSentryBeforeSend(client),
});
```

### SunGlasses only — Sentry as local error processor, no data sent to Sentry servers

```ts
import * as Sentry from '@sentry/browser';
import { createSentryBeforeSend } from '@drakkar.software/sunglasses-error-capture';

// No DSN needed. Sentry attaches global error handlers and fires beforeSend,
// but transmits nothing. Set suppressSentrySend: true to return null from beforeSend.
Sentry.init({
  beforeSend: createSentryBeforeSend(client, { suppressSentrySend: true }),
});
```

### React error boundary

Catches render-phase errors before they reach Sentry's global handler:

```tsx
import { SunglassesErrorBoundary } from '@drakkar.software/sunglasses-error-capture';

<SunglassesErrorBoundary client={client} fallback={<ErrorPage />}>
  <App />
</SunglassesErrorBoundary>
```

### Configuration

```ts
createSentryBeforeSend(client, {
  includeStack: false,      // include stack frames in $error_stack — default false (privacy)
  maxStackFrames: 5,        // max frames when includeStack is true
  maxMessageLength: 200,    // truncate error messages — error msgs can contain PII
  ignorePatterns: [/ResizeObserver/],  // skip errors matching these patterns
  suppressSentrySend: true, // return null from beforeSend — Sentry won't transmit
  beforeCapture: (props) => ({ ...props, app_version: '1.2.0' }), // transform or drop (null)
});
```

Captured events have event name `$error` and these properties:

| Property | Description |
|----------|-------------|
| `$error_message` | `Error.message` (truncated to `maxMessageLength`) |
| `$error_type` | `Error.name` (e.g. `"TypeError"`) |
| `$error_handled` | `false` for unhandled; `true` from `SunglassesErrorBoundary` |
| `$error_level` | Sentry event level (default `"error"`) |
| `$error_stack` | Stack frames (opt-in via `includeStack: true`) |

---

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

## Session Tracking

Automatically group events into sessions. A session expires after a configurable idle period. Session IDs are random UUIDs — no PII.

```ts
const client = await SunglassesCore.create({
  enableSessionTracking: true,
  sessionIdleTimeoutMs: 30 * 60 * 1000, // default: 30 minutes
  ...
});
```

When enabled, every event gains `context.sessionId`. A synthetic `$session_start` event is emitted automatically at the beginning of each new session.

## Persistent User Traits

Set user traits once via `identify()` and they are automatically forwarded with every subsequent event in `context.traits` — without re-calling `identify()`.

```ts
// Set traits once (e.g. after login)
client.identify('user-123', { plan: 'pro', country: 'US' });

// All subsequent events automatically include context.traits = { plan: 'pro', country: 'US' }
client.capture('button_clicked', { buttonId: 'cta' });
```

Sensitive keys (`email`, `password`, `phone`, etc.) are stripped before traits are persisted. Traits survive app restarts. Call `client.reset()` to clear them.

## Type-Safe Event Catalog

Get compile-time checking of event names and property shapes — zero runtime cost:

```ts
import { asTyped } from '@drakkar.software/sunglasses-core';

type MyEvents = {
  button_clicked: { buttonId: string; screen: string };
  purchase_completed: { itemId: string; amount: number };
  page_viewed: undefined; // no required properties
};

const typed = asTyped<MyEvents>(client);

// Compile-time type-checked:
typed.capture('button_clicked', { buttonId: 'cta', screen: 'home' }); // ✓
typed.capture('button_clicked', { wrong: 'key' });                    // ✗ TS error
typed.capture('unknown_event', {});                                   // ✗ TS error
```

## Development — ConsoleAdapter

Pretty-print events to the console during development:

```ts
import { ConsoleAdapter } from '@drakkar.software/sunglasses-adapter-console';

SunglassesCore.create({
  adapters: [
    new ConsoleAdapter({ verbose: false }),
    // add your real adapter here for production
  ],
  ...
});
```

Output example:
```
[SunGlasses] capture "button_clicked" @ 2024-01-15T10:30:00.000Z
  ┌──────────┬─────────┐
  │ buttonId │ cta     │
  │ screen   │ home    │
  └──────────┴─────────┘
  anonymousId: 550e8400-e29b-41d4-a716-446655440000
```

Options: `prefix`, `verbose` (full JSON), `onlyFor` (event filter list).

## Consent Versioning (GDPR)

When your privacy policy changes, force users to re-consent by bumping the version:

```ts
SunglassesCore.create({
  consentPolicyVersion: '2.0',  // bump this whenever your policy changes
  ...
});
```

If a user previously consented under a different policy version, their consent is reset to `'unknown'` — prompting them to opt-in again. The full consent history (up to 10 entries) is preserved:

```ts
const history = client.getConsentHistory();
// [
//   { status: 'opted-in', policyVersion: '1.0', timestamp: '...' },
//   { status: 'unknown',  policyVersion: '2.0', timestamp: '...' },
// ]
```

## Data Portability (GDPR Article 20)

Export all locally stored user data as structured JSON — no network calls:

```ts
const data = await client.exportUserData();
// {
//   exportedAt: '2024-01-15T10:30:00.000Z',
//   anonymousId: '...',
//   distinctId: 'user-123',
//   consentStatus: 'opted-in',
//   consentHistory: [...],
//   traits: { plan: 'pro' },
//   queuedEvents: [...],
//   archivedEvents: [...],  // if enableLocalArchive: true
//   eventCountSummary: { button_clicked: { daily: 3, 'all-time': 42 } }
// }
```

## Local Event Archive

Keep a permanent local copy of all events — separate from the queue. Events in the archive are **never removed after a flush**, making it ideal for offline-first apps and GDPR data export.

```ts
const client = await SunglassesCore.create({
  enableLocalArchive: true,
  ...
});

// Export includes all archived events
const data = await client.exportUserData();
console.log(data.archivedEvents.length); // all events since last clearLocalArchive()

// Prune old events from the archive
await client.clearLocalArchive({ maxAgeMs: 30 * 24 * 60 * 60 * 1000 }); // keep last 30 days

// Clear the entire archive
await client.clearLocalArchive();
```

## Starfish — Rotating Documents

By default, `StarfishAnalyticsAdapter` maintains a single growing document per identity. For high-volume apps or when you want smaller, isolated push documents, enable path rotation:

```ts
import { StarfishAnalyticsAdapter } from '@drakkar.software/sunglasses-adapter-starfish';
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';

const storage = new LocalStorageAdapter();

new StarfishAnalyticsAdapter({
  serverUrl: 'https://sync.example.com',
  storagePath: 'analytics/{identity}/events',
  authToken: 'your-token',

  // Each successful push creates a new file: events-0001, events-0002, ...
  rotatePathOnSuccess: true,
  pathStorage: storage,  // persists the generation counter across restarts
})
```

With rotation:
- **No pull step** — each push is always a fresh document (faster, no conflict resolution)
- **Small files** — each document contains only the events from one flush batch
- **Complete history** — enable `enableLocalArchive: true` to keep all events locally

Without rotation (default):
- Single growing document per identity, merged on each push
- Optimistic locking (409 conflict resolution) ensures consistency

## Contributing

See [CLAUDE.md](./CLAUDE.md) for developer setup, architecture decisions, and privacy invariants.
