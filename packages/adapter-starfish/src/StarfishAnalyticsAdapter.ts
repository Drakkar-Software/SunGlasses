import type {
  CleanupConfig,
  IAnalyticsAdapter,
  StarfishAdapterConfig,
  SunglassesEvent,
} from '@sunglasses/core';
import {
  createEmptyDocument,
  mergeEvents,
  pruneDocument,
  resolveStoragePath,
  type StarfishEventDocument,
} from './StarfishEventMapper.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface PullResponse {
  data: StarfishEventDocument;
  hash: string;
}

/**
 * IAnalyticsAdapter that syncs events to a Starfish document-sync server.
 *
 * Protocol:
 * 1. GET  /pull/{path}  → { data: StarfishEventDocument, hash: string }
 * 2. Merge incoming events into the document (dedup by messageId)
 * 3. POST /push/{path}  → { data: updatedDoc, baseHash: hash }
 * 4. On 409 Conflict (optimistic locking): pull again, re-merge, re-push
 *    (iterative, not recursive, to prevent stack overflow under high contention)
 *
 * The storage path template supports `{identity}` as a placeholder, replaced
 * with `distinctId ?? anonymousId` from the first event in the batch.
 *
 * @see https://github.com/Drakkar-Software/Starfish
 */
export class StarfishAnalyticsAdapter implements IAnalyticsAdapter {
  private readonly serverUrl: string;
  private readonly storagePath: string;
  private readonly authToken: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: StarfishAdapterConfig & { timeoutMs?: number }) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.storagePath = config.storagePath;
    this.authToken = config.authToken ?? '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async send(batch: SunglassesEvent[]): Promise<void> {
    if (batch.length === 0) return;

    // Resolve identity from the first event in the batch
    const identity = batch[0].distinctId || batch[0].anonymousId;
    const path = resolveStoragePath(this.storagePath, identity);

    // Iterative retry loop — avoids recursive stack growth under high contention
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Step 1: Pull current document
        const pulled = await this.pull(path);
        const currentDoc = pulled?.data ?? createEmptyDocument();
        const baseHash = pulled?.hash ?? '';

        // Step 2: Merge new events (dedup by messageId)
        const updatedDoc = mergeEvents(currentDoc, batch);

        // Step 3: Push updated document
        const pushResponse = await this.push(path, updatedDoc, baseHash);

        if (pushResponse.status === 409) {
          // Optimistic lock conflict — retry the loop (pull → merge → push)
          continue;
        }

        if (!pushResponse.ok) {
          console.warn(
            `[SunGlasses] StarfishAnalyticsAdapter: push failed with status ${pushResponse.status} — batch discarded`
          );
        }

        return; // Success or non-retriable failure
      } catch (err) {
        const isLastAttempt = attempt === this.maxRetries - 1;
        if (isLastAttempt) {
          console.warn(
            `[SunGlasses] StarfishAnalyticsAdapter: network error after ${this.maxRetries} attempts — batch discarded`,
            err
          );
          return;
        }
        // Network error — retry on next iteration
      }
    }

    console.warn(
      `[SunGlasses] StarfishAnalyticsAdapter: max retries (${this.maxRetries}) exceeded for path "${path}" — batch discarded`
    );
  }

  async reset(): Promise<void> {
    // No remote session to clear (document persists independently)
  }

  async shutdown(): Promise<void> {
    // No pending work (events are synced synchronously in send())
  }

  /**
   * Prune old events from the Starfish document after a successful flush.
   * Called by SunglassesCore when `cleanupAfterFlush` is configured.
   */
  async cleanupAfterFlush(
    delivered: SunglassesEvent[],
    config: CleanupConfig
  ): Promise<void> {
    if (delivered.length === 0) return;

    const identity = delivered[0].distinctId || delivered[0].anonymousId;
    const path = resolveStoragePath(this.storagePath, identity);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const pulled = await this.pull(path);
        if (!pulled) return; // Nothing to clean up

        const pruned = pruneDocument(pulled.data, config);
        const pushResponse = await this.push(path, pruned, pulled.hash);

        if (pushResponse.status === 409) {
          continue; // Retry on conflict
        }
        return;
      } catch {
        if (attempt === this.maxRetries - 1) {
          console.warn(
            '[SunGlasses] StarfishAnalyticsAdapter: cleanup failed — will retry on next flush'
          );
        }
      }
    }
  }

  private async pull(path: string): Promise<PullResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.serverUrl}/pull/${path}`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      if (response.status === 404) {
        return null; // Document doesn't exist yet — start fresh
      }

      if (!response.ok) {
        throw new Error(`Starfish pull failed: ${response.status}`);
      }

      return response.json() as Promise<PullResponse>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async push(
    path: string,
    doc: StarfishEventDocument,
    baseHash: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.serverUrl}/push/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.buildHeaders(),
        },
        body: JSON.stringify({
          data: doc,
          baseHash: baseHash || undefined,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }
}
