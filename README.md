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
| `@drakkar.software/sunglasses-adapter-sentry` | Web / RN | Sentry `beforeSend` bridge — captures errors as `$error` events |
| `@drakkar.software/sunglasses-adapter-posthog` | Web / RN | PostHog `before_send` bridge — maps autocaptured events to SunGlasses |

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
| `appName` | `string` | — | App name → `context.app.name` |
| `appVersion` | `string` | — | App version → `context.app.version` |
| `appBuild` | `string` | — | Build number → `context.app.build` |
| `appVariant` | `string` | — | App variant / flavor → `context.app.variant` |
| `appUpdate` | `AppUpdateInfo` | — | OTA / app update info → `context.app.update` |
| `environment` | `string` | — | Deployment environment → `context.environment` |
| `features` | `string[]` | — | Enabled features / variants → `context.features` |
| `entitlements` | `string[]` | — | Active user entitlements → `context.entitlements` |
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
client.register({ experiment_group: 'A' })        // Register persistent properties
client.unregister('experiment_group')             // Remove specific key(s)
client.getRegisteredProperties()                  // Snapshot of registered props

// Global app metadata (typed, attached to every event's context)
client.setEnvironment('production')               // → context.environment
client.setAppUpdate({ id, channel, embedded })    // → context.app.update
client.setFeatures(['new-onboarding'])            // → context.features (app-scoped)
client.setEntitlements(['premium'])               // → context.entitlements (user-scoped)
client.setAppMetadata({ environment, features })  // Merge multiple at once
client.getAppMetadata()                           // Snapshot of current metadata

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

Automatically prune old events from remote stores after each successful flush. Implement `cleanupAfterFlush` on any custom `IAnalyticsAdapter` to opt in.

