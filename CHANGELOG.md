# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
