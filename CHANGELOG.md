# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.1] — 2026-07-01

### Changed

- **Analytics dashboard — incremental Starfish listing** (`apps/analytics-dashboard`): each sync now resumes `/list` from the last successfully-synced batch id (persisted per app in the existing `localStorage` manifest as `listCursor`) instead of re-walking the entire batch list on every connect and every "Refresh data" click. In steady state (no new data) a sync now issues one `/list` call per app instead of paging through the whole collection. The cursor only advances after every corresponding batch has downloaded successfully, so a partial-download failure resumes cleanly on the next sync rather than skipping the missed batches. This requires a Starfish sync server running `starfish-events` v3.0.0-alpha.62+, which assigns a server-clock-derived, lexicographically-sortable batch id (previously a client-minted random UUID, which can't safely support a resumable cursor — batches are pushed from many end-user devices with untrusted clocks). Older servers are unaffected: the cursor simply never advances and every sync remains a full scan, as before.
- **`@drakkar.software/sunglasses-adapter-starfish`** (0.9.1 → 0.9.2): documented that Starfish's `starfish-events` server plugin (v3.0.0-alpha.62+) assigns the authoritative Parquet batch id server-side and ignores the client-generated `{batchId}` placeholder in the push URL. No adapter behavior changes — `send()` is unaffected — this is purely a documentation update to `StarfishAdapterConfig.pathTemplate`.

## [0.14.0] — 2026-06-30

### Added

- **Built-in exception capture** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): `captureException(client, error, options?)` in core normalizes any thrown value (`Error`, string, or object) into a consent-gated `$error` event, handling both V8 and Hermes (React Native) stack formats. New `CaptureExceptionOptions` type. `SunglassesErrorBoundary` in both framework packages captures render-phase errors (`$error_handled: true`), resolving the client from `<SunglassesProvider>` context with an optional `client` prop override. The `autoCaptureErrors` prop on `SunglassesProvider` enables opt-in global error autocapture (`$error_handled: false`) via `window` `error`/`unhandledrejection` on web and a chained `ErrorUtils` global handler on React Native.
- **Console error/warn capture** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): `patchConsole(client, options?)` in core patches the global `console` and captures `console.error` / `console.warn` output as `$error` events (`$error_handled: false`, `$error_source: 'console'`; `console.warn` maps to `$error_level: 'warning'`). Calls the original method first; guards against capture→log→capture recursion and skips `[SunGlasses]`-prefixed output. `autoCaptureErrors` on `SunglassesProvider` now also accepts `AutoCaptureErrorsOptions` with `console` (opt into console capture, default off) and `globalHandlers` (toggle the `window` / `ErrorUtils` handlers, default true) — passing `true` is unchanged. New `ConsoleCaptureOptions` / `ConsoleLevel` types.
- **Global app metadata** (`@drakkar.software/sunglasses-core`): every event's `context` now includes `environment`, `app.variant`, `app.update` (OTA info), `features`, and `entitlements`. Settable via `SunglassesConfig` (`environment`, `appVariant`, `appUpdate`, `features`, `entitlements`) and updatable at runtime via `setEnvironment()`, `setAppUpdate()`, `setFeatures()`, `setEntitlements()`, `setAppMetadata()`, plus `getAppMetadata()`. App-scoped fields survive `reset()`; user-scoped `entitlements` are cleared by `reset()` and `deleteUserData()`. New exported types `AppUpdateInfo` and `AppMetadata`.
- **Multiple Starfish app slugs** (`apps/analytics-dashboard`): the Starfish data source now supports multiple app slugs configured in one connection. Enter several slugs comma-separated in the "App slugs" field in the setup form (e.g. `my-app, other-app`); all configured apps are synced and their Parquet data is aggregated in DuckDB — use the existing app-filter dropdown to narrow to a single app. Apps can also be added or removed live from the sidebar after connecting without a full reconnect (incrementally syncs the new app or drops the removed app's data, manifest, and cached bytes).
- **Persistent IndexedDB Parquet cache** (`apps/analytics-dashboard`): Parquet batch bytes are now cached in IndexedDB (keyed per app) so page reloads only download genuinely new batches instead of re-pulling every file. The per-app `localStorage` manifest continues to track which filenames exist; bytes are fetched from IndexedDB first and only fall back to the network on a miss (e.g. first reload after upgrade or IDB cleared). The cache is cleared automatically on disconnect.

### Changed

- **Analytics dashboard — fully client-side via DuckDB-WASM** (`apps/analytics-dashboard`): the Fastify + native DuckDB server has been removed entirely. DuckDB now runs in the browser via `@duckdb/duckdb-wasm`. On first connect the browser fetches the WASM bundles from jsDelivr (`cdn.jsdelivr.net`) — Cloudflare Workers' 25 MiB per-asset limit makes self-hosting the 35–41 MiB `.wasm` files impossible, so they are not bundled into `dist/`. The app connects directly to your S3 bucket (Direct S3 mode) or pulls Parquet batches from a Starfish sync server (Starfish mode) — all from the browser. Credentials never leave the browser tab. The deployed Cloudflare build now works standalone with no backend to operate. Breaking: the `ANALYTICS_*` environment variables and local `.s3-config.local.json` / `.starfish-config.local.json` files are no longer read; connect via the in-app setup form instead.

### Fixed

- **Expo Router resolution under Metro** (`@drakkar.software/sunglasses-react-native`): new `react-native` and `browser` export conditions now route Metro (React Native / Expo) bundler consumers to the CJS build (`dist/index.js`) instead of the ESM build (`dist/index.mjs`). The ESM build's optional `require('expo-router')` and `require('promise/setimmediate/rejection-tracking')` calls are emitted as esbuild's `__require(...)` shim, which Metro cannot collect into a numeric dependency id — causing `Requiring unknown module "expo-router"` crashes in production builds (and silently no-op screen tracking and UTM capture even when they do not crash). The CJS build uses plain `require(...)` that Metro collects correctly, so expo-router hooks resolve when expo-router is installed and gracefully no-op when it is not.

### Removed

- **Analytics dashboard — Fastify server** (`apps/analytics-dashboard`): the `server/` directory, `/api/*` routes, `tsx` dev runner, and `concurrently` are removed. `pnpm dev` now runs Vite directly.
- **Analytics dashboard — IAM / credential_chain auth** (`apps/analytics-dashboard`): the "Use IAM role" checkbox is removed. DuckDB-WASM cannot reach the instance-metadata endpoint from a browser; provide explicit AWS access keys instead.

## [0.13.0] — 2026-06-29

### Added

- **Richer error metadata** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): `captureException` now collects and emits a much richer set of `$error_*` properties with zero configuration. New fields: `$error_component_stack` (React `errorInfo.componentStack` from error boundaries), `$error_cause` (the `error.cause` chain serialized as `"Name: msg\ncaused by: …"`, depth-capped at 3), `$error_extra` (custom scalar properties on the Error object, e.g. `code`, `statusCode`), `$error_fatal` (RN `ErrorUtils` `isFatal`), `$error_source` (origin tag: `"boundary"` / `"global"` / `"rejection"` / `"console"`), and `$error_filename` / `$error_line` / `$error_column` (web `ErrorEvent` source location). Three new options on `CaptureExceptionOptions`: `componentStack`, `fatal`, `source` (set by the framework bindings, highest precedence).
- **React component stack capture** (`@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): all four error boundary classes (`SunglassesErrorBoundary`, `SunglassesGlobalErrorBoundary` in both packages) now declare `componentDidCatch(error, errorInfo)` with the second arg and forward `errorInfo.componentStack` as `$error_component_stack`.
- **Web error source location** (`@drakkar.software/sunglasses-react`): the global `window 'error'` handler now reads `event.filename`, `event.lineno`, and `event.colno` and adds them as `$error_filename`, `$error_line`, `$error_column` on the captured event.
- **Fatal flag on React Native** (`@drakkar.software/sunglasses-react-native`): the `ErrorUtils` handler now forwards `isFatal` to `captureException` as the `fatal` option, which is emitted as `$error_fatal`.
- **Source tags on all capture paths** (`@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): every error capture path now tags `$error_source` — `'boundary'` (error boundaries), `'global'` (platform global handlers), `'rejection'` (unhandled promises), or `'console'` (console patching).
- **Richer error detail in analytics dashboard** (`apps/analytics-dashboard`): the Errors detail panel now shows a per-sample card with stack trace, component stack, cause chain, source badge, and fatal badge. The server-side `getErrorDetail` query selects all new `$error_*` fields; the `ErrorDetailData` type in `src/api.ts` and `ErrorDetailResult` in `server/queries.ts` now use `samples: ErrorSample[]` instead of the former flat `stacks: string[]`.