```ts
SunglassesCore.create({
  cleanupAfterFlush: {
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,  // Remove events older than 30 days
    maxEventsPerIdentity: 1000,            // Keep at most 1000 events per user
  },
  adapters: [myAdapter],
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

## Sentry Bridge (`@drakkar.software/sunglasses-adapter-sentry`)

Capture unhandled errors as `$error` analytics events via the Sentry `beforeSend` hook. All errors run through the existing PiiSanitizer middleware automatically. No `@sentry/*` runtime dependency — bring your own Sentry SDK.

```bash
pnpm add @drakkar.software/sunglasses-adapter-sentry
```

### Both Sentry and SunGlasses receive errors

```ts
import * as Sentry from '@sentry/browser'; // or @sentry/react-native
import { createSentryBeforeSend } from '@drakkar.software/sunglasses-adapter-sentry';

Sentry.init({
  dsn: 'https://...',
  beforeSend: createSentryBeforeSend(client),
});
```

### SunGlasses only — no data sent to Sentry servers

```ts
import * as Sentry from '@sentry/browser';
import { createSentryBeforeSend } from '@drakkar.software/sunglasses-adapter-sentry';

// No DSN needed. Sentry attaches global error handlers and fires beforeSend,
// but transmits nothing. suppressSentrySend: true returns null from beforeSend.
Sentry.init({
  beforeSend: createSentryBeforeSend(client, { suppressSentrySend: true }),
});
```

### React error boundary

Catches render-phase errors before they reach Sentry's global handler:

```tsx
import { SunglassesErrorBoundary } from '@drakkar.software/sunglasses-adapter-sentry';

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

Captured events have event name `$error` and these typed properties (`ErrorEventProperties` from core):

| Property | Description |
|----------|-------------|
| `$error_message` | `Error.message` (truncated to `maxMessageLength`) |
| `$error_type` | `Error.name` (e.g. `"TypeError"`) |
| `$error_handled` | `false` for unhandled; `true` from `SunglassesErrorBoundary` |
| `$error_level` | Sentry event level (default `"error"`) |
| `$error_stack` | Stack frames (opt-in via `includeStack: true`) |

---

## PostHog Bridge (`@drakkar.software/sunglasses-adapter-posthog`)

Forward PostHog events to SunGlasses via the PostHog `before_send` hook (available since posthog-js v1.187.0; same API on posthog-react-native). No `posthog-js` runtime dependency — bring your own PostHog SDK.

```bash
pnpm add @drakkar.software/sunglasses-adapter-posthog
```

### Both PostHog and SunGlasses receive events

```ts
import { createPostHogBeforeSend } from '@drakkar.software/sunglasses-adapter-posthog';

posthog.init(key, {
  before_send: createPostHogBeforeSend(client),
});
```

### SunGlasses only — PostHog as local capture layer, no data sent to PostHog servers

```ts
posthog.init(key, {
  before_send: createPostHogBeforeSend(client, { suppressPostHogSend: true }),
});
```

### Replace custom screen + error tracking with PostHog autocapture (local-only shim)

Use posthog-js purely as a capture engine — nothing is sent to PostHog servers.
`HttpStorageAdapter` (pointing at your own endpoint) is the sole event sink.

```ts
import { createPostHogBeforeSend } from '@drakkar.software/sunglasses-adapter-posthog';

posthog.init('phc_xxx', {
  persistence: 'memory',            // PostHog stores nothing locally
  disable_session_recording: true,
  capture_pageview: 'history_change', // SPA pageviews (web)
  capture_exceptions: true,          // global window.onerror + unhandledrejection
  before_send: createPostHogBeforeSend(client, {
    suppressPostHogSend: true,        // nothing sent to PostHog Cloud
    systemEvents: {
      pageview: true,   // $pageview/$screen → client.screen()
      exception: true,  // $exception → client.capture('$error', …)
      // forward: ['$web_vitals', '$pageleave'],  // opt-in other $ events
    },
  }),
});

// SunGlasses client sends everything to your own endpoint:
const client = await SunglassesCore.create({
  adapters: [new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' })],
  ...
});
```

With `suppressPostHogSend: true` + `persistence: 'memory'`, PostHog makes no network requests and persists nothing — SunGlasses' consent gate still governs whether bridged events are recorded.

> **Not bridgeable** (require PostHog Cloud): session replay, heatmaps, feature flag evaluation.

> ⚠️ `forward: ['$autocapture']` captures DOM element content — review PiiSanitizer config before enabling in production.

### Keep `SunglassesErrorBoundary` alongside PostHog exception autocapture

PostHog's global handlers do **not** catch React render-phase errors. Wire both:

```tsx
import { SunglassesErrorBoundary } from '@drakkar.software/sunglasses-adapter-sentry';

// posthog captures unhandled ($error_handled: false)
// boundary catches render errors ($error_handled: true)
<SunglassesErrorBoundary client={client} fallback={<ErrorPage />}>
  <App />
</SunglassesErrorBoundary>
```

### Configuration

```ts
createPostHogBeforeSend(client, {
  suppressPostHogSend: false,         // return null from before_send — PostHog won't transmit
  systemEvents: {
    pageview: false,                  // $pageview/$screen → client.screen()
    exception: false,                 // $exception → client.capture('$error', …)
    includeStack: false,              // include $error_stack (opt-in, privacy)
    maxStackFrames: 5,
    forward: [],                      // other $-events to forward verbatim
  },
  ignoreEventTypes: ['survey_shown'], // explicit block list
  ignorePatterns: [/^debug_/],        // skip by regex on event name
  transformEventName: (n) => n.replace(/_/g, ' '), // rename events
  beforeCapture: (name, props) => ({ ...props, source: 'posthog' }), // transform or drop (null)
});
```

> **Note:** PostHog fires `before_send` for `$identify` / `$groupidentify` on web/RN.
> With `includeSystemEvents: false` (default), these are suppressed.
> Use `client.identify()` directly for identity data.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Adapter `send()` throws | Events stay in queue; retry on next flush |
| All adapters fail | Events stay in queue; no data is lost |
| Storage quota exceeded | Write silently ignored; queue state may be inconsistent |
| Network timeout (HTTP adapter) | Exponential backoff retry; discard after `maxRetries` |
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

## Global App Metadata

Attach typed, non-PII metadata about the running app to **every event's `context`** — app name/version/variant, OTA update info, deployment environment, enabled features, and user entitlements. Provide it at init and/or update it at runtime as things change (after a purchase, a flag toggle, or an OTA update is applied).

```ts
const client = await SunglassesCore.create({
  adapters: [/* ... */],
  storage,
  appName: 'my-app',
  appVersion: '1.4.2',
  appVariant: 'pro',
  appUpdate: { id: 'upd_abc', channel: 'production', runtimeVersion: '1.4.0', embedded: false },
  environment: 'production',
  features: ['new-onboarding', 'dark-mode'],
  entitlements: ['premium'],
});

