/**
 * Starfish HTTP client — browser-safe port of server/starfish-client.ts.
 *
 * The only change from the server version: `Buffer.from(...).toString('base64')`
 * → `btoa(...)` in encodeCapAuth (Buffer is not available in browsers).
 *
 * Ed25519 signing uses @noble/curves (pure JS) via @drakkar.software/starfish-protocol,
 * and crypto.getRandomValues via Web Crypto — both browser-native.
 */
import { StarfishClient } from '@drakkar.software/starfish-client';
import type { StarfishCapProvider } from '@drakkar.software/starfish-client';
import {
  HEADER_ACCEPT,
  HEADER_AUTHORIZATION,
  HEADER_NONCE,
  HEADER_SIG,
  HEADER_TS,
  signRequest,
  stableStringify,
  type CapCert,
} from '@drakkar.software/starfish-protocol';
import type { StarfishConfig } from './config.js';

export interface ListBatchesResult {
  items:   string[];
  hasMore: boolean;
}

/** Encode a CapCert for the Authorization header — browser-safe (btoa instead of Buffer). */
function encodeCapAuth(cap: CapCert): string {
  return btoa(stableStringify(cap as unknown as Record<string, unknown>));
}

function makeCapProvider(cap: CapCert, devEdPrivHex: string): StarfishCapProvider {
  return { getCap: async () => ({ cap, devEdPrivHex }) };
}

function createStarfishClient(config: StarfishConfig): StarfishClient {
  if (config.publicRead) {
    return new StarfishClient({ baseUrl: config.baseUrl });
  }
  return new StarfishClient({
    baseUrl:     config.baseUrl,
    capProvider: makeCapProvider(config.cap!, config.devEdPrivHex!),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function starfishGet(
  config:       StarfishConfig,
  pathAndQuery: string,
  accept:       string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    if (config.publicRead) {
      res = await fetch(`${config.baseUrl}${pathAndQuery}`, {
        method:  'GET',
        headers: { [HEADER_ACCEPT]: accept },
      });
    } else {
      const url = new URL(config.baseUrl);
      const { sig, ts, nonce } = await signRequest(
        { method: 'GET', pathAndQuery, host: url.host },
        config.devEdPrivHex!,
      );
      res = await fetch(`${config.baseUrl}${pathAndQuery}`, {
        method:  'GET',
        headers: {
          [HEADER_ACCEPT]:         accept,
          [HEADER_AUTHORIZATION]:  `Cap ${encodeCapAuth(config.cap!)}`,
          [HEADER_SIG]:            sig,
          [HEADER_TS]:             String(ts),
          [HEADER_NONCE]:          nonce,
        },
      });
    }

    if (res.status !== 429 || attempt >= 2) return res;
    const retryAfter = Number(res.headers.get('Retry-After') ?? 2);
    await sleep((Number.isFinite(retryAfter) ? retryAfter : 2) * 1000);
  }
}

/** Paginated list of batch IDs under `events/{app}/`. */
export async function listBatches(
  config: StarfishConfig,
  app:    string,
  opts?:  { after?: string; limit?: number },
): Promise<ListBatchesResult> {
  const limit = opts?.limit ?? 100;
  let path = `/list/events/${encodeURIComponent(app)}?limit=${limit}`;
  if (opts?.after) path += `&after=${encodeURIComponent(opts.after)}`;

  const res = await starfishGet(config, path, 'application/json');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Starfish list failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ListBatchesResult;
}

/** Pull one Parquet batch file. Returns raw ArrayBuffer + optional ETag. */
export async function pullBatch(
  config:  StarfishConfig,
  app:     string,
  batchId: string,
): Promise<{ data: ArrayBuffer; etag: string | null }> {
  const id   = batchId.endsWith('.parquet') ? batchId.slice(0, -'.parquet'.length) : batchId;
  const path = `/pull/events/${encodeURIComponent(app)}/${encodeURIComponent(id)}`;

  // Public-read: use starfishGet directly so 429 retry applies.
  if (config.publicRead) {
    const res = await starfishGet(config, path, '*/*');
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Starfish pull failed (${res.status}): ${text}`);
    }
    return { data: await res.arrayBuffer(), etag: res.headers.get('ETag') };
  }

  const client = createStarfishClient(config);
  const result = await client.pullBlob(path);
  return { data: result.data, etag: result.hash };
}

/** Verify list/pull access for one app slug (pulls one file when data exists). */
export async function testStarfishConnection(config: StarfishConfig, app: string): Promise<void> {
  const page = await listBatches(config, app, { limit: 1 });
  if (page.items.length > 0) {
    await pullBatch(config, app, page.items[0]!);
  }
}