### Changed

- **Stack traces on by default** (`@drakkar.software/sunglasses-core`): `captureException`'s `includeStack` option now defaults to `true` (was `false`). Stack traces help debug errors; set `includeStack: false` explicitly to opt out. `patchConsole` follows the same default. **Migration:** if your privacy policy prohibits stack collection, pass `includeStack: false` to `captureException` / `autoCaptureErrors` / `patchConsole`.
- **PiiSanitizer: substring masking instead of whole-value redaction** (`@drakkar.software/sunglasses-core`): string values that match a PII pattern (email, phone, IPv4, credit card) now have only the matched portion replaced with `[redacted]`, preserving surrounding text. This prevents legitimate error messages and stack traces from being entirely wiped when they happen to contain PII. Bare PII values (`"alice@example.com"`) are still fully replaced. The IPv4 pattern no longer nukes stack traces that contain file paths with version-number-like segments.

## [0.12.2] — 2026-06-29

### Added

- **Landing page** (`apps/landing`): new marketing landing page for the SunGlasses project. React 19 + Vite 8 + Tailwind CSS v4 SPA. "Through the Lens" art direction: frosted glass surfaces over a deep ink base, cyan lens primary, warm amber glare accent. Features an interactive PII-redaction hero demo (a frosted lens sweeps the event card, PII transitions to `[redacted]`; a consent toggle demonstrates the zero-I/O opt-out gate), feature grid, ordered pipeline diagram, comparison table, tabbed Web/React Native quickstart with canonical API code, package cards, and a self-host flow section. Dark mode default, light mode toggle ("shades on/off"). Self-hosted fonts via `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` — no external CDN calls. Links prominently to the docs at `https://drakkar-software.github.io/SunGlasses/`. `private: true`, not published.

