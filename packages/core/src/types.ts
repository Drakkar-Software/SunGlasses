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
 * Implementations: HttpStorageAdapter, StarfishAnalyticsAdapter, console (debug).
 */
export interface IAnalyticsAdapter {
  /** Deliver a batch of events. Must NOT mutate the input array. */
  send(batch: SunglassesEvent[]): Promise<void>;
  /** Called on identity reset — adapter may clear remote session. */
  reset?(): Promise<void>;
  /** Called on SDK shutdown — adapter should flush pending work. */
  shutdown?(): Promise<void>;
  /**
   * Called after a successful flush with the events that were delivered.
   * Use this to archive or remove old events from the remote store.
   * Implement this in adapters that accumulate data (e.g. StarfishAnalyticsAdapter).
   */
  cleanupAfterFlush?(delivered: SunglassesEvent[], config: CleanupConfig): Promise<void>;
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

export type EventType = 'capture' | 'screen' | 'identify' | 'alias';

export interface EventContext {
  library: { name: string; version: string };
  platform: 'web' | 'react-native';
  app?: { name?: string; version?: string; build?: string };
  device?: { type?: string; os?: string };
  screen?: { width?: number; height?: number };
  locale?: string;
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

export interface ConsentState {
  status: ConsentStatus;
  /** ISO-8601 timestamp of last status change, or null on first run. */
  updatedAt: string | null;
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
}

// ---------------------------------------------------------------------------
// Public client interface (framework-agnostic)
// ---------------------------------------------------------------------------

/**
 * The main SDK surface. Implemented by SunglassesCore.
 * Both @sunglasses/react and @sunglasses/react-native expose this via Context.
 */
export interface ISunglassesClient {
  /** Track a custom event. Silently dropped when opted-out or disabled. */
  capture(eventName: string, properties?: Record<string, unknown>): void;
  /** Track a screen/page view. */
  screen(screenName: string, properties?: Record<string, unknown>): void;
  /** Link the current anonymous session to a known user. */
  identify(userId: string, traits?: Record<string, unknown>): void;
  /** Create an alias between two identities (e.g. pre/post login merge). */
  alias(newId: string, existingId: string): void;
  /** Clear identity and generate a fresh anonymous ID. */
  reset(): Promise<void>;

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
// Starfish Adapter config (re-exported for consumers)
// ---------------------------------------------------------------------------

export interface StarfishAdapterConfig {
  /** Base URL of the Starfish sync server, e.g. https://sync.example.com */
  serverUrl: string;
  /**
   * Path template for the event document.
   * Use `{identity}` as a placeholder — it is replaced with `distinctId ?? anonymousId`.
   * Example: "analytics/{identity}/events"
   */
  storagePath: string;
  /** Bearer token for Authorization header. */
  authToken?: string;
  /** Max retries on 409 Conflict (optimistic locking). Default: 3. */
  maxRetries?: number;
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
