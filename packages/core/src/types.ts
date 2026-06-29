// =============================================================================
// SunGlasses — Core Types
// All public contracts for the library. Every package imports from here.
// =============================================================================

// ---------------------------------------------------------------------------
// Storage (local persistence layer)
// ---------------------------------------------------------------------------

/**
 * Platform-agnostic key-value storage interface.
 * Implementations: LocalStorageAdapter (web), AsyncStorageAdapter (RN).
 */
export interface IStorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Optional: flush in-flight writes (useful for HTTP-backed stores). */
  flush?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Analytics output destinations
// ---------------------------------------------------------------------------

/**
 * Output destination that receives batches of sanitized, consented events.
 * Implementations include `HttpStorageAdapter` and any custom adapter.
 */
export interface IAnalyticsAdapter {
  /**
   * Deliver a batch of events. Must NOT mutate the input array.
   * The array is `ReadonlyArray` to enforce this at the type level;
   * at runtime it is also `Object.freeze`'d by `SunglassesCore`.
   */
  send(batch: ReadonlyArray<SunglassesEvent>): Promise<void>;
  /** Called on identity reset — adapter may clear remote session. */
  reset?(): Promise<void>;
  /** Called on SDK shutdown — adapter should flush pending work. */
  shutdown?(): Promise<void>;
  /**
   * Called after a successful flush with the events that were delivered.
   * Use this to archive or remove old events from the remote store.
   * Implement in adapters that accumulate data and need post-flush pruning.
   */
  cleanupAfterFlush?(delivered: ReadonlyArray<SunglassesEvent>, config: CleanupConfig): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cleanup configuration
// ---------------------------------------------------------------------------

/**
 * Controls what happens to delivered events in the remote store after a
 * successful flush. Adapters that support `cleanupAfterFlush` will use this
 * to decide which events to archive or remove.
 */
export interface CleanupConfig {
  /** Remove events older than this many milliseconds. Defaults to 30 days. */
  maxAgeMs?: number;
  /**
   * Keep only the most recent N events per identity.
   * Applied after `maxAgeMs`. Set to 0 to disable.
   */
  maxEventsPerIdentity?: number;
}

// ---------------------------------------------------------------------------
// Middleware / Plugin
// ---------------------------------------------------------------------------

export type MiddlewareNext = (event: SunglassesEvent) => Promise<SunglassesEvent | null>;

/**
 * Middleware that can transform or drop events before they are queued.
 * Return `null` to silently drop the event. Must never throw.
 */
export interface IMiddleware {
  name: string;
  process(event: SunglassesEvent, next: MiddlewareNext): Promise<SunglassesEvent | null>;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type EventType = 'capture' | 'screen' | 'identify' | 'alias' | 'group';

/**
 * Over-the-air (OTA) / app update information, e.g. an Expo EAS Update or a web
 * deploy identifier. Useful for correlating events with a specific shipped bundle.
 */
export interface AppUpdateInfo {
  /** Unique identifier of the applied update (e.g. EAS update ID). */
  id?: string;
  /** Release channel the update was published to (e.g. 'production'). */
  channel?: string;
  /** Runtime/native version the update is compatible with. */
  runtimeVersion?: string;
  /** True when running the bundle shipped in the binary (no OTA applied). */
  embedded?: boolean;
  /** ISO-8601 timestamp of when the update was created/published. */
  createdAt?: string;
}

/**
 * Mutable global metadata attached to every event's `context`. Set via
 * `SunglassesConfig` at init and updatable at runtime. In-memory only — the host
 * app must re-supply these values on each boot.
 */
export interface AppMetadata {
  /** Deployment environment, e.g. 'production' | 'staging' | 'development'. */
  environment?: string;
  /** App variant / build flavor, e.g. 'pro' | 'lite' | 'beta'. */
  appVariant?: string;
  /** OTA / app update info for the currently running bundle. */
  appUpdate?: AppUpdateInfo;
  /** Enabled features / experiment variants (app-scoped). */
  features?: string[];
  /** Active user entitlements (user-scoped, cleared on reset()). */
  entitlements?: string[];
}

export interface EventContext {
  library: { name: string; version: string };
  platform: 'web' | 'react-native';
  app?: { name?: string; version?: string; build?: string; variant?: string; update?: AppUpdateInfo };
  device?: { type?: string; os?: string };
  screen?: { width?: number; height?: number };
  locale?: string;
  /** Deployment environment, e.g. 'production' | 'staging' | 'development'. */
  environment?: string;
  /** Enabled features / experiment variants (app-scoped). */
  features?: string[];
  /** Active user entitlements (user-scoped). */
  entitlements?: string[];
  /** Current session ID. Present when enableSessionTracking is true. */
  sessionId?: string;
  /** Persisted user traits set via identify(). Forwarded to backends for segmentation. */
  traits?: Record<string, unknown>;
  /** Group identity set via group(). Enables organization-level segmentation. */
  group?: { id: string };
}

/**
 * Canonical event shape sent to IAnalyticsAdapter implementations.
 */
export interface SunglassesEvent {
  type: EventType;
  /** Human-readable event name, e.g. 'Button Clicked', '$screen', '$identify'. */
  event: string;
  /** Resolved user ID (hashed if anonymizeUserId=true). Falls back to anonymousId. */
  distinctId: string;
  /** Stable device UUID — never contains PII, regenerated only on reset(). */
  anonymousId: string;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
  /** UUID v4 per event — used for de-duplication. */
  messageId: string;
  properties: Record<string, unknown>;
  context: EventContext;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface IdentityState {
  anonymousId: string;
  /** null until identify() is called */
  distinctId: string | null;
  isIdentified: boolean;
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export type ConsentStatus = 'opted-in' | 'opted-out' | 'unknown';

/**
 * A single entry in the consent audit trail.
 */
export interface ConsentHistoryEntry {
  status: ConsentStatus;
  /** Privacy policy version in effect when this change was recorded. */
  policyVersion?: string;
  timestamp: string;
}

export interface ConsentState {
  status: ConsentStatus;
  /** ISO-8601 timestamp of last status change, or null on first run. */
  updatedAt: string | null;
  /** Policy version when consent was last given/revoked. */
  policyVersion?: string;
  /** Audit trail of consent changes. Capped at 10 entries. */
  history?: ConsentHistoryEntry[];
}

// ---------------------------------------------------------------------------
// SDK configuration
// ---------------------------------------------------------------------------

export interface SunglassesConfig {
  // ── Required ──────────────────────────────────────────────────────────────
  /** At least one output adapter is required. */
  adapters: IAnalyticsAdapter[];
  /** Local persistence adapter (platform-specific). */
  storage: IStorageAdapter;

  // ── Privacy ───────────────────────────────────────────────────────────────
  /**
   * When false (default), the SDK starts in opted-out state.
   * The user must explicitly call optIn() before any events are tracked.
   * Set to true for analytics-first flows where consent is obtained externally.
   */
  defaultOptIn?: boolean;
  /** If set, only these property keys are kept. All others are stripped. */
  allowedProperties?: string[];
  /** Property keys that are always stripped (lower precedence than allowedProperties). */
  deniedProperties?: string[];
  /**
   * When true, distinctId is SHA-256 hashed before being included in events.
   * The raw ID is never stored in the event payload.
   */
  anonymizeUserId?: boolean;
  /**
   * When true (default), the SDK checks `navigator.globalPrivacyControl` (GPC)
   * and `navigator.doNotTrack` (DNT) during initialization. If either signal is
   * detected and the user has not yet made an explicit in-app consent choice,
   * the SDK automatically calls `optOut()`.
   *
   * GPC is legally binding under CPRA (California). DNT is advisory.
   *
   * Set to `false` to disable this behavior — for example, if your consent UI
   * already handles opt-out separately.
   *
   * Only applies on the `'web'` platform. No-op on `'react-native'`.
   */
  respectDoNotTrack?: boolean;

  // ── Queue / Flush ─────────────────────────────────────────────────────────
  /** Auto-flush interval in ms. Default: 30_000. */
  flushInterval?: number;
  /** Max events held in the in-memory + persisted queue. Default: 500. */
  maxQueueSize?: number;
  /** Max events per adapter.send() call. Default: 50. */
  maxBatchSize?: number;

  // ── Metadata ──────────────────────────────────────────────────────────────
  platform?: 'web' | 'react-native';
  appName?: string;
  appVersion?: string;
  appBuild?: string;
  /** App variant / build flavor, e.g. 'pro' | 'lite' | 'beta'. Attached to context.app.variant. */
  appVariant?: string;
  /** OTA / app update info for the currently running bundle. Attached to context.app.update. */
  appUpdate?: AppUpdateInfo;
  /** Deployment environment, e.g. 'production' | 'staging'. Attached to context.environment. */
  environment?: string;
  /** Enabled features / experiment variants (app-scoped). Attached to context.features. */
  features?: string[];
  /** Active user entitlements (user-scoped). Attached to context.entitlements. */
  entitlements?: string[];

  // ── Developer ─────────────────────────────────────────────────────────────
  /** Enables verbose console logging. Never enable in production. */
  debug?: boolean;
  /** Hard-disables all tracking (e.g. CI environments, test suites). */
  disabled?: boolean;

  // ── Middleware ─────────────────────────────────────────────────────────────
  /** Additional middleware appended after the built-in PiiSanitizer. */
  middleware?: IMiddleware[];

  // ── Cleanup ───────────────────────────────────────────────────────────────
  /**
   * When set, calls `adapter.cleanupAfterFlush()` after every successful flush.
   * Only adapters that implement `cleanupAfterFlush` will respond.
   * Useful for pruning old events from Starfish documents or remote stores.
   */
  cleanupAfterFlush?: CleanupConfig;

  // ── Event counting ────────────────────────────────────────────────────────
  /**
   * When true, event counts are tracked in storage (see EventCounter).
   * The FrequencyMiddleware must be added to `middleware` to attach counts
   * to events automatically.
   */
  enableEventCounting?: boolean;

  // ── Session tracking ──────────────────────────────────────────────────────
  /**
   * When true, a session ID is generated and attached to every event's context.
   * Sessions expire after `sessionIdleTimeoutMs` of inactivity.
   */
  enableSessionTracking?: boolean;
  /** Idle timeout before a new session is started. Default: 1_800_000 (30 min). */
  sessionIdleTimeoutMs?: number;

  // ── Consent versioning ────────────────────────────────────────────────────
  /**
   * If provided, the SDK checks whether stored consent was given for this policy
   * version. If the stored version differs, consent is reset to 'unknown' so the
   * user is prompted again. Useful when your privacy policy changes.
   */
  consentPolicyVersion?: string;

  /**
   * If set, consent older than this many milliseconds is automatically reset to
   * 'unknown', prompting the user to consent again. Useful for regulatory
   * compliance that requires re-obtaining consent periodically.
   *
   * Example: `365 * 24 * 60 * 60 * 1000` re-asks every year.
   *
   * The expiry check runs on SDK initialization. It does not override an
   * explicit in-session `optIn()` or `optOut()` call.
   */
  consentExpiryMs?: number;

  // ── Local event archive ───────────────────────────────────────────────────
  /**
   * When true, every event that passes the middleware pipeline is also written
   * to a permanent local archive (`sg:archive` in IStorageAdapter).
   *
   * Unlike the EventQueue, the archive is **never cleared automatically** after
   * a flush — events persist until `client.clearLocalArchive()` is called.
   *
   * Use cases:
   * - Keep a full local history for GDPR data portability
   * - Re-sync a remote store from scratch after a failure
   * - Offline-first: accumulate events even if all adapters are down
   */
  enableLocalArchive?: boolean;
}

// ---------------------------------------------------------------------------
// Public client interface (framework-agnostic)
// ---------------------------------------------------------------------------

/**
 * The main SDK surface. Implemented by SunglassesCore.
 * Both @drakkar.software/sunglasses-react and @drakkar.software/sunglasses-react-native expose this via Context.
 */
export interface ISunglassesClient {
  /**
   * Track a custom event. Silently dropped when opted-out or disabled.
   * @param options - Optional overrides for timestamp and messageId.
   */
  capture(eventName: string, properties?: Record<string, unknown>, options?: CaptureOptions): void;
  /** Track a screen/page view. */
  screen(screenName: string, properties?: Record<string, unknown>): void;
  /** Link the current anonymous session to a known user. */
  identify(userId: string, traits?: Record<string, unknown>): void;
  /** Create an alias between two identities (e.g. pre/post login merge). */
  alias(newId: string, existingId: string): void;
  /**
   * Associate the current user with a group (e.g. organisation, workspace, team).
   * Emits a `group` event and attaches the group ID to all subsequent events via
   * `context.group`. Silently dropped when opted-out or disabled.
   *
   * Group identity is in-memory only and must be re-set after `reset()` or restart.
   */
  group(groupId: string, groupTraits?: Record<string, unknown>): void;
  /** Clear identity and generate a fresh anonymous ID. */
  reset(): Promise<void>;

  // ── Super properties ──────────────────────────────────────────────────────
  /**
   * Register properties that are automatically merged into every subsequent event.
   * Per-event properties passed to `capture()` override registered properties with
   * the same key. Use for non-PII session/environment metadata such as
   * `{ environment: 'production', experiment_group: 'A' }`.
   *
   * Registered properties are in-memory only and must be re-registered on restart.
   */
  register(properties: Record<string, unknown>): void;
  /**
   * Remove specific keys from the registered super properties.
   * If called with no arguments, all registered properties are cleared.
   */
  unregister(...keys: string[]): void;
  /** Returns a snapshot of all currently registered super properties. */
  getRegisteredProperties(): Record<string, unknown>;

  // ── App metadata ──────────────────────────────────────────────────────────
  /**
   * Set the deployment environment (e.g. 'production', 'staging'). Attached to
   * every subsequent event's `context.environment`. In-memory only.
   */
  setEnvironment(environment: string): void;
  /**
   * Set OTA / app update info for the currently running bundle. Attached to
   * every subsequent event's `context.app.update`. In-memory only.
   */
  setAppUpdate(update: AppUpdateInfo): void;
  /**
   * Set the list of enabled features / experiment variants (app-scoped).
   * Attached to every subsequent event's `context.features`. In-memory only.
   */
  setFeatures(features: string[]): void;
  /**
   * Set the active user entitlements (user-scoped). Attached to every subsequent
   * event's `context.entitlements`. Cleared by `reset()` and `deleteUserData()`.
   * In-memory only.
   */
  setEntitlements(entitlements: string[]): void;
  /**
   * Merge a partial set of global app metadata. Only the provided keys are
   * updated; omitted keys keep their current value. In-memory only.
   */
  setAppMetadata(meta: Partial<AppMetadata>): void;
  /** Returns a snapshot of the current global app metadata. */
  getAppMetadata(): AppMetadata;

  // ── Consent ───────────────────────────────────────────────────────────────
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  hasOptedIn(): boolean;
  hasOptedOut(): boolean;
  getConsentStatus(): ConsentStatus;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Force-flush the event queue to all adapters immediately. */
  flush(): Promise<void>;
  /** Flush and tear down timers. Call on app/component unmount. */
  shutdown(): Promise<void>;

  // ── Event counting ────────────────────────────────────────────────────────
  /**
   * Get the number of times an event has been fired in a given period.
   * Returns 0 if event counting is disabled or no data exists.
   */
  getEventCount(eventName: string, period: EventCountPeriod, date?: Date): Promise<number>;

  /**
   * Reset the count for a specific event (or all events if omitted).
   */
  resetEventCount(eventName?: string): Promise<void>;

  /** Access the underlying EventCounter for advanced usage. */
  readonly eventCounter: IEventCounter | null;

  /** Expose the current queue length (e.g. for UI indicators). */
  getQueuedEventCount(): number;

  // ── Consent history ───────────────────────────────────────────────────────
  /** Returns the audit trail of consent changes (most recent last). */
  getConsentHistory(): ConsentHistoryEntry[];

  // ── Local event archive ───────────────────────────────────────────────────
  /**
   * Prune archived events by age / count, or clear them entirely.
   * No-op if `enableLocalArchive` was not set in config.
   *
   * @param config — pass an empty object `{}` to clear everything
   */
  clearLocalArchive(config?: CleanupConfig): Promise<void>;

  // ── Data portability ──────────────────────────────────────────────────────
  /**
   * Export all locally held user data as a structured object.
   * GDPR Article 20 — right to data portability.
   * No network calls — reads only from in-memory subsystem state.
   */
  exportUserData(): Promise<UserDataExport>;

  /**
   * Erase all locally held user data.
   * GDPR Article 17 — right to erasure.
   *
   * Clears: event queue, user traits, session, event counts, local archive.
   * Resets identity to a fresh anonymous ID (new UUID, no distinctId).
   * Clears in-memory super properties and group identity.
   * Calls `adapter.reset()` on all adapters.
   *
   * @param options.resetConsent - When true, also resets consent status to
   *   'unknown' so the user is prompted to consent again. Defaults to false
   *   because the consent audit trail is evidence of past user choices and
   *   may have regulatory significance.
   */
  deleteUserData(options?: { resetConsent?: boolean }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Event counting
// ---------------------------------------------------------------------------

/** Time granularity for event frequency tracking. */
export type EventCountPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

/**
 * Tracks how many times each event has been fired, bucketed by time period.
 * Counts are persisted to IStorageAdapter and survive app restarts.
 */
export interface IEventCounter {
  /**
   * Increment the count for an event on a given date (defaults to now).
   */
  increment(eventName: string, date?: Date): Promise<void>;

  /**
   * Get the count for an event in a period.
   * - 'daily': count for the calendar day containing `date`
   * - 'weekly': count for the ISO week containing `date` (Mon–Sun)
   * - 'monthly': count for the calendar month containing `date`
   * - 'all-time': total count across all time
   */
  getCount(eventName: string, period: EventCountPeriod, date?: Date): Promise<number>;

  /**
   * Reset the count for a specific event, or all events if `eventName` is omitted.
   */
  reset(eventName?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// HTTP Adapter config (re-exported for consumers)
// ---------------------------------------------------------------------------

export interface HttpAdapterConfig {
  /** Full URL of the ingest endpoint, e.g. https://analytics.example.com/batch */
  endpoint: string;
  /** Extra request headers, e.g. { 'X-API-Key': '...' } */
  headers?: Record<string, string>;
  /** Events per POST request. Default: 50. */
  batchSize?: number;
  /** Auto-flush interval in ms. Default: 30_000. */
  flushIntervalMs?: number;
  /** Maximum retry attempts before discarding a batch. Default: 3. */
  maxRetries?: number;
  /** Initial retry delay in ms (doubles each attempt). Default: 1_000. */
  retryBaseDelayMs?: number;
  /** Max retry delay cap in ms. Default: 30_000. */
  retryMaxDelayMs?: number;
  /** Request timeout in ms. Default: 10_000. */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Session tracking
// ---------------------------------------------------------------------------

/**
 * In-memory + persisted session state.
 * Session IDs are random UUIDs — they never contain PII.
 */
export interface SessionState {
  sessionId: string;
  startedAt: string;
  lastActiveAt: string;
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Data portability (GDPR Article 20)
// ---------------------------------------------------------------------------

/**
 * Machine-readable snapshot of all user data held locally by the SDK.
 * Returned by `client.exportUserData()`.
 */
export interface UserDataExport {
  exportedAt: string;
  anonymousId: string;
  distinctId: string | null;
  consentStatus: ConsentStatus;
  consentHistory: ConsentHistoryEntry[];
  /** Persisted user traits set via identify(). */
  traits: Record<string, unknown>;
  /** Events that have been queued but not yet delivered to any adapter. */
  queuedEvents: SunglassesEvent[];
  /**
   * All events in the local archive.
   * Only populated when `enableLocalArchive: true`.
   */
  archivedEvents: SunglassesEvent[];
  /**
   * Summary of event counts per period.
   * Only populated when `enableEventCounting: true`.
   */
  eventCountSummary: {
    [eventName: string]: Partial<Record<EventCountPeriod, number>>;
  };
}

// ---------------------------------------------------------------------------
// Capture options
// ---------------------------------------------------------------------------

/**
 * Optional overrides for a single `capture()` call.
 * Use sparingly — the defaults (auto timestamp, auto messageId) are correct
 * for the vast majority of use cases.
 */
export interface CaptureOptions {
  /**
   * Override the event timestamp (ISO-8601 UTC string).
   * Useful for back-dating events captured offline or migrating historical data.
   * Defaults to `Date.now()` at the time `capture()` is called.
   */
  timestamp?: string;
  /**
   * Override the deduplication ID (UUID v4).
   * Useful when the event was originally generated server-side and you want
   * to guarantee idempotent delivery even after retries.
   * Defaults to a freshly generated UUID v4.
   */
  messageId?: string;
}

// ---------------------------------------------------------------------------
// Type-safe event catalog
// ---------------------------------------------------------------------------

/**
 * A map of event name → required properties shape.
 * Use with `asTyped<MyEventMap>(client)` to get compile-time checked `capture()`.
 *
 * @example
 * type MyEvents = {
 *   button_clicked: { buttonId: string; screen: string };
 *   purchase_completed: { itemId: string; amount: number };
 *   page_viewed: undefined; // no required properties
 * };
 */
export type EventMap = Record<string, Record<string, unknown> | undefined>;

/**
 * Typed wrapper around ISunglassesClient.
 * Provides compile-time checking of event names and their property shapes.
 * Zero runtime cost — use `asTyped<T>(client)` to obtain one.
 */
export interface ISunglassesTypedClient<T extends EventMap> extends ISunglassesClient {
  capture<K extends keyof T & string>(
    eventName: K,
    ...args: T[K] extends undefined
      ? [properties?: Record<string, unknown>]
      : [properties: T[K]]
  ): void;
}

// ---------------------------------------------------------------------------
// Error event properties (shared across error-capturing code)
// ---------------------------------------------------------------------------

/**
 * Standard properties emitted by error-capturing code as `$error` events.
 * Used by `captureException`, `SunglassesErrorBoundary`, and `autoCaptureErrors`.
 */
export interface ErrorEventProperties {
  $error_message: string;
  $error_type: string;
  /** `true` when caught by an error boundary / try-catch; `false` for unhandled errors. */
  $error_handled: boolean;
  /** Sentry-compatible severity level. Usually `'error'`. */
  $error_level: string;
  /** Stringified stack trace (trimmed to `maxStackFrames`). On by default. */
  $error_stack?: string;
  /**
   * React component stack from `errorInfo.componentStack` (boundaries only).
   * Populated when the error is caught by a `SunglassesErrorBoundary` or
   * `SunglassesGlobalErrorBoundary`.
   */
  $error_component_stack?: string;
  /**
   * Serialized `error.cause` chain — each link formatted as `"Name: message"`,
   * joined by `"\ncaused by: "`, depth-capped at 3 levels.
   */
  $error_cause?: string;
  /**
   * Custom enumerable properties on the Error object beyond the standard
   * `message / name / stack / cause` keys (e.g. `code`, `statusCode`).
   * Scalar values only (string/number/boolean); nested objects are skipped.
   */
  $error_extra?: Record<string, unknown>;
  /**
   * Whether the error was fatal (React Native `ErrorUtils` `isFatal` only).
   * Absent on web.
   */
  $error_fatal?: boolean;
  /**
   * Where the error was captured: `'boundary'` (error boundary / component
   * `componentDidCatch`), `'global'` (platform global handler), `'rejection'`
   * (unhandled promise), or `'console'` (console patching).
   */
  $error_source?: string;
  /** Source filename for web `window 'error'` events (`ErrorEvent.filename`). */
  $error_filename?: string;
  /** Source line number for web `window 'error'` events (`ErrorEvent.lineno`). */
  $error_line?: number;
  /** Source column number for web `window 'error'` events (`ErrorEvent.colno`). */
  $error_column?: number;
  /** Allows adapter-specific extension properties (e.g. from `beforeCapture`). */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Screen tracking
// ---------------------------------------------------------------------------

export interface ScreenTrackingOptions {
  /** Web: listen to history.pushState / replaceState / popstate. Default: true. */
  useHistoryApi?: boolean;
  /** RN + Expo Router: auto-listen to usePathname changes. */
  useExpoRouter?: boolean;
  /** RN + React Navigation: pass the NavigationContainerRef. */
  navigationRef?: unknown;
  /** Transform raw pathname/route name → human-readable screen name. */
  screenNameMapper?: (path: string) => string;
}