- **Analytics dashboard — app filter** (`apps/analytics-dashboard`): new "App" dropdown in the filter bar scopes every query to a specific application. App identity is read from `context.app.name` in each event's JSON context field (not a Parquet column). The `/api/apps` endpoint lists distinct app names with event counts; `(unknown)` is used when the field is absent. All aggregation routes (`/api/overview`, `/api/timeseries`, `/api/dau`, `/api/events/top`, `/api/screens/top`, `/api/retention`) now accept an `app` query parameter and apply the filter via `json_extract_string(context, '$.app.name')`.
- **Analytics dashboard — Errors page** (`apps/analytics-dashboard`): dedicated Errors section in the sidebar replaces the former "Top errors" table. Shows grouped errors (by type + message) with severity badges, handled/unhandled status, occurrence counts, affected-device counts (via `anonymous_id`), and relative timestamps. Selecting a group opens a detail panel with an occurrences-over-time chart, sample stack traces (with a prompt to enable `captureStack` when none are present), and a version/platform breakdown table. New backend routes: `GET /api/errors` (groups), `GET /api/errors/timeseries`, `GET /api/errors/detail`. Privacy: all device counts use `anonymous_id`; `distinct_id` is never selected or displayed.
- **Analytics dashboard — sidebar layout** (`apps/analytics-dashboard`): replaced the horizontal tab bar with a left-side navigation sidebar (Overview, Events, Screens, Errors, Retention, Query). Sidebar collapses to an off-canvas drawer on mobile.
- **Analytics dashboard — dark mode** (`apps/analytics-dashboard`): full light / dark theme via a `ThemeToggle` button in the sidebar footer. Preference is persisted to `localStorage` (`sg-dash-theme`); on first load falls back to `prefers-color-scheme`. Theme is applied before first paint to avoid flash.
- **Analytics dashboard — Tailwind CSS v4** (`apps/analytics-dashboard`): migrated from hand-written CSS to Tailwind v4 (`@tailwindcss/vite` plugin). Semantic CSS-variable design tokens (`--color-background`, `--color-card`, `--color-border`, `--color-primary`, `--color-sidebar-*`, `--color-chart-1…5`, etc.) are defined in `src/index.css` via `@theme {}`; the `.dark {}` override block adapts all tokens automatically so components never need `dark:` utility prefixes.
- **Analytics dashboard — Recharts chart theming** (`apps/analytics-dashboard`): new `useChartTheme()` hook reads CSS-variable color tokens at runtime and re-reads whenever the `dark` class toggles on `<html>`, passing theme-correct colors to Recharts `<Line>`, `<Bar>`, and `<CartesianGrid>` elements.
- **Analytics dashboard — demo seed script** (`apps/analytics-dashboard`): `pnpm --filter analytics-dashboard seed:demo` generates 60 days of demo Parquet data under `.parquet-cache/demo/` with two apps (`octochat-mobile`, `octochat-web`), four error types with varied handled/level/stack state, and realistic event mixes for exploring the app filter and Errors page.

