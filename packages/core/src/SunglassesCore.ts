import { ConsentManager } from './ConsentManager.js';
import { EventCounter } from './EventCounter.js';
import { EventQueue } from './EventQueue.js';
import { IdentityManager } from './IdentityManager.js';
import { LocalEventArchive } from './LocalEventArchive.js';
import { MiddlewarePipeline } from './MiddlewarePipeline.js';
import { PiiSanitizer } from './PiiSanitizer.js';
import { SessionManager } from './SessionManager.js';
import { TraitManager } from './TraitManager.js';
import type {
  CaptureOptions,
  CleanupConfig,
  ConsentHistoryEntry,
  ConsentStatus,
  EventContext,
  EventCountPeriod,
  EventType,
  IAnalyticsAdapter,
  IEventCounter,
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
  UserDataExport,
} from './types.js';
import { createLogger } from './utils/logger.js';
import { nowISO } from './utils/timestamp.js';
import { generateUUID } from './utils/uuid.js';

const LIBRARY_NAME = '@sunglasses/core';
const LIBRARY_VERSION = '0.2.0';

const DEFAULT_FLUSH_INTERVAL = 30_000;
const DEFAULT_MAX_QUEUE_SIZE = 500;
const DEFAULT_MAX_BATCH_SIZE = 50;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000; // 30 min

/**
 * Core SDK engine. Platform-agnostic implementation of ISunglassesClient.
 *
 * Use SunglassesCore.create(config) to get an initialized instance.
 * Do not construct directly — initialization is async and must complete
 * before any events are captured.
 */
export class SunglassesCore implements ISunglassesClient {
  private readonly consent: ConsentManager;
  private readonly identity: IdentityManager;
  private readonly queue: EventQueue;
  private readonly pipeline: MiddlewarePipeline;
  private readonly adapters: IAnalyticsAdapter[];
  private readonly _eventCounter: EventCounter | null;
  private readonly cleanupConfig: CleanupConfig | null;
  private readonly sessionManager: SessionManager | null;
  private readonly traitManager: TraitManager;
  private readonly localArchive: LocalEventArchive | null;
  private readonly config: Required<
    Pick<
      SunglassesConfig,
      | 'defaultOptIn'
      | 'flushInterval'
      | 'maxBatchSize'
      | 'maxQueueSize'
      | 'platform'
      | 'appName'
      | 'appVersion'
      | 'appBuild'
      | 'debug'
      | 'disabled'
      | 'anonymizeUserId'
    >
  > & {
    consentPolicyVersion: string | undefined;
  };
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isShutdown = false;
  /** Guard against concurrent flushes — prevents double-send. */
  private flushInFlight = false;
  /** In-memory super properties merged into every event's properties. */
  private readonly superProperties = new Map<string, unknown>();
  /** In-memory group ID attached to every event's context after group() is called. */
  private groupId: string | null = null;

  private constructor(
    config: SunglassesConfig,
    consent: ConsentManager,
    identity: IdentityManager,
    queue: EventQueue,
    pipeline: MiddlewarePipeline,
    eventCounter: EventCounter | null,
    sessionManager: SessionManager | null,
    traitManager: TraitManager,
    localArchive: LocalEventArchive | null
  ) {
    this.config = {
      defaultOptIn: config.defaultOptIn ?? false,
      flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      platform: config.platform ?? 'web',
      appName: config.appName ?? '',
      appVersion: config.appVersion ?? '',
      appBuild: config.appBuild ?? '',
      debug: config.debug ?? false,
      disabled: config.disabled ?? false,
      anonymizeUserId: config.anonymizeUserId ?? false,
      consentPolicyVersion: config.consentPolicyVersion,
    };
    this.consent = consent;
    this.identity = identity;
    this.queue = queue;
    this.pipeline = pipeline;
    this.adapters = config.adapters;
    this._eventCounter = eventCounter;
    this.cleanupConfig = config.cleanupAfterFlush ?? null;
    this.sessionManager = sessionManager;
    this.traitManager = traitManager;
    this.localArchive = localArchive;
  }

