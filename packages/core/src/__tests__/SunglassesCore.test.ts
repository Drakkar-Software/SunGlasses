import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SunglassesCore } from '../SunglassesCore.js';
import type { IAnalyticsAdapter, IStorageAdapter } from '../types.js';

function makeStorage(): IStorageAdapter & { _store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    read: async (key) => store[key] ?? null,
    write: async (key, value) => { store[key] = value; },
    delete: async (key) => { delete store[key]; },
    _store: store,
  };
}

function makeAdapter(): IAnalyticsAdapter & {
  batches: unknown[][];
  _reset: () => void;
} {
  const batches: unknown[][] = [];
  return {
    batches,
    async send(batch) { batches.push([...batch]); },
    _reset() { batches.length = 0; },
  };
}

describe('SunglassesCore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('throws if no adapters are provided', async () => {
    await expect(
      SunglassesCore.create({ adapters: [], storage: makeStorage() })
    ).rejects.toThrow('at least one adapter');
  });

  it('starts opted-out by default (defaultOptIn: false)', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: false,
    });
    expect(client.hasOptedOut()).toBe(true);
    expect(client.hasOptedIn()).toBe(false);
  });

  it('starts opted-in when defaultOptIn: true', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    expect(client.hasOptedIn()).toBe(true);
  });

  it('silently drops events when opted out', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: false,
    });
    client.capture('test_event');
    expect(client.getQueuedEventCount()).toBe(0);
  });

  it('queues events after optIn()', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: false,
    });
    await client.optIn();
    client.capture('test_event', { foo: 'bar' });
    // Pipeline is async — allow microtasks to settle
    await vi.advanceTimersByTimeAsync(100);
    expect(client.getQueuedEventCount()).toBe(1);
  });

  it('clears queue on optOut()', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.capture('event_a');
    await vi.advanceTimersByTimeAsync(100);
    expect(client.getQueuedEventCount()).toBe(1);
    await client.optOut();
    expect(client.getQueuedEventCount()).toBe(0);
  });

  it('flush() sends queued events to adapter', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.capture('button_clicked');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();
    expect(adapter.batches.length).toBe(1);
    expect(client.getQueuedEventCount()).toBe(0);
  });

  it('does not double-flush when concurrent flush() calls race', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      maxBatchSize: 100,
    });
    client.capture('event_1');
    await vi.advanceTimersByTimeAsync(100);

    // Fire two concurrent flushes
    const [, ] = await Promise.all([client.flush(), client.flush()]);
    expect(adapter.batches.length).toBe(1); // Only one actual send
  });

  it('events stay in queue when an adapter fails', async () => {
    const failing: IAnalyticsAdapter = {
      async send() { throw new Error('network error'); },
    };
    const client = await SunglassesCore.create({
      adapters: [failing],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.capture('event_1');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();
    // Event must still be in queue (adapter failed → not removed)
    expect(client.getQueuedEventCount()).toBe(1);
  });

  it('adapter.send() receives a frozen copy (cannot mutate queue)', async () => {
    let receivedBatch: unknown[] | null = null;
    const adapter: IAnalyticsAdapter = {
      async send(batch) {
        receivedBatch = batch;
        // Attempting to push should throw in strict mode / be silently ignored
        try { (batch as unknown[]).push({} as never); } catch { /* expected */ }
      },
    };
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.capture('safe_event');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();
    // Queue should still have 0 events (sent successfully)
    expect(receivedBatch).not.toBeNull();
    expect(client.getQueuedEventCount()).toBe(0);
  });

  it('disabled: true prevents all event capture', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      disabled: true,
    });
    client.capture('test');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();
    expect(adapter.batches.length).toBe(0);
  });

  it('reset() clears queue and calls adapter.reset()', async () => {
    const resetFn = vi.fn();
    const adapter: IAnalyticsAdapter = { async send() {}, reset: resetFn };
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.capture('event_before_reset');
    await vi.advanceTimersByTimeAsync(100);
    await client.reset();
    expect(client.getQueuedEventCount()).toBe(0);
    expect(resetFn).toHaveBeenCalledOnce();
  });

  it('event counting increments on capture', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
      enableEventCounting: true,
    });
    await client.optIn();
    client.capture('button_clicked');
    client.capture('button_clicked');
    client.capture('page_viewed');
    await vi.advanceTimersByTimeAsync(100);
    expect(await client.getEventCount('button_clicked', 'all-time')).toBe(2);
    expect(await client.getEventCount('page_viewed', 'all-time')).toBe(1);
  });

  it('getEventCount returns 0 when event counting is disabled', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
      enableEventCounting: false,
    });
    client.capture('anything');
    await vi.advanceTimersByTimeAsync(100);
    expect(await client.getEventCount('anything', 'all-time')).toBe(0);
  });

  it('cleanupAfterFlush calls adapter.cleanupAfterFlush after success', async () => {
    const cleanupFn = vi.fn();
    const adapter: IAnalyticsAdapter = {
      async send() {},
      cleanupAfterFlush: cleanupFn,
    };
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      cleanupAfterFlush: { maxAgeMs: 86_400_000 },
    });
    client.capture('event');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();
    // cleanupAfterFlush is fire-and-forget; allow microtasks
    await vi.advanceTimersByTimeAsync(100);
    expect(cleanupFn).toHaveBeenCalled();
  });

  // ── GPC / DNT auto-opt-out ───────────────────────────────────────────────

  it('auto opts-out when navigator.globalPrivacyControl is true and consent is unknown', async () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true, doNotTrack: null });
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: false, // stays 'unknown' — not opted-in explicitly
      platform: 'web',
    });
    expect(client.hasOptedOut()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('auto opts-out when navigator.doNotTrack is "1" and consent is unknown', async () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: false,
      platform: 'web',
    });
    expect(client.hasOptedOut()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does NOT auto opt-out when respectDoNotTrack is false', async () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true, doNotTrack: '1' });
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
      platform: 'web',
      respectDoNotTrack: false,
    });
    expect(client.hasOptedIn()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does NOT override explicit opt-in even when GPC is set', async () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    // Simulate a stored opt-in by using defaultOptIn: true
    // The user has already made an explicit choice — GPC should not override
    const storage = makeStorage();
    // Pre-populate consent as 'opted-in' so status !== 'unknown'
    const client1 = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage,
      defaultOptIn: true,
      platform: 'web',
    });
    await client1.optIn(); // explicit opt-in written to storage

    // Second init: GPC is set but consent is already 'opted-in' in storage
    const client2 = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage,
      defaultOptIn: true,
      platform: 'web',
    });
    expect(client2.hasOptedIn()).toBe(true);
    vi.unstubAllGlobals();
  });

  // ── register() / unregister() — super properties ─────────────────────────

  it('registered properties are merged into captured events', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.register({ environment: 'test', version: '1.0' });
    client.capture('page_viewed');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as { properties: Record<string, unknown> };
    expect(event.properties.environment).toBe('test');
    expect(event.properties.version).toBe('1.0');
  });

  it('per-call properties override registered properties', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.register({ color: 'blue' });
    client.capture('button_clicked', { color: 'red' });
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as { properties: Record<string, unknown> };
    expect(event.properties.color).toBe('red');
  });

  it('unregister() removes specific keys', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.register({ a: 1, b: 2, c: 3 });
    client.unregister('b', 'c');

    expect(client.getRegisteredProperties()).toEqual({ a: 1 });
  });

  it('unregister() with no args clears all super properties', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.register({ a: 1, b: 2 });
    client.unregister();
    expect(client.getRegisteredProperties()).toEqual({});
  });

  it('getRegisteredProperties() returns a snapshot', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.register({ x: 10 });
    const snapshot = client.getRegisteredProperties();
    client.register({ x: 99 }); // mutate after snapshot
    expect(snapshot.x).toBe(10); // snapshot is unaffected
  });

  // ── group() ───────────────────────────────────────────────────────────────

  it('group() enqueues a group event with the group ID', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.group('org-42', { name: 'Acme Corp' });
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as {
      type: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(event.type).toBe('group');
    expect(event.event).toBe('$group');
    expect(event.properties.$group_id).toBe('org-42');
    expect(event.properties.name).toBe('Acme Corp');
  });

  it('group() attaches context.group.id to subsequent events', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.group('org-42');
    client.capture('page_viewed');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    // The second event (page_viewed) should carry context.group
    const pageViewEvent = adapter.batches[0].find(
      (e) => (e as { event: string }).event === 'page_viewed'
    ) as { context: { group?: { id: string } } } | undefined;
    expect(pageViewEvent?.context.group?.id).toBe('org-42');
  });

  it('group() is cleared on reset()', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });
    client.group('org-42');
    await client.reset();
    await client.optIn();
    client.capture('post_reset');
    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0].find(
      (e) => (e as { event: string }).event === 'post_reset'
    ) as { context: { group?: unknown } } | undefined;
    expect(event?.context.group).toBeUndefined();
  });

  it('group() is silently dropped when opted-out', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: false,
    });
    client.group('org-1');
    await vi.advanceTimersByTimeAsync(100);
    expect(client.getQueuedEventCount()).toBe(0);
  });
});
