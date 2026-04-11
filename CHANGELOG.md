# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-04-11

### Added

- **Device / browser context auto-enrichment** (`@sunglasses/core`): `buildContext()` now automatically populates `context.device` (type + OS detected from `userAgent`), `context.screen` (width × height), and `context.locale` (`navigator.language`) on web platform — fields that existed in the type but were always empty in emitted events
- **UTM / attribution capture** (`@sunglasses/react`): new `captureUtmParams(client)` utility reads `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` from the current URL's search params plus `$referrer` / `$referring_domain` from `document.referrer`, and registers them as super properties via `client.register()`
- **Screen URL metadata** (`@sunglasses/react`): `useScreenTracking` now automatically attaches `$url` (full URL), `$path` (pathname), `$title` (document title), and `$referrer` (previous path for SPA navigation; `document.referrer` on initial load) to every screen event
- **`client.deleteUserData()`** (`@sunglasses/core`): GDPR Article 17 right to erasure — clears event queue, traits, session, event counts, local archive; resets identity (new `anonymousId`); calls `adapter.reset()` on all adapters; optionally resets consent to `'unknown'` via `{ resetConsent: true }`
- **`consentExpiryMs`** config option (`@sunglasses/core`): time-based consent expiry — if stored consent is older than the configured threshold it is automatically reset to `'unknown'` during SDK initialization, prompting the user to re-consent; complements `consentPolicyVersion` (version-based reset)
- **`CaptureOptions`** (`@sunglasses/core`): `capture(eventName, properties?, options?)` now accepts an optional third argument with `{ timestamp?: string; messageId?: string }` — useful for back-dating offline events or injecting server-side deduplication IDs

### Fixed

- **`tsconfig/base.json`**: set `incremental: false` — TypeScript 5.4+ requires `tsBuildInfoFile` when `incremental: true` is used without emitting to a single file; this was causing `tsup --dts` build failures that were previously hidden by Turborepo's cache
- **`packages/core/tsconfig.json`**: added `"DOM"` to `lib` — `setInterval`, `clearInterval`, `console`, `crypto`, and related browser globals are in the DOM lib, not ES2020; their absence was causing DTS build failures
- **`PiiSanitizer`**: added explicit `as Record<string, unknown>` casts on `deepSanitizeValues()` return sites — fixes TypeScript `TS2322` errors that appeared after restoring strict DTS compilation

### Added

- **Session tracking**: `enableSessionTracking` config + `SessionManager` subsystem; session IDs (random UUIDs) are attached to every event's `context.sessionId`; sessions expire after configurable idle timeout (default 30 min); synthetic `$session_start` event emitted at session boundary
- **Persistent user traits**: `TraitManager` subsystem stores traits set via `identify()` and forwards them on all subsequent events in `context.traits`; sensitive keys (email, phone, etc.) are stripped before storage; traits survive restarts and are cleared on `reset()`
- **Type-safe event catalog**: `EventMap` type + `ISunglassesTypedClient<T>` interface + `asTyped<T>(client)` zero-cost cast for compile-time event name and property checking
- **`@sunglasses/adapter-console`**: new package that pretty-prints events to the console during development; supports `verbose`, `prefix`, and `onlyFor` options
- **Consent versioning**: `consentPolicyVersion` config option; if the stored policy version differs, consent resets to `'unknown'`; audit trail (`ConsentHistoryEntry[]`) stored in `ConsentState`, accessible via `client.getConsentHistory()`
- **Data portability** (`client.exportUserData()`): GDPR Article 20 — exports anonymousId, distinctId, consentStatus, consentHistory, traits, queuedEvents, archivedEvents, and eventCountSummary as a `UserDataExport` object; no network calls
- **Local event archive** (`enableLocalArchive`): permanent append-only local log of all processed events; survives queue flushes; accessible in `exportUserData().archivedEvents`; prunable via `client.clearLocalArchive(config?)`
- **Starfish path rotation** (`rotatePathOnSuccess: true`): each successful push creates a new Starfish document at an auto-incremented path (`events-0001`, `events-0002`…); no pull step needed; generation counter persisted via `pathStorage`
- **EventCounter**: per-event frequency tracking bucketed by `daily`, `weekly`, `monthly`, and `all-time` periods, persisted to `IStorageAdapter`; accessible via `client.getEventCount()` and `client.resetEventCount()`
- **FrequencyMiddleware**: optional middleware that reads event counts from `EventCounter` and attaches `$count_daily`, `$count_monthly`, etc. to event properties
- **SamplingMiddleware**: optional middleware that drops a configurable fraction of `capture` events to reduce analytics volume; supports per-event and consistent-per-identity sampling modes
- **Cleanup after flush**: `cleanupAfterFlush` config in `SunglassesConfig` and `IAnalyticsAdapter.cleanupAfterFlush()` hook; `StarfishAnalyticsAdapter` implements `pruneDocument()` to remove events older than `maxAgeMs` or beyond `maxEventsPerIdentity`
- **`pruneDocument()`** function in `@sunglasses/adapter-starfish` for age- and count-based event document pruning
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
- `@sunglasses/core` — platform-agnostic event engine with consent management, identity management, PII sanitization, event queue, and middleware pipeline
- `@sunglasses/react` — React web provider (`SunglassesProvider`), `useSunglasses` hook, and History API screen tracking
- `@sunglasses/react-native` — React Native / Expo provider, `useSunglasses` hook, Expo Router screen tracking (`useExpoRouterScreenTracking`), and React Navigation screen tracking (`useNavigationScreenTracking`)
- `@sunglasses/storage-localstorage` — localStorage persistence adapter for web
- `@sunglasses/storage-async-storage` — AsyncStorage persistence adapter for React Native
- `@sunglasses/storage-http` — Batched HTTP push output adapter with exponential backoff retry
- `@sunglasses/adapter-starfish` — Drakkar-Software/Starfish document-sync output adapter with optimistic locking conflict resolution
- `@sunglasses/tsconfig` — Shared TypeScript configurations (base, react, react-native)
- `apps/example-web` — Vite + React demo application
- `apps/example-rn` — Expo Router demo application
- Privacy-first defaults: opt-out by default, built-in PII sanitization (email, phone, IPv4, credit card), anonymous UUID identity

[unreleased]: https://github.com/herklos/sunglasses/compare/HEAD...HEAD