  /**
   * Create and initialize a SunglassesCore instance.
   * This is the only way to construct the SDK.
   */
  static async create(config: SunglassesConfig): Promise<SunglassesCore> {
    if (!config.adapters || config.adapters.length === 0) {
      throw new Error('SunglassesCore: at least one adapter is required');
    }

    const logger = createLogger(config.debug ?? false);
    const consent = new ConsentManager(config.storage, logger);
    const identity = new IdentityManager(
      config.storage,
      logger,
      config.anonymizeUserId ?? false
    );
    const queue = new EventQueue(
      config.storage,
      logger,
      config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
    );

    // PiiSanitizer is always first in the middleware pipeline
    const piiSanitizer = new PiiSanitizer(config.allowedProperties, config.deniedProperties);
    const middlewares = [piiSanitizer, ...(config.middleware ?? [])];
    const pipeline = new MiddlewarePipeline(middlewares, logger);

    // Optional event counting
    const eventCounter = config.enableEventCounting
      ? new EventCounter(config.storage, logger)
      : null;

    // Optional session tracking
    const sessionManager = config.enableSessionTracking
      ? new SessionManager(
          config.storage,
          logger,
          config.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS
        )
      : null;

    // Trait manager — always active
    const traitManager = new TraitManager(config.storage, logger);

    // Optional local event archive
    const localArchive = config.enableLocalArchive
      ? new LocalEventArchive(config.storage, logger)
      : null;

    const instance = new SunglassesCore(
      config,
      consent,
      identity,
      queue,
      pipeline,
      eventCounter,
      sessionManager,
      traitManager,
      localArchive
    );

    // Initialize subsystems
    await consent.initialize(config.defaultOptIn ?? false, config.consentPolicyVersion, config.consentExpiryMs);
    await identity.initialize();
    await queue.initialize();
    await traitManager.initialize();
    if (sessionManager) {
      await sessionManager.initialize();
    }
    if (localArchive) {
      await localArchive.initialize();
    }

    // GPC / DNT auto-opt-out (web only, only when consent is still 'unknown')
    // GPC (navigator.globalPrivacyControl) is legally binding under CPRA.
    // DNT (navigator.doNotTrack) is advisory. Neither overrides an explicit user choice.
    //
    // Access navigator through globalThis to stay within lib: ["ES2020"] without
    // requiring DOM lib types in the core package.
    if (
      config.respectDoNotTrack !== false &&
      (config.platform ?? 'web') === 'web' &&
      consent.status === 'unknown' &&
      'navigator' in globalThis
    ) {
      type NavHints = { doNotTrack?: string; globalPrivacyControl?: boolean };
      const nav = (globalThis as Record<string, unknown>)['navigator'] as NavHints;
      const hasGpc = nav.globalPrivacyControl === true;
      const hasDnt = nav.doNotTrack === '1';
      if (hasGpc || hasDnt) {
        await consent.optOut();
        logger.debug('SunglassesCore: auto opted-out via privacy signal', { gpc: hasGpc, dnt: hasDnt });
      }
    }

    // Start auto-flush timer
    if (!(config.disabled ?? false)) {
      instance.startFlushTimer();
    }

    logger.debug('SunglassesCore: initialized', {
      platform: config.platform ?? 'web',
      defaultOptIn: config.defaultOptIn ?? false,
      consentStatus: consent.status,
      eventCounting: config.enableEventCounting ?? false,
      sessionTracking: config.enableSessionTracking ?? false,
      localArchive: config.enableLocalArchive ?? false,
    });

    return instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  capture(eventName: string, properties?: Record<string, unknown>, options?: CaptureOptions): void {
    this.enqueueEvent('capture', eventName, properties, options);
  }

  screen(screenName: string, properties?: Record<string, unknown>): void {
    this.enqueueEvent('screen', '$screen', {
      ...properties,
      $screen_name: screenName,
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.canCapture()) return;

    // Store traits in TraitManager (fire-and-forget — does not block)
    if (traits && Object.keys(traits).length > 0) {
      this.traitManager.setTraits(traits).catch(() => {});
    }

    // Perform async identity update without blocking the call
    this.identity
      .identify(userId)
      .then((resolvedId) => {
        this.enqueueEvent('identify', '$identify', {
          ...traits,
          $user_id: resolvedId,
        });
      })
      .catch(() => {
        // Identity storage failed — still enqueue with anonymousId
        this.enqueueEvent('identify', '$identify', { ...traits });
      });
  }

  alias(newId: string, existingId: string): void {
    this.enqueueEvent('alias', '$alias', {
      alias: newId,
      previous_id: existingId,
    });
  }

  group(groupId: string, groupTraits?: Record<string, unknown>): void {
    if (!this.canCapture()) return;
    this.groupId = groupId;
    this.enqueueEvent('group', '$group', {
      ...groupTraits,
      $group_id: groupId,
    });
  }

  // ── Super properties ──────────────────────────────────────────────────────

  register(properties: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(properties)) {
      this.superProperties.set(key, value);
    }
  }

  unregister(...keys: string[]): void {
    if (keys.length === 0) {
      this.superProperties.clear();
      return;
    }
    for (const key of keys) {
      this.superProperties.delete(key);
    }
  }

  getRegisteredProperties(): Record<string, unknown> {
    return Object.fromEntries(this.superProperties);
  }

  async reset(): Promise<void> {
    await this.identity.reset();
    await this.queue.clear();
    await this.traitManager.clearTraits();
    this.groupId = null;
    if (this.sessionManager) {
      await this.sessionManager.end();
    }
    for (const adapter of this.adapters) {
      await adapter.reset?.();
    }
  }

  async optIn(): Promise<void> {
    await this.consent.optIn();
    this.startFlushTimer();
  }

  async optOut(): Promise<void> {
    await this.consent.optOut();
    // Stop the flush timer — no network calls when opted out
    this.stopFlushTimer();
    // Clear the queue so no stale events remain
    await this.queue.clear();
  }

  hasOptedIn(): boolean {
    return this.consent.isOptedIn();
  }

  hasOptedOut(): boolean {
    return this.consent.isOptedOut();
  }

  getConsentStatus(): ConsentStatus {
    return this.consent.status;
  }

  getConsentHistory(): ConsentHistoryEntry[] {
    return this.consent.getHistory();
  }

  async flush(): Promise<void> {
    if (!this.canCapture()) return;
    await this.flushOnce();
  }

  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    this.stopFlushTimer();

    if (this.canCapture()) {
      await this.flushOnce();
    }

    for (const adapter of this.adapters) {
      await adapter.shutdown?.();
    }
  }

