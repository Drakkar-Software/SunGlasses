import type { IAnalyticsAdapter, StarfishAdapterConfig, SunglassesEvent } from '@sunglasses/core';
import {
  createEmptyDocument,
  mergeEvents,
  resolveStoragePath,
  type StarfishEventDocument,
} from './StarfishEventMapper.js';

const DEFAULT_MAX_RETRIES = 3;

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
 * 4. On 409 Conflict (optimistic locking): pull again, re-merge, retry
 *
 * The storage path template supports `{identity}` as a placeholder, replaced
 * with `distinctId ?? anonymousId` from the first event in the batch.
 *
 * @see https://github.com/Drakkar-Software/Starfish
 */
export class StarfishAnalyticsAdapter implements IAnalyticsAdapter {
  private readonly config: Required<StarfishAdapterConfig>;

  constructor(config: StarfishAdapterConfig) {
    this.config = {
      serverUrl: config.serverUrl.replace(/\/$/, ''),
      storagePath: config.storagePath,
      authToken: config.authToken ?? '',
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    };
  }

  async send(batch: SunglassesEvent[]): Promise<void> {
    if (batch.length === 0) return;

    // Resolve identity from the first event in the batch
    const identity = batch[0].distinctId || batch[0].anonymousId;
    const path = resolveStoragePath(this.config.storagePath, identity);

    await this.syncWithRetry(path, batch, 0);
  }

  async reset(): Promise<void> {
    // No remote session to clear in Starfish (document persists independently)
  }

  async shutdown(): Promise<void> {
    // No pending work to flush (events are synced synchronously in send())
  }

  private async syncWithRetry(
    path: string,
    batch: SunglassesEvent[],
    attempt: number
  ): Promise<void> {
    if (attempt >= this.config.maxRetries) {
      console.warn(
        `[SunGlasses] StarfishAnalyticsAdapter: max retries (${this.config.maxRetries}) exceeded for path "${path}" — batch discarded`
      );
      return;
    }

    try {
      // Step 1: Pull current document
      const pulled = await this.pull(path);
      const currentDoc = pulled?.data ?? createEmptyDocument();
      const baseHash = pulled?.hash ?? '';

      // Step 2: Merge new events
      const updatedDoc = mergeEvents(currentDoc, batch);

      // Step 3: Push updated document
      const pushResponse = await this.push(path, updatedDoc, baseHash);

      if (pushResponse.status === 409) {
        // Optimistic lock conflict — another client wrote concurrently
        // Retry: pull again, re-merge, re-push
        await this.syncWithRetry(path, batch, attempt + 1);
        return;
      }

      if (!pushResponse.ok) {
        console.warn(
          `[SunGlasses] StarfishAnalyticsAdapter: push failed with status ${pushResponse.status} — batch discarded`
        );
      }
    } catch (err) {
      console.warn(
        `[SunGlasses] StarfishAnalyticsAdapter: network error on attempt ${attempt + 1}`,
        err
      );
      if (attempt + 1 < this.config.maxRetries) {
        await this.syncWithRetry(path, batch, attempt + 1);
      }
    }
  }

  private async pull(path: string): Promise<PullResponse | null> {
    const response = await fetch(`${this.config.serverUrl}/pull/${path}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (response.status === 404) {
      // Document doesn't exist yet — start fresh
      return null;
    }

    if (!response.ok) {
      throw new Error(`Starfish pull failed: ${response.status}`);
    }

    return response.json() as Promise<PullResponse>;
  }

  private async push(
    path: string,
    doc: StarfishEventDocument,
    baseHash: string
  ): Promise<Response> {
    return fetch(`${this.config.serverUrl}/push/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.buildHeaders(),
      },
      body: JSON.stringify({
        data: doc,
        baseHash: baseHash || undefined,
      }),
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }
}
