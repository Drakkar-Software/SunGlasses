import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpStorageAdapter } from '../HttpStorageAdapter.js';
import type { SunglassesEvent } from '@sunglasses/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(id = 'msg-1'): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test_event',
    distinctId: 'user-1',
    anonymousId: 'anon-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    messageId: id,
    properties: { foo: 'bar' },
    context: { library: { name: '@sunglasses/core', version: '0.1.0' }, platform: 'web' },
  };
}

function okResponse(status = 200): Response {
  return new Response(null, { status });
}

function errorResponse(status: number): Response {
  return new Response(null, { status });
}

describe('HttpStorageAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('POSTs a batch to the endpoint on success', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(200));
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await adapter.send([makeEvent()]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/batch');
    expect(init.method).toBe('POST');
  });

  it('sends Content-Type: application/json', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await adapter.send([makeEvent()]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes custom headers in the request', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      headers: { 'X-API-Key': 'secret' },
    });
    await adapter.send([makeEvent()]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret');
  });

  it('POST body contains { batch, sentAt }', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    const event = makeEvent();
    await adapter.send([event]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { batch: unknown[]; sentAt: string };
    expect(body.batch).toHaveLength(1);
    expect(typeof body.sentAt).toBe('string');
    // sentAt should be a valid ISO-8601 date
    expect(() => new Date(body.sentAt)).not.toThrow();
  });

  it('no-op when batch is empty', async () => {
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await adapter.send([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Non-retriable 4xx ────────────────────────────────────────────────────

  it('discards the batch on 400 without retrying', async () => {
    mockFetch.mockResolvedValue(errorResponse(400));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await adapter.send([makeEvent()]);

    // Only one fetch call — no retry
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-retriable'));
    warnSpy.mockRestore();
  });

  it.each([401, 403, 404, 422])(
    'discards on non-retriable %i',
    async (status) => {
      mockFetch.mockResolvedValue(errorResponse(status));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
      await adapter.send([makeEvent()]);
      expect(mockFetch).toHaveBeenCalledOnce();
    }
  );

  // ── Retriable errors ─────────────────────────────────────────────────────

  it('retries on 500 with exponential backoff', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse(200));

    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      maxRetries: 3,
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 10_000,
    });

    const sendPromise = adapter.send([makeEvent()]);
    // Let the first attempt fail, then advance timers to trigger retry
    await vi.advanceTimersByTimeAsync(200);
    await sendPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 (rate limited)', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse(200));

    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      retryBaseDelayMs: 100,
    });

    const sendPromise = adapter.send([makeEvent()]);
    await vi.advanceTimersByTimeAsync(200);
    await sendPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (fetch throws)', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce(okResponse(200));

    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      retryBaseDelayMs: 100,
    });

    const sendPromise = adapter.send([makeEvent()]);
    await vi.advanceTimersByTimeAsync(200);
    await sendPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('discards after exhausting maxRetries and logs a warning', async () => {
    mockFetch.mockResolvedValue(errorResponse(503));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      maxRetries: 2,
      retryBaseDelayMs: 50,
      retryMaxDelayMs: 500,
    });

    const sendPromise = adapter.send([makeEvent()]);
    // Advance through all retry delays
    await vi.advanceTimersByTimeAsync(2_000);
    await sendPromise;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('max retries'));
    warnSpy.mockRestore();
  });

  // ── Timeout ──────────────────────────────────────────────────────────────

  it('aborts the request on timeout and retries', async () => {
    // First call: simulate a timeout (AbortController fires, fetch rejects with AbortError)
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      });
    });
    mockFetch.mockResolvedValueOnce(okResponse(200));

    const adapter = new HttpStorageAdapter({
      endpoint: 'https://example.com/batch',
      timeout: 100,
      retryBaseDelayMs: 50,
    });

    const sendPromise = adapter.send([makeEvent()]);
    // Trigger the timeout
    await vi.advanceTimersByTimeAsync(500);
    await sendPromise;

    // Should have been called twice (initial + 1 retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── Lifecycle methods ────────────────────────────────────────────────────

  it('reset() resolves without errors', async () => {
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await expect(adapter.reset()).resolves.toBeUndefined();
  });

  it('shutdown() resolves without errors', async () => {
    const adapter = new HttpStorageAdapter({ endpoint: 'https://example.com/batch' });
    await expect(adapter.shutdown()).resolves.toBeUndefined();
  });
});
