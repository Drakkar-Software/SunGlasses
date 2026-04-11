import type { IAnalyticsAdapter, HttpAdapterConfig, SunglassesEvent } from '@sunglasses/core';
import { scheduleRetry } from './RetryQueue.js';

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * IAnalyticsAdapter that batches events and POSTs them to an HTTP endpoint.
 *
 * Payload shape:
 * {
 *   "batch": SunglassesEvent[],
 *   "sentAt": "<ISO-8601>"
 * }
 *
 * Retry policy:
 * - 2xx: success, batch discarded
 * - 4xx (except 429): non-retriable, batch discarded with warning
 * - 5xx, 429, network errors: retry with exponential backoff
 */
export class HttpStorageAdapter implements IAnalyticsAdapter {
  private readonly config: Required<HttpAdapterConfig>;
  private pendingBatch: SunglassesEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: HttpAdapterConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      retryMaxDelayMs: config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    };
  }

  async send(batch: SunglassesEvent[]): Promise<void> {
    if (batch.length === 0) return;
    await this.postBatch(batch, 0);
  }

  async reset(): Promise<void> {
    this.pendingBatch = [];
  }

  async shutdown(): Promise<void> {
    this.stopTimer();
    if (this.pendingBatch.length > 0) {
      await this.postBatch(this.pendingBatch, 0);
      this.pendingBatch = [];
    }
  }

  private async postBatch(batch: SunglassesEvent[], attempt: number): Promise<void> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.config.timeout)
      : null;

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          batch,
          sentAt: new Date().toISOString(),
        }),
        signal: controller?.signal,
      });

      if (timeoutId !== null) clearTimeout(timeoutId);

      if (response.ok) {
        return; // Success
      }

      // 4xx (except 429) are non-retriable
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.warn(
          `[SunGlasses] HttpStorageAdapter: non-retriable error ${response.status} — batch discarded`
        );
        return;
      }

      // 5xx or 429 — schedule retry
      this.scheduleRetry(batch, attempt);
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId);
      // Network error or timeout — schedule retry
      this.scheduleRetry(batch, attempt);
    }
  }

  private scheduleRetry(batch: SunglassesEvent[], attempt: number): void {
    scheduleRetry(
      {
        attempt,
        execute: () => this.postBatch(batch, attempt + 1),
        onExhausted: () => {
          console.warn(
            `[SunGlasses] HttpStorageAdapter: max retries (${this.config.maxRetries}) exceeded — batch of ${batch.length} events discarded`
          );
        },
      },
      {
        maxRetries: this.config.maxRetries,
        baseDelayMs: this.config.retryBaseDelayMs,
        maxDelayMs: this.config.retryMaxDelayMs,
      }
    );
  }

  private startTimer(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setInterval(() => {
      if (this.pendingBatch.length > 0) {
        const toSend = this.pendingBatch.splice(0, this.config.batchSize);
        this.postBatch(toSend, 0).catch(() => {});
      }
    }, this.config.flushIntervalMs);
  }

  private stopTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
