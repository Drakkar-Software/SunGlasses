# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] — 2026-06-25

### Added

- **`@drakkar.software/sunglasses-adapter-starfish`** — completely new batch-push implementation; pushes events as JSON batches to a Starfish events collection encoded to Parquet server-side by the companion `starfish-events` plugin. Replaces the old document-sync adapter (see Removed).
- **`systemEvents` config** (`@drakkar.software/sunglasses-adapter-posthog`): maps PostHog system events to SunGlasses equivalents — `$pageview`/`$screen` → `client.screen()`, `$exception` → `client.capture('$error', ErrorEventProperties)`, `forward` passes whitelisted `$`-prefixed events through verbatim.
- **`mapPostHogPageview` / `mapPostHogException`** helpers — new named exports from `@drakkar.software/sunglasses-adapter-posthog`.
- **Real PostHog types** (`@drakkar.software/sunglasses-adapter-posthog`): uses types from `@posthog/core` via optional peerDep + devDep — zero runtime weight.
- **Real Sentry types** (`@drakkar.software/sunglasses-adapter-sentry`): uses types from `@sentry/core` via optional peerDep — zero runtime weight.
- **`apps/ingest-server`**: new Fastify + DuckDB ingest server; accepts `POST {batch, sentAt}` from `HttpStorageAdapter`, stages events in a persistent DuckDB staging table, and flushes to S3 as date-partitioned Parquet (`COPY … FORMAT PARQUET, PARTITION_BY (dt)`). Graceful shutdown flushes staged rows before exit; returns `503` on staging failure so the SDK retries. Includes query examples for totals, screen paths, errors, DAU, and day-7 retention.

### Fixed

- **`createPostHogBeforeSend`** (`@drakkar.software/sunglasses-adapter-posthog`): fix latent bug where the captured event field was `event_type` instead of `event`.
- **`createPostHogBeforeSend`**: fix `$pageview` / `$screen` / `$exception` early-return that always bypassed the `includeSystemEvents` flag, regardless of config.
- **`mapPostHogEvent`**: extract `pathname` from `$current_url` instead of using the full URL as the screen name — query params may contain OAuth tokens or password-reset codes.
- **`createSentryBeforeSend`** (`@drakkar.software/sunglasses-adapter-sentry`): made async; now awaits `originalBeforeSend` and skips capture when it returns `null` (i.e. Sentry itself dropped the event).
- **`ingest-server`**: stamp `received_at` server-side rather than trusting client-provided `sentAt`.
- **`ingest-server`**: null-guard `event.timestamp`, fall back to `receivedAt` when absent.
- **`ingest-server`**: escape AWS `KEY_ID`, `SECRET`, `REGION`, and `ENDPOINT` in `CREATE SECRET` SQL to prevent injection.
- **`ingest-server`**: add `UNIQUE` constraint on `message_id` + `INSERT OR IGNORE` for server-side deduplication.
- **devAdapter** (example apps): log only event count and `anonymousId`, never the full event batch.

### Removed

- **`@drakkar.software/sunglasses-adapter-console`** — removed; example apps now use an inline `devAdapter` that logs only count + `anonymousId`.
- **`@drakkar.software/sunglasses-adapter-starfish`** (old document-sync implementation) — replaced by the new batch-push adapter described in Added.

### Security

- **devAdapter**: full event batches are no longer logged in example apps, preventing accidental PII exposure in development consoles.
- **`mapPostHogEvent`**: full `$current_url` values (which may contain OAuth tokens or reset codes in query params) are no longer used as screen names.
- **`ingest-server`**: parameterised-style escaping for AWS credentials in DuckDB SQL prevents SQL injection via environment variables.
- **`ingest-server`**: server-side `received_at` timestamping prevents clients from injecting or back-dating timestamps on the ingest endpoint.

## [0.7.0] — 2026-04-12

### Changed

