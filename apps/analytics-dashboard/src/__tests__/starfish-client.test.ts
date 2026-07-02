/**
 * Unit tests for starfish-client.ts's resilient-fetch wiring: the
 * authenticated pull path (`client.pullBlob()`) previously used the package's
 * default `globalThis.fetch` with zero retry/backoff. `createStarfishClient()`
 * now passes a `createResilientFetch()`-wrapped fetch, and caches one
 * `StarfishClient` (and therefore one shared `CircuitBreaker`) per config
 * object so retry/breaker state accumulates across concurrent pullBatch()
 * calls instead of resetting per call.
 *
 * `@drakkar.software/starfish-client` and its `/fetch` subpath are mocked —
 * this tests the wiring in starfish-client.ts, not the SDK's own retry logic
 * (which is the SDK's own test suite's job).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StarfishConfig } from '../engine/config.js';

const mockPullBlob = vi.fn();
const StarfishClientCtor = vi.fn().mockImplementation((options: unknown) => ({
  __options: options,
  pullBlob: mockPullBlob,
}));

const mockResilientFetch = vi.fn();
const createResilientFetch = vi.fn(() => ({
  fetch:   mockResilientFetch,
  breaker: { getState: () => 'closed', isOpen: () => false, recordSuccess: vi.fn(), recordFailure: vi.fn() },
}));

vi.mock('@drakkar.software/starfish-client', () => ({
  StarfishClient: StarfishClientCtor,
}));

vi.mock('@drakkar.software/starfish-client/fetch', () => ({
  createResilientFetch: (...args: unknown[]) => createResilientFetch(...args),
}));

const AUTH_CONFIG: StarfishConfig = {
  baseUrl:      'https://example.test',
  apps:         ['myapp'],
  publicRead:   false,
  cap:          { sub: 'test' } as never,
  devEdPrivHex: 'a'.repeat(64),
};

function fakeBlobResult() {
  return { data: new TextEncoder().encode('parquet-bytes').buffer, hash: 'etag-1' };
}

describe('starfish-client resilient-fetch wiring', () => {
  beforeEach(() => {
    StarfishClientCtor.mockClear();
    mockPullBlob.mockReset().mockImplementation(async () => fakeBlobResult());
    mockResilientFetch.mockReset();
    createResilientFetch.mockClear();
  });

  // The module under test caches one StarfishClient per config object in a
  // module-level WeakMap. Reset the module registry between tests so that
  // cache doesn't leak across tests sharing AUTH_CONFIG's object identity —
  // each test should observe a fresh client-creation count.
  afterEach(() => {
    vi.resetModules();
  });

  it('constructs the StarfishClient with a resilient fetch (not the SDK default)', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');

    expect(StarfishClientCtor).toHaveBeenCalledTimes(1);
    const options = StarfishClientCtor.mock.calls[0]![0] as { fetch?: unknown };
    expect(options.fetch).toBe(mockResilientFetch);
  });

  it('calls createResilientFetch with retry and circuit-breaker options (not defaults left implicit)', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');

    expect(createResilientFetch).toHaveBeenCalledTimes(1);
    const [retryOptions, breakerOptions] = createResilientFetch.mock.calls[0]!;
    expect(retryOptions).toMatchObject({ maxRetries: 3, initialDelayMs: 500, maxDelayMs: 10_000 });
    expect(breakerOptions).toMatchObject({ threshold: 5, cooldownMs: 30_000 });
  });

  it('reuses one StarfishClient instance across multiple pullBatch calls for the same config object', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');

    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-2');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-3');

    expect(StarfishClientCtor).toHaveBeenCalledTimes(1);
    expect(mockPullBlob).toHaveBeenCalledTimes(3);
  });

  it('reuses the same client across concurrent (in-flight, not yet awaited) pullBatch calls', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');

    await Promise.all([
      pullBatch(AUTH_CONFIG, 'myapp', 'batch-a'),
      pullBatch(AUTH_CONFIG, 'myapp', 'batch-b'),
      pullBatch(AUTH_CONFIG, 'myapp', 'batch-c'),
      pullBatch(AUTH_CONFIG, 'myapp', 'batch-d'),
    ]);

    // Even though all four calls raced to create a client, only one was built —
    // the synchronous WeakMap check/set in createStarfishClient means the first
    // call to run past the `_clients.get` check wins, and it happens
    // synchronously before any `await`.
    expect(StarfishClientCtor).toHaveBeenCalledTimes(1);
  });

  it('creates a distinct StarfishClient (and breaker) for a different config object', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    const otherConfig: StarfishConfig = { ...AUTH_CONFIG };

    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');
    await pullBatch(otherConfig, 'myapp', 'batch-1');

    expect(StarfishClientCtor).toHaveBeenCalledTimes(2);
  });

  it('passes capProvider through unchanged alongside the new fetch option', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');

    const options = StarfishClientCtor.mock.calls[0]![0] as { baseUrl: string; capProvider?: { getCap: () => unknown } };
    expect(options.baseUrl).toBe(AUTH_CONFIG.baseUrl);
    expect(options.capProvider).toBeDefined();
    await expect(options.capProvider!.getCap()).resolves.toEqual({
      cap:          AUTH_CONFIG.cap,
      devEdPrivHex: AUTH_CONFIG.devEdPrivHex,
    });
  });

  it('returns pullBlob data/hash mapped to the pullBatch { data, etag } shape', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    const result = await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1');

    expect(new TextDecoder().decode(result.data)).toBe('parquet-bytes');
    expect(result.etag).toBe('etag-1');
  });

  it('strips a trailing .parquet suffix from the batch id before building the pull path', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    await pullBatch(AUTH_CONFIG, 'myapp', 'batch-1.parquet');

    expect(mockPullBlob).toHaveBeenCalledWith('/pull/events/myapp/batch-1');
  });

  it('URL-encodes app and batch id segments in the pull path', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    await pullBatch(AUTH_CONFIG, 'my app/weird', 'batch id?');

    expect(mockPullBlob).toHaveBeenCalledWith('/pull/events/my%20app%2Fweird/batch%20id%3F');
  });

  it('propagates a pullBlob rejection to the caller (breaker/retry exhaustion surfaces as a real error)', async () => {
    const { pullBatch } = await import('../engine/starfish-client.js');
    mockPullBlob.mockRejectedValueOnce(new Error('circuit open'));

    await expect(pullBatch(AUTH_CONFIG, 'myapp', 'batch-1')).rejects.toThrow('circuit open');
  });
});
