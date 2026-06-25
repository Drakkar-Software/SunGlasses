import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { StarfishAnalyticsAdapter } from '../StarfishAnalyticsAdapter.js';
import { toStarfishRow } from '../StarfishEventMapper.js';
import type { SunglassesEvent } from '@drakkar.software/sunglasses-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<SunglassesEvent> = {}): SunglassesEvent {
  return {
    type: 'capture',
    event: 'button_clicked',
    distinctId: 'user-123',
    anonymousId: 'anon-abc',
    timestamp: '2024-06-01T10:00:00.000Z',
    messageId: 'msg-001',
    properties: { label: 'Submit' },
    context: { library: { name: 'sunglasses-core', version: '0.7.0' }, platform: 'web' },
    ...overrides,
  };
}

function makeMockClient(impl?: () => Promise<unknown>) {
  return { push: vi.fn(impl ?? (() => Promise.resolve({ hash: 'abc123' }))) };
}

// ---------------------------------------------------------------------------
// StarfishAnalyticsAdapter
// ---------------------------------------------------------------------------

describe('StarfishAnalyticsAdapter', () => {
  it('does not call push for an empty batch', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'my-app' });
    await adapter.send([]);
    expect(client.push).not.toHaveBeenCalled();
  });

  it('calls push once with the correct body shape', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'my-app' });
    const event = makeEvent();

    await adapter.send([event]);

    expect(client.push).toHaveBeenCalledOnce();
    const [path, data, baseHash] = (client.push as Mock).mock.calls[0] as [string, unknown, string | null];
    expect(baseHash).toBeNull();
    expect((data as { events: unknown[] }).events).toHaveLength(1);

    const row = (data as { events: Record<string, unknown>[] }).events[0]!;
    expect(row['event_type']).toBe('capture');
    expect(row['event']).toBe('button_clicked');
    expect(row['anonymous_id']).toBe('anon-abc');
    expect(row['ts']).toBe('2024-06-01T10:00:00.000Z');
    expect(row['dt']).toBe('2024-06-01');
    // properties and context are JSON strings
    expect(row['properties']).toBe('{"label":"Submit"}');
    expect(typeof row['context']).toBe('string');

    // Path includes the app slug
    expect(path).toMatch(/^events\/my-app\//);
  });

  it('generates a unique path for each send() call', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'my-app' });

    await adapter.send([makeEvent({ messageId: 'msg-001' })]);
    await adapter.send([makeEvent({ messageId: 'msg-002' })]);

    const paths = (client.push as Mock).mock.calls.map((c: unknown[]) => c[0] as string);
    expect(paths[0]).not.toBe(paths[1]);
    // Both should start with events/my-app/
    for (const p of paths) {
      expect(p).toMatch(/^events\/my-app\//);
    }
  });

  it('propagates push rejection so the SDK retries (at-least-once)', async () => {
    const client = makeMockClient(() => Promise.reject(new Error('network error')));
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'my-app' });

    await expect(adapter.send([makeEvent()])).rejects.toThrow('network error');
  });

  it('sends all events in the batch as a single push', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'demo' });
    const events = [
      makeEvent({ messageId: 'msg-1', event: 'view' }),
      makeEvent({ messageId: 'msg-2', event: 'click' }),
      makeEvent({ messageId: 'msg-3', event: 'submit' }),
    ];

    await adapter.send(events);

    expect(client.push).toHaveBeenCalledOnce();
    const data = (client.push as Mock).mock.calls[0]![1] as { events: Record<string, unknown>[] };
    expect(data.events).toHaveLength(3);
    expect(data.events.map((r) => r['event'])).toEqual(['view', 'click', 'submit']);
  });

  it('respects a custom pathTemplate', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({
      client,
      app: 'webapp',
      pathTemplate: 'custom/{app}/batch/{batchId}',
    });

    await adapter.send([makeEvent()]);

    const path = (client.push as Mock).mock.calls[0]![0] as string;
    expect(path).toMatch(/^custom\/webapp\/batch\//);
  });

  it('URL-encodes the app slug in the path', async () => {
    const client = makeMockClient();
    const adapter = new StarfishAnalyticsAdapter({ client, app: 'my app/v2' });

    await adapter.send([makeEvent()]);

    const path = (client.push as Mock).mock.calls[0]![0] as string;
    expect(path).toContain('my%20app%2Fv2');
    expect(path).not.toContain('my app/v2');
  });
});

// ---------------------------------------------------------------------------
// StarfishEventMapper (unit)
// ---------------------------------------------------------------------------

describe('toStarfishRow', () => {
  it('maps all fields correctly', () => {
    const event = makeEvent();
    const row = toStarfishRow(event);

    expect(row.event_type).toBe('capture');
    expect(row.event).toBe('button_clicked');
    expect(row.distinct_id).toBe('user-123');
    expect(row.anonymous_id).toBe('anon-abc');
    expect(row.ts).toBe('2024-06-01T10:00:00.000Z');
    expect(row.message_id).toBe('msg-001');
    expect(row.dt).toBe('2024-06-01');
    expect(row.properties).toBe('{"label":"Submit"}');
    expect(typeof row.context).toBe('string');
  });

  it('derives dt from the first 10 characters of timestamp', () => {
    const event = makeEvent({ timestamp: '2025-12-31T23:59:59.999Z' });
    const row = toStarfishRow(event);
    expect(row.dt).toBe('2025-12-31');
  });

  it('serialises nested properties as JSON', () => {
    const event = makeEvent({ properties: { nested: { a: 1 }, arr: [1, 2] } });
    const row = toStarfishRow(event);
    expect(JSON.parse(row.properties)).toEqual({ nested: { a: 1 }, arr: [1, 2] });
  });
});