- **EventCounter storage consolidation** (`@drakkar.software/sunglasses-core`): all per-event frequency counts are now stored in a single `sg:counts` JSON blob instead of one localStorage key per event per period. With N event types and 4 periods, the old approach wrote N×4 keys; the new approach always writes exactly 1 key regardless of event count.

  | Before (per event × per period) | After |
  |----------------------------------|-------|
  | `sg:count:daily:2026-04-12:home_opened` | (eliminated) |
  | `sg:count:weekly:2026-W15:home_opened` | (eliminated) |
  | `sg:count:monthly:2026-04:home_opened` | (eliminated) |
  | `sg:count:all-time:all:home_opened` | (eliminated) |
  | *(N events × 4 keys each)* | `sg:counts` = `{"daily:…:home_opened":1,…}` |

  > **Migration note**: existing `sg:count:*` keys are abandoned — event counters reset to zero on upgrade. Count data is non-critical; consent, identity, session, and queue are unaffected.

## [0.6.0] — 2026-04-12

### Added

- **`pushOnly` option on `StarfishAnalyticsAdapter`** (`@drakkar.software/sunglasses-adapter-starfish`, `@drakkar.software/sunglasses-core`): skips the pull round-trip and pushes a fresh document directly. Designed for Starfish collections configured with `queueOnly: true`, where pull always returns empty data and optimistic locking is irrelevant.

  ```ts
  new StarfishAnalyticsAdapter({
    serverUrl,
    storagePath: 'analytics/{identity}/events',
    authToken,
    pushOnly: true, // no GET /pull — direct POST /push
  });
  ```

  - On push failure the adapter **throws**, so `SunglassesCore` keeps events in the local queue and retries on the next flush interval. Without this, a transient server error would silently discard the batch.
  - Cannot be combined with `rotatePathOnSuccess`.

## [0.5.0] — 2026-04-12

### Added

- **`createLazyClient<T>()`** (`@drakkar.software/sunglasses-core`) — typed analytics stub safe to use before the SDK initialises.

  Module-level analytics singletons are a common pattern: export a client constant at import time, then wire up the real `SunglassesCore` instance asynchronously. The previous idiom (`Object.assign(stub, asTyped(client))`) was silently broken — `Object.assign` copies only own enumerable properties, and `capture()` is a class prototype method, so the noop stub was **never replaced**.

  `createLazyClient` fixes this with a proper lazy-proxy object:

  ```typescript
  // analytics.ts
  import { createLazyClient, SunglassesCore } from '@drakkar.software/sunglasses-core';

  type MyEvents = {
    button_clicked: { buttonId: string };
    page_viewed: undefined;
  };

  export const analytics = createLazyClient<MyEvents>();

  export async function initAnalytics() {
    const client = await SunglassesCore.create({ ... });
    analytics.init(client);   // wire up — safe to call multiple times
    return client;
  }
  ```

  - All methods are safe no-ops (or return empty-state defaults) before `init()`.
  - After `init()`, every method delegates to the real `SunglassesCore` instance.
  - Fully typed: `analytics.capture('unknown_event')` is a compile-time error.
  - `init()` may be called multiple times — last call wins (useful for wedding/multi-tenant switching).

## [0.4.0] — 2026-04-12

### Changed