### Changed

- **Analytics dashboard — section layout** (`apps/analytics-dashboard`): former "Breakdowns" tab split into dedicated **Events** and **Screens** sidebar sections; **Retention** and **Query** remain top-level sections. Each section manages its own data fetching via `useTransition` (no more global loading state in `App.tsx`).
- **Analytics dashboard — overview KPIs** (`apps/analytics-dashboard`): the KPI cards now include an **Errors** card showing total error count and affected-device count for the selected range/app; errors are highlighted in destructive red when non-zero.

## [0.12.1] — 2026-06-26

### Fixed

- **`useExpoRouterScreenTracking` production crash** (`@drakkar.software/sunglasses-react-native`): the hook was calling `require('expo-router')` inside the hook body, which Metro cannot resolve in production bundles ("Requiring unknown module 'expo-router'"). Moved resolution to module load time via the existing `expoRouterCompat` shim; a stable no-op fallback ensures the hook call count is constant regardless of whether expo-router is installed.
- **`SunglassesGlobalErrorBoundary` crash when core < 0.12.0** (`@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): `componentDidMount` now guards `subscribeGlobalError` with a `typeof` check so the boundary degrades gracefully (render-phase errors still caught) when an older peer `sunglasses-core` is installed.

### Added

- **Analytics dashboard** (`apps/analytics-dashboard`): full-stack read-only analytics app alongside `ingest-server`. Fastify query API runs DuckDB aggregations over S3 Parquet (`read_parquet` with hive partitioning); React + Recharts UI with overview KPIs, event volume time series, DAU chart, top events/screens/errors tables, day-N retention cohorts, and an ad-hoc read-only SQL console. Shares S3 env vars with `ingest-server`; default port `8788`. Runtime S3 setup screen when `S3_BUCKET` is unset or env credentials fail (`GET /api/config/status`, `POST /api/config`); credentials kept in server memory only. S3 can be configured entirely from the UI (no `.env` required); settings persist to `.s3-config.local.json`. Env-based S3 is opt-in via `S3_CONFIGURE_FROM_ENV=true`.
- **Analytics dashboard — Starfish local-sync** (`apps/analytics-dashboard`): alternative data source when S3/Garage is not publicly reachable. Authenticates to `/v1/analytics` with an admin cap-cert, lists and pulls Parquet batches via Starfish `list` + `pull`, caches locally under `.parquet-cache/`, and runs existing DuckDB queries against the cache. UI setup tab for Starfish vs direct S3; `POST /api/sync` for incremental refresh; config in `.starfish-config.local.json`. Requires Infra analytics namespace with `listable: true`, platform admin enricher, and `starfish-events` pull support via `interceptPull` plugin hook (Starfish ≥ 3.0.0-alpha.44).
- **Analytics dashboard — Starfish public read** (`apps/analytics-dashboard`): optional unauthenticated list/pull when the events collection allows public read (`publicRead` in UI or `STARFISH_PUBLIC_READ=true`); skips admin cap-cert and device signing key.

## [0.12.0] — 2026-06-26

### Added

- **Unhandled promise rejection capture** (`@drakkar.software/sunglasses-react-native`): the `SunglassesProvider` `autoCaptureErrors` option now captures unhandled promise rejections as `$error` events (`$error_handled: false`) in addition to `ErrorUtils` uncaught errors. Uses React Native's bundled rejection tracker (`promise/setimmediate/rejection-tracking`, the same mechanism Sentry uses) when available, with a global `unhandledrejection` listener fallback. Exposed standalone as the new `attachUnhandledRejectionHandler(client, options?)` helper.
- **Error deduplication** (`@drakkar.software/sunglasses-core`): `captureException` now drops errors with the same fingerprint (type + message + first stack frame) captured within a short window, collapsing the common double-capture cases (e.g. an error boundary plus `console.error` capture reporting the same render error, or a global handler firing repeatedly). Configurable via new `dedupe` (default `true`) and `dedupeWindowMs` (default `1000`) options on `CaptureExceptionOptions`. State is isolated per client.
- **Global error bus** (`@drakkar.software/sunglasses-core`): new `publishGlobalError()` / `subscribeGlobalError()` helpers and `GlobalErrorInfo` type — an in-process pub/sub the providers publish to and the new global error boundary consumes. Nothing is persisted or sent by the bus itself.
- **`SunglassesGlobalErrorBoundary`** (`@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): a superset of `SunglassesErrorBoundary` that also renders its fallback for fatal non-render errors (uncaught errors and, opt-in, unhandled rejections) surfaced by the provider's `autoCaptureErrors` handlers. Render-phase errors are captured here (`$error_handled: true`); global errors are captured by the provider (no duplicate events). New `includeNonFatalGlobalErrors` and `includeUnhandledRejections` props (both default `false`).
- **`wrapExpoRouterErrorBoundary`** (`@drakkar.software/sunglasses-react-native`): wraps an Expo Router route-level `ErrorBoundary` export so render errors that reach it are also captured as `$error` events (`$error_handled: true`) with route context (`$route_path`, `$route_name`). The original boundary still renders unchanged; each distinct error is captured once.
- **Granular `unhandledRejections` toggle** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): `AutoCaptureErrorsOptions` gains an `unhandledRejections` flag (default `true`) so uncaught errors (`globalHandlers`) and promise rejections can be toggled independently, matching PostHog's `uncaughtExceptions` / `unhandledRejections` split.