  // ── Event counting ─────────────────────────────────────────────────────────

  get eventCounter(): IEventCounter | null {
    return this._eventCounter;
  }

  async getEventCount(eventName: string, period: EventCountPeriod, date?: Date): Promise<number> {
    if (!this._eventCounter) return 0;
    return this._eventCounter.getCount(eventName, period, date);
  }

  async resetEventCount(eventName?: string): Promise<void> {
    await this._eventCounter?.reset(eventName);
  }

  getQueuedEventCount(): number {
    return this.queue.size;
  }

  // ── Local event archive ────────────────────────────────────────────────────

  /**
   * Prune the local event archive by age/count, or clear it entirely.
   * Pass `{}` to clear all archived events.
   * No-op when `enableLocalArchive` was not set in config.
   */
  async clearLocalArchive(config: CleanupConfig = {}): Promise<void> {
    if (!this.localArchive) return;
    if (
      config.maxAgeMs === undefined &&
      config.maxEventsPerIdentity === undefined
    ) {
      await this.localArchive.clear();
    } else {
      await this.localArchive.cleanup(config);
    }
  }

  // ── Data portability ───────────────────────────────────────────────────────

  /**
   * Export all locally held user data as a machine-readable object.
   * GDPR Article 20 — right to data portability.
   */
  async exportUserData(): Promise<UserDataExport> {
    const identityState = this.identity.getState();

    // Snapshot the queue once — reused for both the export and count summary
    const queuedEvents = this.queue.peek(this.config.maxQueueSize);

    // Build event count summary if counting is enabled
    const eventCountSummary: UserDataExport['eventCountSummary'] = {};
    if (this._eventCounter) {
      const eventNames = [...new Set(queuedEvents.map((e) => e.event))];
      for (const name of eventNames) {
        const [daily, weekly, monthly, allTime] = await Promise.all([
          this._eventCounter.getCount(name, 'daily'),
          this._eventCounter.getCount(name, 'weekly'),
          this._eventCounter.getCount(name, 'monthly'),
          this._eventCounter.getCount(name, 'all-time'),
        ]);
        eventCountSummary[name] = { daily, weekly, monthly, 'all-time': allTime };
      }
    }

    return {
      exportedAt: nowISO(),
      anonymousId: identityState.anonymousId,
      distinctId: identityState.distinctId,
      consentStatus: this.consent.status,
      consentHistory: this.consent.getHistory(),
      traits: this.traitManager.getTraits(),
      queuedEvents,
      archivedEvents: this.localArchive ? this.localArchive.getAll() : [],
      eventCountSummary,
    };
  }