- **Storage key prefix shortened** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-adapter-starfish`): all internal `IStorageAdapter` keys are now prefixed with `sg:` instead of `sunglasses:` — shorter keys reduce storage overhead, especially noticeable in `EventCounter` where one key is written per event per period.

  | Old key | New key |
  |---------|---------|
  | `sunglasses:anon_id` | `sg:anon_id` |
  | `sunglasses:distinct_id` | `sg:distinct_id` |
  | `sunglasses:consent` | `sg:consent` |
  | `sunglasses:session` | `sg:session` |
  | `sunglasses:queue` | `sg:queue` |
  | `sunglasses:traits` | `sg:traits` |
  | `sunglasses:archive` | `sg:archive` |
  | `sunglasses:count:{…}` | `sg:count:{…}` |
  | `sunglasses:starfish:gen:{id}` | `sg:starfish:gen:{id}` |

  > **Migration note**: existing persisted state (consent, traits, session, queued events, event counts, local archive) will not be read after upgrading — the SDK will start fresh as if on first launch. Re-prompt users for consent if you rely on a stored opt-in.

## [0.3.0] — 2026-04-11

### Added

- **`@drakkar.software/sunglasses-adapter-sentry`** — replaces `error-capture`; renamed to follow adapter naming convention
  - `createSentryBeforeSend` and `SunglassesErrorBoundary` APIs unchanged
  - `ErrorBoundaryConfig` replaces `Pick<SentryBridgeConfig, ...>` in `SunglassesErrorBoundary` props — cleaner type, same fields
  - `beforeCapture` callback now receives typed `ErrorEventProperties` instead of `Record<string, unknown>`
- **`@drakkar.software/sunglasses-adapter-posthog`** — new package: bridges PostHog `before_send` events to SunGlasses
  - `createPostHogBeforeSend(client, config?)` — intercepts PostHog events and forwards them as `client.capture(eventName, props)` calls; return `null` to suppress PostHog transmission via `suppressPostHogSend: true`
  - Works with posthog-js (web) and posthog-react-native (posthog-js monorepo); no posthog-js runtime dependency
  - Config: `suppressPostHogSend`, `includeSystemEvents`, `ignoreEventTypes`, `ignorePatterns`, `beforeCapture`, `transformEventName`
- **`@drakkar.software/sunglasses-core` 0.3.0** — new `ErrorEventProperties` interface: typed schema for `$error` events shared across all error-capturing adapters

### Removed

- **`@drakkar.software/sunglasses-error-capture`** — replaced by `@drakkar.software/sunglasses-adapter-sentry`

## [0.2.2] — 2026-04-11

### Added

- **`@drakkar.software/sunglasses-error-capture`** — *(now renamed to `adapter-sentry`)* initial release
  - `createSentryBeforeSend(client, config?, originalBeforeSend?)` — Sentry bridge that intercepts errors via Sentry's `beforeSend` callback and fires them as `client.capture('$error', ...)` events; works with `@sentry/browser`, `@sentry/react`, and `@sentry/react-native`; no `@sentry/*` runtime dependency required
  - Set `suppressSentrySend: true` to drop the event from Sentry's transmission queue (return `null` from `beforeSend`), letting Sentry act as a local error capture engine with no data leaving the device; compatible with omitting the DSN entirely
  - `SunglassesErrorBoundary` — React error boundary component that captures render-phase errors with `$error_handled: true`; complements the Sentry bridge for errors caught at component boundaries
  - All captured errors run through the existing PiiSanitizer middleware automatically
  - Privacy-safe defaults: `includeStack: false`, `maxMessageLength: 200`; full `SentryBridgeConfig` for opt-in stack frames, message truncation, ignore patterns, and `beforeCapture` transform

## [0.2.1] — 2026-04-11

### Added

- **Deep link UTM capture** (`@drakkar.software/sunglasses-react-native`): three new exports for React Native attribution:
  - `captureDeepLinkUtmParams(client, url)` — low-level utility that extracts `utm_*` params from any deep link URL (HTTPS universal links and custom scheme links) and registers them as super properties; works with Hermes and JavaScriptCore
  - `useLinkingUtmCapture(client)` — hook backed by React Native's `Linking` API; handles both cold-start attribution (`getInitialURL`) and re-attribution when a new deep link arrives while the app is open (`addEventListener('url', ...)`)
  - `useExpoRouterUtmCapture(client)` — hook backed by Expo Router's `useGlobalSearchParams()`; works from the root `_layout.tsx` and re-captures whenever the URL params change (new campaign links)

### Fixed

- **`captureDeepLinkUtmParams`** (`@drakkar.software/sunglasses-react-native`): strip `#` fragment before passing query string to `URLSearchParams` — without this, `utm_campaign=sale#hero` was stored as `"sale#hero"` instead of `"sale"`
- **`useExpoRouterUtmCapture`** (`@drakkar.software/sunglasses-react-native`): import `UTM_PARAMS` from `captureDeepLinkUtmParams` instead of re-declaring — eliminates silent divergence risk if params are ever updated in one place but not the other
- **`useExpoRouterUtmCapture`** (`@drakkar.software/sunglasses-react-native`): removed `eslint-disable-next-line react-hooks/rules-of-hooks` comment — the `react-hooks` ESLint plugin is not installed in this package; the comment caused `pnpm lint` to exit 1 in CI

## [0.2.0] — 2026-04-11

### Added

- **Device / browser context auto-enrichment** (`@drakkar.software/sunglasses-core`): `buildContext()` now automatically populates `context.device` (type + OS detected from `userAgent`), `context.screen` (width × height), and `context.locale` (`navigator.language`) on web platform — fields that existed in the type but were always empty in emitted events
- **UTM / attribution capture** (`@drakkar.software/sunglasses-react`): new `captureUtmParams(client)` utility reads `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` from the current URL's search params plus `$referrer` / `$referring_domain` from `document.referrer`, and registers them as super properties via `client.register()`
- **Screen URL metadata** (`@drakkar.software/sunglasses-react`): `useScreenTracking` now automatically attaches `$url` (full URL), `$path` (pathname), `$title` (document title), and `$referrer` (previous path for SPA navigation; `document.referrer` on initial load) to every screen event
- **`client.deleteUserData()`** (`@drakkar.software/sunglasses-core`): GDPR Article 17 right to erasure — clears event queue, traits, session, event counts, local archive; resets identity (new `anonymousId`); calls `adapter.reset()` on all adapters; optionally resets consent to `'unknown'` via `{ resetConsent: true }`
- **`consentExpiryMs`** config option (`@drakkar.software/sunglasses-core`): time-based consent expiry — if stored consent is older than the configured threshold it is automatically reset to `'unknown'` during SDK initialization, prompting the user to re-consent; complements `consentPolicyVersion` (version-based reset)
- **`CaptureOptions`** (`@drakkar.software/sunglasses-core`): `capture(eventName, properties?, options?)` now accepts an optional third argument with `{ timestamp?: string; messageId?: string }` — useful for back-dating offline events or injecting server-side deduplication IDs

### Fixed

- **`tsconfig/base.json`**: set `incremental: false` — TypeScript 5.4+ requires `tsBuildInfoFile` when `incremental: true` is used without emitting to a single file; this was causing `tsup --dts` build failures that were previously hidden by Turborepo's cache
- **`packages/core/tsconfig.json`**: added `"DOM"` to `lib` — `setInterval`, `clearInterval`, `console`, `crypto`, and related browser globals are in the DOM lib, not ES2020; their absence was causing DTS build failures
- **`PiiSanitizer`**: added explicit `as Record<string, unknown>` casts on `deepSanitizeValues()` return sites — fixes TypeScript `TS2322` errors that appeared after restoring strict DTS compilation

### Added

- **Session tracking**: `enableSessionTracking` config + `SessionManager` subsystem; session IDs (random UUIDs) are attached to every event's `context.sessionId`; sessions expire after configurable idle timeout (default 30 min); synthetic `$session_start` event emitted at session boundary
- **Persistent user traits**: `TraitManager` subsystem stores traits set via `identify()` and forwards them on all subsequent events in `context.traits`; sensitive keys (email, phone, etc.) are stripped before storage; traits survive restarts and are cleared on `reset()`
- **Type-safe event catalog**: `EventMap` type + `ISunglassesTypedClient<T>` interface + `asTyped<T>(client)` zero-cost cast for compile-time event name and property checking
- **`@drakkar.software/sunglasses-adapter-console`**: new package that pretty-prints events to the console during development; supports `verbose`, `prefix`, and `onlyFor` options
- **Consent versioning**: `consentPolicyVersion` config option; if the stored policy version differs, consent resets to `'unknown'`; audit trail (`ConsentHistoryEntry[]`) stored in `ConsentState`, accessible via `client.getConsentHistory()`
- **Data portability** (`client.exportUserData()`): GDPR Article 20 — exports anonymousId, distinctId, consentStatus, consentHistory, traits, queuedEvents, archivedEvents, and eventCountSummary as a `UserDataExport` object; no network calls
- **Local event archive** (`enableLocalArchive`): permanent append-only local log of all processed events; survives queue flushes; accessible in `exportUserData().archivedEvents`; prunable via `client.clearLocalArchive(config?)`
- **Starfish path rotation** (`rotatePathOnSuccess: true`): each successful push creates a new Starfish document at an auto-incremented path (`events-0001`, `events-0002`…); no pull step needed; generation counter persisted via `pathStorage`
- **EventCounter**: per-event frequency tracking bucketed by `daily`, `weekly`, `monthly`, and `all-time` periods, persisted to `IStorageAdapter`; accessible via `client.getEventCount()` and `client.resetEventCount()`
- **FrequencyMiddleware**: optional middleware that reads event counts from `EventCounter` and attaches `$count_daily`, `$count_monthly`, etc. to event properties
- **SamplingMiddleware**: optional middleware that drops a configurable fraction of `capture` events to reduce analytics volume; supports per-event and consistent-per-identity sampling modes
- **Cleanup after flush**: `cleanupAfterFlush` config in `SunglassesConfig` and `IAnalyticsAdapter.cleanupAfterFlush()` hook; `StarfishAnalyticsAdapter` implements `pruneDocument()` to remove events older than `maxAgeMs` or beyond `maxEventsPerIdentity`
- **`pruneDocument()`** function in `@drakkar.software/sunglasses-adapter-starfish` for age- and count-based event document pruning
- `client.getQueuedEventCount()` to inspect the current in-memory + persisted queue length
- `client.eventCounter` accessor for direct access to the `EventCounter` instance

### Fixed

- **SunglassesCore `flushOnce()`**: added `flushInFlight` guard to prevent concurrent double-sends; adapter failures no longer cause a premature `return` that would leave other adapters uncontacted — all adapters are attempted, events stay in queue only if at least one fails
- **SunglassesCore `flushOnce()`**: batch is now `Object.freeze`'d before being passed to adapters, enforcing the "must not mutate" contract at runtime
- **PiiSanitizer**: now recursively traverses nested objects and arrays — previously, PII in `{ user: { email: '...' } }` was not detected
- **StarfishAnalyticsAdapter**: replaced recursive `syncWithRetry()` with an iterative loop — prevents potential stack overflow under high 409 contention; added `AbortController` + timeout to all `fetch()` calls
- **HttpStorageAdapter**: removed dead code (`pendingBatch`, `startTimer`, `stopTimer`) that was never called — batching is controlled by `SunglassesCore`

### Tests

- Added test suites for `SunglassesCore`, `IdentityManager`, `MiddlewarePipeline`, `EventCounter`, and `StarfishEventMapper`
- Extended `PiiSanitizer` tests to cover nested object/array traversal

- Initial monorepo scaffold with Turborepo + pnpm workspaces
- `@drakkar.software/sunglasses-core` — platform-agnostic event engine with consent management, identity management, PII sanitization, event queue, and middleware pipeline
- `@drakkar.software/sunglasses-react` — React web provider (`SunglassesProvider`), `useSunglasses` hook, and History API screen tracking
- `@drakkar.software/sunglasses-react-native` — React Native / Expo provider, `useSunglasses` hook, Expo Router screen tracking (`useExpoRouterScreenTracking`), and React Navigation screen tracking (`useNavigationScreenTracking`)
- `@drakkar.software/sunglasses-storage-localstorage` — localStorage persistence adapter for web
- `@drakkar.software/sunglasses-storage-async-storage` — AsyncStorage persistence adapter for React Native
- `@drakkar.software/sunglasses-storage-http` — Batched HTTP push output adapter with exponential backoff retry
- `@drakkar.software/sunglasses-adapter-starfish` — Drakkar-Software/Starfish document-sync output adapter with optimistic locking conflict resolution
- `@drakkar.software/sunglasses-tsconfig` — Shared TypeScript configurations (base, react, react-native)
- `apps/example-web` — Vite + React demo application
- `apps/example-rn` — Expo Router demo application
- Privacy-first defaults: opt-out by default, built-in PII sanitization (email, phone, IPv4, credit card), anonymous UUID identity

[unreleased]: https://github.com/herklos/sunglasses/compare/HEAD...HEAD
