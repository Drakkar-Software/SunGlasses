/**
 * SunGlasses → Starfish analytics adapter.
 *
 * Implements `IAnalyticsAdapter`: on each flush, maps the event batch to flat
 * rows and pushes them as a JSON body to a Starfish events collection.
 * The `starfish-events` server plugin intercepts the push and encodes Parquet
 * on the server side — no Parquet dependency on the client.
 *
 * ## Transport
 *
 * Uses an injected `StarfishPushClient` (structural type) so this package has
 * **no runtime dependency on `@drakkar.software/starfish-client`** — avoiding
 * an ESM-only/unpublished-alpha dep conflict. Construct a real `StarfishClient`
 * externally and pass it in via `config.client`.
 *
 * ## At-least-once delivery
 *
 * `send()` throws on failure. SunglassesCore treats an adapter throw as a
 * transient error and keeps the batch in the local queue for the next flush
 * cycle — equivalent to the old `pushOnly` semantics.
 *
 * ## Privacy
 *
 * The SDK's consent gate and PiiSanitizer have already run before `send()` is
 * called. This adapter must never log `distinct_id`, `properties`, or `context`
 * (log counts only).
 */
import type { IAnalyticsAdapter, SunglassesEvent } from '@drakkar.software/sunglasses-core';
import { generateUUID } from '@drakkar.software/sunglasses-core';
import { toStarfishRow } from './StarfishEventMapper.js';

/**
 * Minimal structural interface satisfied by `StarfishClient.push`.
 * Declare it here so no import of `@drakkar.software/starfish-client` is needed.
 */
export interface StarfishPushClient {
  /**
   * Push a JSON document to a Starfish collection path.
   * Must throw (or reject) on non-2xx so SunglassesCore retries.
   *
   * @param path  Logical storage path (without the `/push/` prefix).
   * @param data  Document body — `{ events: StarfishEventRow[] }`.
   * @param baseHash  Pass `null` for "must not exist" (unique path per batch).
   */
  push(
    path: string,
    data: unknown,
    baseHash: string | null,
  ): Promise<unknown>;
}

/** Configuration for {@link StarfishAnalyticsAdapter}. */
export interface StarfishAdapterConfig {
  /**
   * A `StarfishClient` instance (or any object implementing `push`).
   * Construct it with `{ baseUrl: "https://..." }` and no `capProvider` when
   * targeting a `write: "public"` collection.
   *
   * @example
   * ```ts
   * import { StarfishClient } from "@drakkar.software/starfish-client"
   * const client = new StarfishClient({ baseUrl: "https://sync.example.com/v1" })
   * new StarfishAnalyticsAdapter({ client, app: "my-app" })
   * ```
   */
  client: StarfishPushClient;

  /**
   * Application/workspace identifier embedded in the storage path.
   * Fills the `{app}` placeholder in `pathTemplate`.
   * Keep it short and URL-safe (no `/` or spaces).
   */
  app: string;

  /**
   * Storage-path template. Defaults to `"events/{app}/{batchId}"`.
   * `{app}` → `config.app`; `{batchId}` → a UUID v4 generated per flush, used
   * only as a placeholder in the push URL. Starfish's `starfish-events`
   * server plugin (v3.0.0-alpha.62+) assigns the *authoritative* batch id
   * server-side — a lexicographically-sortable id derived from the server
   * clock — and ignores this client-supplied value. This lets `/list`'s
   * ascending key order double as a chronological cursor for incremental
   * sync, which a client-minted id (many devices, untrusted clocks) can't
   * safely provide. No adapter code changes are needed for this — it's
   * transparent to `send()`.
   *
   * The server plugin appends `.parquet` automatically, so omit it here.
   */
  pathTemplate?: string;
}

const DEFAULT_PATH_TEMPLATE = 'events/{app}/{batchId}';

/**
 * SunGlasses analytics adapter that delivers event batches to a Starfish
 * events collection, where the `starfish-events` plugin encodes them as
 * Parquet and writes to S3.
 *
 * @example
 * ```ts
 * import { SunglassesCore } from "@drakkar.software/sunglasses-core"
 * import { StarfishAnalyticsAdapter } from "@drakkar.software/sunglasses-adapter-starfish"
 * import { StarfishClient } from "@drakkar.software/starfish-client"
 *
 * const sfClient = new StarfishClient({ baseUrl: "https://sync.example.com/v1" })
 *
 * const sg = await SunglassesCore.create({
 *   storage: myStorage,
 *   adapters: [
 *     new StarfishAnalyticsAdapter({ client: sfClient, app: "my-app" }),
 *   ],
 * })
 * ```
 */
export class StarfishAnalyticsAdapter implements IAnalyticsAdapter {
  private readonly client: StarfishPushClient;
  private readonly app: string;
  private readonly pathTemplate: string;

  constructor(config: StarfishAdapterConfig) {
    this.client = config.client;
    this.app = config.app;
    this.pathTemplate = config.pathTemplate ?? DEFAULT_PATH_TEMPLATE;
  }

  private resolvePath(batchId: string): string {
    return this.pathTemplate
      .replace('{app}', encodeURIComponent(this.app))
      .replace('{batchId}', batchId);
  }

  /**
   * Push a batch of events to the Starfish events collection.
   *
   * A unique `batchId` is generated per call, producing a unique storage path
   * (one Parquet file per flush) — see {@link StarfishAdapterConfig.pathTemplate}
   * for why the server may substitute its own id here. `baseHash: null` signals
   * "must not exist" to Starfish, ensuring no conflict on the unique path.
   *
   * Throws on failure — SunglassesCore keeps the batch in the local queue.
   * Never logs event contents (distinct_id, properties, context).
   */
  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    if (batch.length === 0) return;

    const batchId = generateUUID();
    const path = this.resolvePath(batchId);
    const rows = batch.map(toStarfishRow);

    // Throws on failure → SDK requeues the batch (at-least-once delivery).
    await this.client.push(path, { events: rows }, null);
  }
}
