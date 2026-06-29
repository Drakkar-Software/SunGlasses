<p align="center">
  <img src="./logo.png" alt="SunGlasses — Privacy-First Analytics for React Native & Expo" width="320" />
</p>

<h1 align="center">SunGlasses</h1>

<p align="center">
  <strong>Privacy-first event tracking for React, React Native & Expo — with zero PII, zero drama.</strong>
</p>

<p align="center">
  Track what matters. Protect what doesn't. Ship with confidence.
</p>

<p align="center">
  <a href="https://drakkar-software.github.io/SunGlasses/"><strong>Documentation</strong></a> ·
  <a href="https://drakkar-software.github.io/SunGlasses/getting-started/intro">Quickstart</a> ·
  <a href="https://drakkar-software.github.io/SunGlasses/reference/config">API Reference</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## The problem with most analytics SDKs

Most event tracking libraries are built to collect as much as possible and ask permission later. They leak PII into event payloads, require you to wire up your own consent gate, and leave you scrambling when GDPR audits arrive.

**SunGlasses flips that model.** Users start opted out. PII is stripped automatically before events ever touch storage or the network. You get rich, actionable analytics — without the liability.

## What makes SunGlasses different

| | SunGlasses | Typical SDKs |
|---|---|---|
| Default consent state | **Opted out** | Opted in |
| PII sanitization | **Automatic, built-in** | Your problem |
| Anonymous ID source | **Fresh UUID v4** | Often derived from device/user data |
| Self-hostable | **Yes — S3 + DuckDB** | Rarely |
| Cross-platform (web + RN) | **One SDK surface** | Usually separate libs |
| Open source | **Yes** | Sometimes |

---

## Features

- **Opt-out by default** — zero data collected until the user explicitly consents. Flip to opt-in with a single config flag.
- **Automatic PII sanitization** — emails, phone numbers, and card patterns are stripped from every event before it touches storage or the wire. Not opt-in. Always on.
- **Anonymous-by-design identities** — stable UUIDs generated locally, never derived from user data. `identify()` is the only bridge between anonymous and known.
- **Built-in error capture** — `captureException`, `SunglassesErrorBoundary`, global error handlers, console patching, and unhandled rejection tracking. Drop Sentry for the error events you actually need.
- **Middleware pipeline** — drop, transform, or enrich events before they leave the device. Composable and async.
- **Pluggable storage & output** — persist to `localStorage`, `AsyncStorage`, or push via HTTP. Bring your own adapter.
- **Self-hosted analytics dashboard** — query your events with DuckDB over S3 Parquet. Dark mode. No third-party cloud required.
- **TypeScript-first** — every interface, event shape, and config option is fully typed.

---

## Quickstart

### React Native / Expo

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react-native @drakkar.software/sunglasses-storage-async-storage
pnpm add @react-native-async-storage/async-storage react-native-get-random-values
```

```tsx
// app/_layout.tsx
import { SunglassesProvider } from '@drakkar.software/sunglasses-react-native';
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';
import { HttpPushAdapter } from '@drakkar.software/sunglasses-storage-http';

export default function RootLayout() {
  return (
    <SunglassesProvider
      config={{
        adapters: [
          new AsyncStorageAdapter(),
          new HttpPushAdapter({ url: 'https://your-ingest.example.com/events' }),
        ],
        autoCaptureErrors: true,  // global handlers + unhandled rejections
      }}
    >
      <Stack />
    </SunglassesProvider>
  );
}
```

```tsx
// anywhere in your app
import { useSunglasses } from '@drakkar.software/sunglasses-react-native';

function CheckoutButton() {
  const { capture } = useSunglasses();

  return (
    <Button
      title="Buy now"
      onPress={() => capture('checkout_started', { plan: 'pro' })}
    />
  );
}
```

See the [React Native setup guide](https://drakkar-software.github.io/SunGlasses/getting-started/react-native-setup) for Expo Router screen tracking and error boundary integration.

### Web (React)

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react @drakkar.software/sunglasses-storage-localstorage
```

See the [web setup guide](https://drakkar-software.github.io/SunGlasses/getting-started/web-setup).

---

## Privacy that actually works

```ts
// This event is safe to send — SunGlasses strips PII automatically
client.capture('form_submitted', {
  email: 'user@example.com',      // → "[REDACTED]"
  phone: '+1 555-867-5309',       // → "[REDACTED]"
  plan: 'pro',                    // ✓ kept
});

// Consent gate — zero I/O until the user opts in
await client.optIn();   // now events start flowing
await client.optOut();  // immediately stops all capture and network calls
```

The PII sanitizer runs unconditionally as the first step in the middleware pipeline — before storage, before the network, before anything else. It cannot be removed or reordered.

---

## Error capture without the bloat

```tsx
// Wrap your tree — render errors captured automatically
<SunglassesGlobalErrorBoundary fallback={<ErrorScreen />}>
  <App />
</SunglassesGlobalErrorBoundary>

// Capture anywhere
import { captureException } from '@drakkar.software/sunglasses-core';

try {
  await riskyOperation();
} catch (err) {
  captureException(client, err, { handled: true, includeStack: true });
}
```

All error events are deduplicated within a 1 s window — no duplicate `$error` floods from an error boundary and a global handler firing on the same exception.

---

## Self-hosted analytics dashboard

SunGlasses ships with a read-only analytics app that runs DuckDB queries over your S3 Parquet data — no third-party cloud, no per-seat pricing.

- Overview KPIs: DAU, event volume, error rate
- Top events & screens with time-series charts
- Day-N retention cohorts
- Grouped error explorer with stack traces
- Per-app filtering
- Ad-hoc SQL console
- Light / dark mode

```bash
cd apps/analytics-dashboard
pnpm dev   # http://localhost:8788
```

---

## Packages

| Package | Platform | Description |
|---------|----------|-------------|
| `@drakkar.software/sunglasses-core` | Any | Platform-agnostic event engine + all interfaces |
| `@drakkar.software/sunglasses-react` | Web | React context provider + hooks |
| `@drakkar.software/sunglasses-react-native` | RN / Expo | React Native provider + screen tracking hooks |
| `@drakkar.software/sunglasses-storage-localstorage` | Web | `localStorage` persistence adapter |
| `@drakkar.software/sunglasses-storage-async-storage` | React Native | `AsyncStorage` persistence adapter |
| `@drakkar.software/sunglasses-storage-http` | Any | Batched HTTP push output adapter |
| `@drakkar.software/sunglasses-adapter-starfish` | Any | Push events to Starfish (Parquet, server-side) |

---

## Documentation

| Topic | Link |
|-------|------|
| Getting started | [/getting-started/intro](https://drakkar-software.github.io/SunGlasses/getting-started/intro) |
| Consent & privacy | [/privacy/consent](https://drakkar-software.github.io/SunGlasses/privacy/consent) |
| Error capture | [/guides/error-capture](https://drakkar-software.github.io/SunGlasses/guides/error-capture) |
| Self-hosted ingest | [/backend/ingest-server](https://drakkar-software.github.io/SunGlasses/backend/ingest-server) |
| API reference | [/reference/config](https://drakkar-software.github.io/SunGlasses/reference/config) |

---

## Contributing

See [CLAUDE.md](./CLAUDE.md) and the [contributing docs](https://drakkar-software.github.io/SunGlasses/contributing/dev-setup).

## License

See package licenses on npm.