  // ── Data erasure ───────────────────────────────────────────────────────────

  /**
   * Erase all locally held user data. GDPR Article 17 — right to erasure.
   */
  async deleteUserData(options: { resetConsent?: boolean } = {}): Promise<void> {
    // Clear persisted event data
    await this.queue.clear();
    await this.traitManager.clearTraits();
    await this._eventCounter?.reset();
    if (this.sessionManager) await this.sessionManager.end();
    if (this.localArchive) await this.localArchive.clear();

    // Reset identity — generates a new anonymousId, clears distinctId
    await this.identity.reset();

    // Clear in-memory state
    this.groupId = null;
    this.superProperties.clear();

    // Optionally reset consent (kept separate because the audit trail has
    // regulatory significance — callers must explicitly opt into erasing it)
    if (options.resetConsent) {
      await this.consent.resetToUnknown(this.config.consentPolicyVersion);
      // Stop auto-flush — no events should be sent while consent is unknown
      this.stopFlushTimer();
    }

    // Notify adapters so they can clear any remote session state
    for (const adapter of this.adapters) {
      await adapter.reset?.();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private canCapture(): boolean {
    if (this.config.disabled) return false;
    if (this.isShutdown) return false;
    if (!this.consent.isOptedIn()) return false;
    return true;
  }

  private enqueueEvent(
    type: EventType,
    eventName: string,
    properties?: Record<string, unknown>,
    options?: CaptureOptions
  ): void {
    if (!this.canCapture()) return;

    const identityState = this.identity.getState();

    // Session management — get or create session, detect new sessions.
    // Compare IDs (not just null-check) so that idle-expired sessions are
    // also detected: `before` may be a non-null ID that just expired.
    let sessionId: string | undefined;
    let isNewSession = false;
    if (this.sessionManager) {
      const before = this.sessionManager.sessionId;
      const session = this.sessionManager.getOrCreate();
      sessionId = session.sessionId;
      isNewSession = before !== session.sessionId;
    }

    // Merge super properties: registered props are the base; per-call props override.
    // This happens before the middleware pipeline so PiiSanitizer can catch anything.
    const mergedProperties: Record<string, unknown> = {
      ...Object.fromEntries(this.superProperties),
      ...(properties ?? {}),
    };

    const event: SunglassesEvent = {
      type,
      event: eventName,
      distinctId: this.identity.getEffectiveDistinctId(),
      anonymousId: identityState.anonymousId,
      timestamp: options?.timestamp ?? nowISO(),
      messageId: options?.messageId ?? generateUUID(),
      properties: mergedProperties,
      context: this.buildContext(sessionId),
    };

    // Increment event counter (fire-and-forget — never blocks capture)
    if (this._eventCounter && type === 'capture') {
      this._eventCounter.increment(eventName).catch(() => {});
    }

    // Emit a $session_start synthetic event when a new session begins
    // (before the actual event, so ordering is correct in the queue)
    if (isNewSession) {
      this.emitSessionStart(sessionId!);
    }

    // Run through middleware pipeline asynchronously
    this.pipeline
      .run(event)
      .then((processed) => {
        if (processed !== null) {
          this.queue.enqueue(processed);
          // Write to permanent local archive (if enabled)
          this.localArchive?.append([processed]).catch(() => {});
          // Touch the session to update lastActiveAt + reset idle timer
          this.sessionManager?.touch();
          // Trigger immediate flush if batch threshold reached
          if (this.queue.size >= this.config.maxBatchSize) {
            this.flushOnce().catch(() => {});
          }
        }
      })
      .catch(() => {
        // Pipeline errors are already logged inside MiddlewarePipeline
      });
  }

  private emitSessionStart(sessionId: string): void {
    const identityState = this.identity.getState();
    const event: SunglassesEvent = {
      type: 'capture',
      event: '$session_start',
      distinctId: this.identity.getEffectiveDistinctId(),
      anonymousId: identityState.anonymousId,
      timestamp: nowISO(),
      messageId: generateUUID(),
      properties: { $session_id: sessionId },
      context: this.buildContext(sessionId),
    };
    this.pipeline
      .run(event)
      .then((processed) => {
        if (processed !== null) {
          this.queue.enqueue(processed);
        }
      })
      .catch(() => {});
  }

  private buildContext(sessionId?: string): EventContext {
    const ctx: EventContext = {
      library: { name: LIBRARY_NAME, version: LIBRARY_VERSION },
      platform: this.config.platform,
    };

    if (this.config.appName || this.config.appVersion) {
      ctx.app = {
        name: this.config.appName || undefined,
        version: this.config.appVersion || undefined,
        build: this.config.appBuild || undefined,
      };
    }

    if (sessionId !== undefined) {
      ctx.sessionId = sessionId;
    }

    // Attach persisted traits (forwarded to backends for user segmentation)
    const traits = this.traitManager.getTraits();
    if (Object.keys(traits).length > 0) {
      ctx.traits = traits;
    }

    if (this.groupId !== null) {
      ctx.group = { id: this.groupId };
    }

    // Auto-enrich device / screen / locale from browser environment (web only).
    // Uses globalThis indirection to stay within lib: ["ES2020"] without DOM types.
    if (this.config.platform === 'web') {
      if ('navigator' in globalThis) {
        type NavHints = { userAgent?: string; language?: string };
        const nav = (globalThis as Record<string, unknown>)['navigator'] as NavHints;
        const ua = nav.userAgent ?? '';

        let os = 'Unknown';
        if (/iPhone|iPad|iPod/.test(ua))      os = 'iOS';
        else if (/Android/.test(ua))          os = 'Android';
        else if (/Windows/.test(ua))          os = 'Windows';
        else if (/Mac OS X/.test(ua))         os = 'macOS';
        else if (/Linux/.test(ua))            os = 'Linux';

        let deviceType = 'desktop';
        if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && !/Tablet|tablet/.test(ua) && !/iPad/.test(ua))) {
          deviceType = 'mobile';
        } else if (/iPad/.test(ua) || /Tablet|tablet/.test(ua)) {
          deviceType = 'tablet';
        }

        ctx.device = { type: deviceType, os };
        if (nav.language) ctx.locale = nav.language;
      }

      if ('screen' in globalThis) {
        type ScreenHints = { width?: number; height?: number };
        const scr = (globalThis as Record<string, unknown>)['screen'] as ScreenHints;
        if (scr.width && scr.height) {
          ctx.screen = { width: scr.width, height: scr.height };
        }
      }
    }

    return ctx;
  }

