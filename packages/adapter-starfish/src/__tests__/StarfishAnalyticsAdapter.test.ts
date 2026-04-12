import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StarfishAnalyticsAdapter } from '../StarfishAnalyticsAdapter.js';
import type { SunglassesEvent } from '@drakkar.software/sunglasses-core';

function makeEvent(id = 'msg-1'): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test',
    distinctId: null,
    anonymousId: 'anon-abc',
    timestamp: '2026-01-01T00:00:00.000Z',
    messageId: id,
    properties: {},
    context: {
      library: { name: '@drakkar.software/sunglasses-core', version: '0.5.0' },
      platform: 'web',
    },
  };
}

describe('StarfishAnalyticsAdapter — pushOnly mode', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a single POST /push without a prior GET /pull', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      authToken: 'token',
      pushOnly: true,
    });

    await adapter.send([makeEvent()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sync.example.com/push/analytics/anon-abc/events');
    expect(init.method).toBe('POST');
  });

  it('push body contains only the current batch (fresh document, no merge)', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    await adapter.send([makeEvent('e1'), makeEvent('e2')]);

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit & { body: string }])[1].body as string);
    expect(body.data.events).toHaveLength(2);
    expect(body.data.events.map((e: SunglassesEvent) => e.messageId)).toEqual(['e1', 'e2']);
  });

  it('throws on push failure so SunglassesCore keeps events in queue', async () => {
    fetchSpy.mockResolvedValue(new Response('error', { status: 503 }));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    await expect(adapter.send([makeEvent()])).rejects.toThrow('503');
  });

  it('throws on network error so SunglassesCore keeps events in queue', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network request failed'));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    await expect(adapter.send([makeEvent()])).rejects.toThrow('Network request failed');
  });

  it('resolves immediately for an empty batch', async () => {
    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    await expect(adapter.send([])).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves {identity} from anonymousId', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    const event: SunglassesEvent = { ...makeEvent(), distinctId: null, anonymousId: 'anon-xyz' };
    await adapter.send([event]);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/analytics/anon-xyz/events');
  });

  it('resolves {identity} from distinctId when available', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    const adapter = new StarfishAnalyticsAdapter({
      serverUrl: 'https://sync.example.com',
      storagePath: 'analytics/{identity}/events',
      pushOnly: true,
    });

    const event: SunglassesEvent = { ...makeEvent(), distinctId: 'user-123', anonymousId: 'anon-xyz' };
    await adapter.send([event]);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('/analytics/user-123/events');
  });
});