### Changed

- **`captureException` de-duplicates by default** (`@drakkar.software/sunglasses-core`): identical errors captured in quick succession are now collapsed to a single `$error` event. Pass `dedupe: false` to restore the previous always-capture behavior.

### Removed

- **`@drakkar.software/sunglasses-adapter-sentry`** and **`@drakkar.software/sunglasses-adapter-posthog`** — removed in favor of built-in error capture (`captureException`, `SunglassesErrorBoundary`, `autoCaptureErrors`) in `@drakkar.software/sunglasses-react` and `@drakkar.software/sunglasses-react-native`.

## [0.11.0] — 2026-06-26

### Added

- **Console error/warning capture** (`@drakkar.software/sunglasses-core`, `@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): new `patchConsole(client, options?)` core helper patches the global `console` (works on both web and React Native) to capture `console.error` — and, configurably, `console.warn` — as `$error` events (`$error_handled: false`, `$error_source: 'console'`, `console.warn` mapped to `$error_level: 'warning'`). The original console method is always called first, and a re-entrancy guard plus a `[SunGlasses]`-prefix skip prevent capture→log→capture recursion. New exported types `ConsoleCaptureOptions` and `ConsoleLevel`.
- **`autoCaptureErrors` console + handler controls** (`@drakkar.software/sunglasses-react`, `@drakkar.software/sunglasses-react-native`): the `SunglassesProvider` `autoCaptureErrors` option now accepts the new `AutoCaptureErrorsOptions` object form with `console` (`boolean | ConsoleCaptureOptions`, default off) to opt into console capture and `globalHandlers` (default `true`) to toggle the `window` / `ErrorUtils` global handlers. Passing `true` is unchanged (global handlers only). Console patches are cleaned up on unmount.

## [0.10.0] — 2026-06-26

### Added

- **`captureException` helper** (`@drakkar.software/sunglasses-core`): framework-agnostic `captureException(client, error, options?)` that normalizes any thrown value (`Error`, string, or arbitrary object) into a `$error` event and routes it through the consent-gated `capture()`. Options cover `handled` (default `true`), `level`, `includeStack` (default `false`, parses both V8/web and React Native/Hermes stack formats), `maxStackFrames`, `maxMessageLength`, `ignorePatterns`, extra `properties`, and a `beforeCapture` transform. New exported type `CaptureExceptionOptions`.
- **Built-in `SunglassesErrorBoundary`** (`@drakkar.software/sunglasses-react` and `@drakkar.software/sunglasses-react-native`): React error boundary that captures render-phase errors as `$error` events (`$error_handled: true`) with no Sentry adapter required. Resolves the client from the nearest `<SunglassesProvider>` by default, with an optional `client` prop override; accepts a `fallback` and a `config` (`CaptureExceptionOptions`).
- **Opt-in global error autocapture** (`@drakkar.software/sunglasses-react` and `@drakkar.software/sunglasses-react-native`): new `autoCaptureErrors` prop on `SunglassesProvider` captures unhandled errors as `$error` events (`$error_handled: false`). On web it listens to `window` `'error'` and `'unhandledrejection'`; on React Native it chains a global `ErrorUtils` handler (preserving and still invoking the previous one). Pass `true` for defaults or a `CaptureExceptionOptions` object. Listeners/handlers are cleaned up on unmount. Default: off.

## [0.9.0] — 2026-06-26

### Added

- **Global app metadata** (`@drakkar.software/sunglasses-core`): attach typed, non-PII metadata to every event's `context` — `environment`, `app.variant`, `app.update` (OTA / app update info via the new `AppUpdateInfo` type), `features`, and `entitlements`. Settable at init via new `SunglassesConfig` options (`appVariant`, `appUpdate`, `environment`, `features`, `entitlements`) and updatable at runtime via `setEnvironment()`, `setAppUpdate()`, `setFeatures()`, `setEntitlements()`, `setAppMetadata()`, with `getAppMetadata()` to read the snapshot. App-scoped fields (`environment`, `appVariant`, `appUpdate`, `features`) survive `reset()`; user-scoped `entitlements` are cleared by `reset()` and `deleteUserData()`. New exported types `AppUpdateInfo` and `AppMetadata`.

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

[unreleased]: https://github.com/herklos/sunglasses/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/herklos/sunglasses/compare/v0.11.0...v0.12.0
