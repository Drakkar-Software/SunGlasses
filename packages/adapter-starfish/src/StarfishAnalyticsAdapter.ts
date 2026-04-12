import type {
  CleanupConfig,
  IAnalyticsAdapter,
  IStorageAdapter,
  StarfishAdapterConfig,
  SunglassesEvent,
} from '@drakkar.software/sunglasses-core';
import {
  createEmptyDocument,
  mergeEvents,
  pruneDocument,
  resolveStoragePath,
  type StarfishEventDocument,
} from './StarfishEventMapper.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** Storage key prefix for per-identity path generation counters. */
const GEN_KEY_PREFIX = 'sg:starfish:gen:';

interface PullResponse {
  data: StarfishEventDocument;
  hash: string;
}

/**
 * IAnalyticsAdapter that syncs events to a Starfish document-sync server.
 *
 * ## Standard mode (default)
 * Protocol: pull → merge → push with optimistic locking.
 * 1. GET  /pull/{path}  → { data: StarfishEventDocument, hash: string }
 * 2. Merge incoming events into the document (dedup by messageId)
 * 3. POST /push/{path}  → { data: updatedDoc, baseHash: hash }
 * 4. On 409 Conflict (optimistic locking): pull again, re-merge, re-push
 *    (iterative, not recursive, to prevent stack overflow under high contention)
 *
 * ## Push-only mode (`pushOnly: true`)
 * Skips the pull step entirely — events are pushed as a fresh document each time.
 * Use for Starfish collections with `queueOnly: true` where pull always returns
 * empty data and optimistic locking is not needed.
 * On failure the adapter throws, keeping events in the local queue for retry.
 *
 * ## Rotating path mode (`rotatePathOnSuccess: true`)
 * Each successful push creates a **new** Starfish document with an
 * auto-incrementing path suffix (e.g. `events-0001`, `events-0002`…).
 * - No pull step needed — the new document only contains this batch's events
 * - No growing single document — each file stays small
 * - Requires `pathStorage` in config to persist the generation counter
 * - Combine with `enableLocalArchive: true` to keep a local copy of all events
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
  private readonly pushOnly: boolean;
  private readonly rotatePathOnSuccess: boolean;
  private readonly pathStorage: IStorageAdapter | null;

  constructor(config: StarfishAdapterConfig & { timeoutMs?: number }) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.storagePath = config.storagePath;
    this.authToken = config.authToken ?? '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.pushOnly = config.pushOnly ?? false;
    this.rotatePathOnSuccess = config.rotatePathOnSuccess ?? false;
    this.pathStorage = config.pathStorage ?? null;

    if (this.rotatePathOnSuccess && !this.pathStorage) {
      console.warn(
        '[SunGlasses] StarfishAnalyticsAdapter: rotatePathOnSuccess requires pathStorage — falling back to standard mode'
      );
    }
  }

  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    if (batch.length === 0) return;

    const identity = batch[0].distinctId || batch[0].anonymousId;

    // Warn if the batch contains events from different identities — this is unexpected
    // (SunglassesCore always flushes a single-identity queue) but could happen if
    // the adapter is used directly or identity changed mid-batch.
    if (batch.some((e) => (e.distinctId || e.anonymousId) !== identity)) {
      console.warn(
        '[SunGlasses] StarfishAnalyticsAdapter: batch contains events from multiple identities' +
        ' — all events will be written to the document for the first identity. This is unexpected.'
      );
    }

    const baseResolved = resolveStoragePath(this.storagePath, identity);

    if (this.pushOnly) {
      return this.sendPushOnly(batch, baseResolved);
    }

    if (this.rotatePathOnSuccess && this.pathStorage) {
      return this.sendRotating(batch, identity, baseResolved);
    }

    return this.sendMerge(batch, baseResolved);
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
   * Only applicable in standard (non-rotating) mode.
   */
  async cleanupAfterFlush(
    delivered: ReadonlyArray<SunglassesEvent>,
    config: CleanupConfig
  ): Promise<void> {
    if (delivered.length === 0) return;
    if (this.rotatePathOnSuccess) return; // Rotating mode: old docs stay as-is

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

  // ── Private: standard pull-merge-push ──────────────────────────────────────

  private async sendMerge(batch: ReadonlyArray<SunglassesEvent>, path: string): Promise<void> {
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

  // ── Private: push-only mode (queueOnly collections) ──────────────────────

  /**
   * Push a fresh document directly, no pull, no merge, no conflict detection.
   * Throws on failure so SunglassesCore keeps events in queue for retry.
   */
  private async sendPushOnly(batch: ReadonlyArray<SunglassesEvent>, path: string): Promise<void> {
    const doc = mergeEvents(createEmptyDocument(), batch);
    const response = await this.push(path, doc, '');

    if (!response.ok) {
      throw new Error(
        `[SunGlasses] StarfishAnalyticsAdapter: push-only push failed with status ${response.status} for path "${path}"`
      );
    }
  }

  // ── Private: rotating path mode ────────────────────────────────────────────

  /**
   * Push events to a new Starfish document each time.
   *
   * Path format: `{baseResolved}-{generation padded to 4 digits}`
   * e.g. `analytics/user-1/events-0001`, `analytics/user-1/events-0002`
   *
   * The generation is persisted to `pathStorage` so it survives app restarts.
   * On success: advance generation. On failure: keep current generation (retry next flush).
   */
  private async sendRotating(
    batch: ReadonlyArray<SunglassesEvent>,
    identity: string,
    baseResolved: string
  ): Promise<void> {
    const gen = await this.loadGeneration(identity);
    const path = `${baseResolved}-${String(gen).padStart(4, '0')}`;

    // Fresh document for this batch only — no pull needed
    const doc = mergeEvents(createEmptyDocument(), batch);

    try {
      const response = await this.push(path, doc, '');

      if (response.ok) {
        await this.saveGeneration(identity, gen + 1);
      } else if (response.status === 409) {
        // 409 means a document already exists at this path — advance generation
        // to skip the collision, then throw so SunglassesCore keeps the batch
        // in the queue and retries on next flush with the new (non-colliding) path.
        await this.saveGeneration(identity, gen + 1);
        throw new Error(
          `[SunGlasses] StarfishAnalyticsAdapter: 409 conflict at rotating path "${path}" — generation advanced, will retry`
        );
      } else {
        // Non-retriable failure — discard batch but keep generation for next flush
        console.warn(
          `[SunGlasses] StarfishAnalyticsAdapter: rotating push failed with status ${response.status} for path "${path}"`
        );
      }
    } catch (err) {
      console.warn(
        `[SunGlasses] StarfishAnalyticsAdapter: rotating push network error for path "${path}"`,
        err
      );
      // Keep generation as-is — SunglassesCore will retry via flush
    }
  }

  private async loadGeneration(identity: string): Promise<number> {
    if (!this.pathStorage) return 0;
    try {
      const raw = await this.pathStorage.read(`${GEN_KEY_PREFIX}${identity}`);
      return raw !== null ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  }

  private async saveGeneration(identity: string, gen: number): Promise<void> {
    if (!this.pathStorage) return;
    try {
      await this.pathStorage.write(`${GEN_KEY_PREFIX}${identity}`, String(gen));
    } catch (err) {
      console.warn('[SunGlasses] StarfishAnalyticsAdapter: failed to save generation counter', err);
    }
  }

  // ── Private: HTTP helpers ──────────────────────────────────────────────────

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