// Update later at runtime — reflected on all subsequent events
client.setEntitlements(['premium', 'team-seat']); // e.g. after an in-app purchase
client.setFeatures(['new-onboarding']);            // e.g. after a remote-config sync
client.setAppUpdate({ id: 'upd_def', embedded: false }); // e.g. after an OTA update
```

Every event then carries:

```jsonc
"context": {
  "app": { "name": "my-app", "version": "1.4.2", "variant": "pro", "update": { "id": "upd_abc", "channel": "production", "embedded": false } },
  "environment": "production",
  "features": ["new-onboarding", "dark-mode"],
  "entitlements": ["premium"]
}
```

Scoping and lifecycle:

- **App-scoped** (`environment`, `appVariant`, `appUpdate`, `features`) survive `reset()` — they describe the device/build, not the user.
- **User-scoped** (`entitlements`) is cleared by `reset()` and `deleteUserData()`, like a logout.
- All metadata is **in-memory only** — re-supply it on each app boot (the same model as `register()` super properties).
- This lives in the typed `context` envelope, separate from per-event `properties`. Use `register()` for free-form per-event super properties instead.

## Type-Safe Event Catalog

### Module-level singleton (recommended)

The most common pattern is exporting a single `analytics` constant that's safe to import anywhere, before the SDK has initialised:

```ts
// analytics.ts
import { createLazyClient, SunglassesCore } from '@drakkar.software/sunglasses-core';

type MyEvents = {
  button_clicked: { buttonId: string; screen: string };
  purchase_completed: { itemId: string; amount: number };
  page_viewed: undefined; // no required properties
};

export const analytics = createLazyClient<MyEvents>();

export async function initAnalytics() {
  const client = await SunglassesCore.create({ ... });
  analytics.init(client); // wire up — safe to call multiple times
  return client;
}
```

```ts
// anywhere else — safe at import time
import { analytics } from './analytics';

analytics.capture('button_clicked', { buttonId: 'cta', screen: 'home' }); // ✓ typed
analytics.capture('button_clicked', { wrong: 'key' });                    // ✗ TS error
analytics.capture('unknown_event', {});                                   // ✗ TS error
```

All methods are silent no-ops before `init()`. After `init()`, every call delegates to the real `SunglassesCore` instance.

### Inline typing with `asTyped`

When you already hold a `SunglassesCore` reference (e.g. inside a React context), use `asTyped` for a zero-cost compile-time cast:

```ts
import { asTyped } from '@drakkar.software/sunglasses-core';

const typed = asTyped<MyEvents>(client);
typed.capture('button_clicked', { buttonId: 'cta', screen: 'home' }); // ✓
```

> **Anti-pattern** — do not use `Object.assign` to patch a stub with `asTyped`:
> ```ts
> // ✗ broken — Object.assign skips prototype methods; capture() is never replaced
> Object.assign(analytics, asTyped<MyEvents>(client));
> ```
> Use `createLazyClient` instead.

## Development Adapter

For quick local testing, wire an inline adapter that logs batches to the console. No package needed:

```ts
const devAdapter = {
  async send(batch) { console.log('[sunglasses]', batch); },
};

SunglassesCore.create({
  adapters: [devAdapter],
  // Replace with HttpStorageAdapter for production:
  // adapters: [new HttpStorageAdapter({ endpoint: 'https://...' })],
  ...
});
```

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

## Contributing

See [CLAUDE.md](./CLAUDE.md) for developer setup, architecture decisions, and privacy invariants.
