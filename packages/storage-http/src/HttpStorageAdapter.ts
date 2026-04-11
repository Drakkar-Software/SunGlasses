import type { IAnalyticsAdapter, HttpAdapterConfig, SunglassesEvent } from '@drakkar.software/sunglasses-core';
import { scheduleRetry } from './RetryQueue.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * IAnalyticsAdapter that POSTs batches of events to an HTTP endpoint.
 *
 * Payload shape (POST body):
 * ```json
 * { "batch": SunglassesEvent[], "sentAt": "<ISO-8601>" }
 * ```
 *
 * Retry policy:
 * - 2xx: success
 * - 4xx (except 429): non-retriable — batch discarded with warning
 * - 5xx, 429, network errors, timeout: retry with exponential backoff
 *
 * Note: batching (how many events per call) is controlled by SunglassesCore
 * via `maxBatchSize`. This adapter simply delivers whatever batch it receives.
 */
export class HttpStorageAdapter implements IAnalyticsAdapter {
  private readonly config: Required<
    Pick<
      HttpAdapterConfig,
      'endpoint' | 'headers' | 'maxRetries' | 'retryBaseDelayMs' | 'retryMaxDelayMs' | 'timeout'
    >
  >;

  constructor(config: HttpAdapterConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryBaseDelayMs: config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      retryMaxDelayMs: config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    };
  }

  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    if (batch.length === 0) return;
    await this.postBatch(batch, 0);
  }

  async reset(): Promise<void> {
    // No local state to clear
  }

  async shutdown(): Promise<void> {
    // All delivery is synchronous in send(); nothing pending
  }

  private async postBatch(batch: ReadonlyArray<SunglassesEvent>, attempt: number): Promise<void> {
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

      if (response.ok) return;

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

  private scheduleRetry(batch: ReadonlyArray<SunglassesEvent>, attempt: number): void {
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
}