  /**
   * Flush up to maxBatchSize events to every adapter.
   *
   * Guards:
   * - If a flush is already in flight, returns immediately (no double-send).
   * - If ALL adapters succeed, events are removed from the queue.
   * - If ANY adapter fails, events stay in the queue for the next flush attempt.
   *   The failed adapter's own retry logic handles re-delivery.
   */
  private async flushOnce(): Promise<void> {
    if (this.flushInFlight) return;
    if (this.queue.size === 0) return;

    const batch = this.queue.peek(this.config.maxBatchSize);
    if (batch.length === 0) return;

    // Pass a frozen shallow copy to each adapter so they cannot mutate the queue slice
    const safeBatch = Object.freeze([...batch]);

    this.flushInFlight = true;
    try {
      let allSucceeded = true;
      for (const adapter of this.adapters) {
        try {
          await adapter.send(safeBatch);
        } catch {
          // This adapter failed. Others may still succeed.
          // Leave events in the queue — the adapter's retry logic handles re-delivery.
          allSucceeded = false;
        }
      }

      if (allSucceeded) {
        // All adapters delivered successfully — remove from queue and persist
        this.queue.remove(batch.length);
        await this.queue.persist();

        // Post-flush cleanup (optional, fire-and-forget per adapter)
        if (this.cleanupConfig) {
          for (const adapter of this.adapters) {
            adapter.cleanupAfterFlush?.(safeBatch, this.cleanupConfig)?.catch(() => {});
          }
        }
      }
    } finally {
      this.flushInFlight = false;
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer !== null) return;
    if (this.config.disabled) return;

    this.flushTimer = setInterval(() => {
      this.flushOnce().catch(() => {});
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
