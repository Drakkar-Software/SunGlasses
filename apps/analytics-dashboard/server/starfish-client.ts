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
import type { StarfishConfig } from './starfish-config.js';

export interface ListBatchesResult {
  items: string[];
  hasMore: boolean;
}

function encodeCapAuth(cap: CapCert): string {
  return Buffer.from(stableStringify(cap as unknown as Record<string, unknown>)).toString('base64');
}

function makeCapProvider(cap: CapCert, devEdPrivHex: string): StarfishCapProvider {
  return {
    getCap: async () => ({ cap, devEdPrivHex }),
  };
}

export function createStarfishClient(config: StarfishConfig): StarfishClient {
  return new StarfishClient({
    baseUrl: config.baseUrl,
    capProvider: makeCapProvider(config.cap, config.devEdPrivHex),
  });
}

async function signedGet(
  config: StarfishConfig,
  pathAndQuery: string,
): Promise<Response> {
  const url = new URL(config.baseUrl);
  const { sig, ts, nonce } = await signRequest(
    { method: 'GET', pathAndQuery, host: url.host },
    config.devEdPrivHex,
  );
  return fetch(`${config.baseUrl}${pathAndQuery}`, {
    method: 'GET',
    headers: {
      [HEADER_ACCEPT]: 'application/json',
      [HEADER_AUTHORIZATION]: `Cap ${encodeCapAuth(config.cap)}`,
      [HEADER_SIG]: sig,
      [HEADER_TS]: String(ts),
      [HEADER_NONCE]: nonce,
    },
  });
}

/** Paginated list of batch IDs under `events/{app}/`. */
export async function listBatches(
  config: StarfishConfig,
  opts?: { after?: string; limit?: number },
): Promise<ListBatchesResult> {
  const limit = opts?.limit ?? 100;
  let path = `/list/events/${encodeURIComponent(config.app)}?limit=${limit}`;
  if (opts?.after) {
    path += `&after=${encodeURIComponent(opts.after)}`;
  }

  const res = await signedGet(config, path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Starfish list failed (${res.status}): ${text}`);
  }
  return (await res.json()) as ListBatchesResult;
}

/** Pull one Parquet batch file. *batchId* may include a `.parquet` suffix from list. */
export async function pullBatch(
  config: StarfishConfig,
  batchId: string,
): Promise<{ data: ArrayBuffer; etag: string | null }> {
  const client = createStarfishClient(config);
  const id = batchId.endsWith('.parquet') ? batchId.slice(0, -'.parquet'.length) : batchId;
  const result = await client.pullBlob(
    `/pull/events/${encodeURIComponent(config.app)}/${encodeURIComponent(id)}`,
  );
  return { data: result.data, etag: result.hash };
}

/** Verify admin cap can list (and pull one file when data exists). */
export async function testStarfishConnection(config: StarfishConfig): Promise<void> {
  const page = await listBatches(config, { limit: 1 });
  if (page.items.length > 0) {
    await pullBatch(config, page.items[0]!);
  }
}
