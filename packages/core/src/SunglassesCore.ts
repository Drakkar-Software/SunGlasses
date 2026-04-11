import { ConsentManager } from './ConsentManager.js';
import { EventQueue } from './EventQueue.js';
import { IdentityManager } from './IdentityManager.js';
import { MiddlewarePipeline } from './MiddlewarePipeline.js';
import { PiiSanitizer } from './PiiSanitizer.js';
import type {
  ConsentStatus,
  EventContext,
  EventType,
  IAnalyticsAdapter,
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
} from './types.js';
import { createLogger } from './utils/logger.js';
import { nowISO } from './utils/timestamp.js';
import { generateUUID } from './utils/uuid.js';

const LIBRARY_NAME = '@sunglasses/core';
const LIBRARY_VERSION = '0.1.0';

const DEFAULT_FLUSH_INTERVAL = 30_000;
const DEFAULT_MAX_QUEUE_SIZE = 500;
const DEFAULT_MAX_BATCH_SIZE = 50;

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
  >;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isShutdown = false;

  private constructor(
    config: SunglassesConfig,
    consent: ConsentManager,
    identity: IdentityManager,
    queue: EventQueue,
    pipeline: MiddlewarePipeline
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
    };
    this.consent = consent;
    this.identity = identity;
    this.queue = queue;
    this.pipeline = pipeline;
    this.adapters = config.adapters;
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

    const instance = new SunglassesCore(config, consent, identity, queue, pipeline);

    // Initialize subsystems
    await consent.initialize(config.defaultOptIn ?? false);
    await identity.initialize();
    await queue.initialize();

    // Start auto-flush timer
    if (!(config.disabled ?? false)) {
      instance.startFlushTimer();
    }

    logger.debug('SunglassesCore: initialized', {
      platform: config.platform ?? 'web',
      defaultOptIn: config.defaultOptIn ?? false,
      consentStatus: consent.status,
    });

    return instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  capture(eventName: string, properties?: Record<string, unknown>): void {
    this.enqueueEvent('capture', eventName, properties);
  }

  screen(screenName: string, properties?: Record<string, unknown>): void {
    this.enqueueEvent('screen', '$screen', {
      ...properties,
      $screen_name: screenName,
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.canCapture()) return;

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
        // Identity failed — still enqueue with anonymousId
        this.enqueueEvent('identify', '$identify', { ...traits });
      });
  }

  alias(newId: string, existingId: string): void {
    this.enqueueEvent('alias', '$alias', {
      alias: newId,
      previous_id: existingId,
    });
  }

  async reset(): Promise<void> {
    await this.identity.reset();
    await this.queue.clear();
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
    properties?: Record<string, unknown>
  ): void {
    if (!this.canCapture()) return;

    const identityState = this.identity.getState();
    const event: SunglassesEvent = {
      type,
      event: eventName,
      distinctId: this.identity.getEffectiveDistinctId(),
      anonymousId: identityState.anonymousId,
      timestamp: nowISO(),
      messageId: generateUUID(),
      properties: properties ?? {},
      context: this.buildContext(),
    };

    // Run through middleware pipeline asynchronously
    this.pipeline
      .run(event)
      .then((processed) => {
        if (processed !== null) {
          this.queue.enqueue(processed);
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

  private buildContext(): EventContext {
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

    return ctx;
  }

  private async flushOnce(): Promise<void> {
    if (this.queue.size === 0) return;

    const batch = this.queue.peek(this.config.maxBatchSize);
    if (batch.length === 0) return;

    for (const adapter of this.adapters) {
      try {
        await adapter.send(batch);
      } catch {
        // Individual adapter failures are handled inside the adapter (retry logic)
        // We don't remove events from the queue on failure
        return;
      }
    }

    // All adapters succeeded — remove events from queue
    this.queue.remove(batch.length);
    await this.queue.persist();
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
