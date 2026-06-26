/**
 * Tests for global app metadata attached to every event's context:
 *  - environment, app.variant, app.update, features, entitlements
 *  - config init + runtime setters (setEnvironment/setAppUpdate/setFeatures/
 *    setEntitlements/setAppMetadata) and getAppMetadata()
 *  - reset()/deleteUserData() clear entitlements (user-scoped) only
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SunglassesCore } from '../SunglassesCore.js';
import type { EventContext, IAnalyticsAdapter, IStorageAdapter } from '../types.js';

function makeStorage(): IStorageAdapter & { _store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    read: async (key) => store[key] ?? null,
    write: async (key, value) => { store[key] = value; },
    delete: async (key) => { delete store[key]; },
    _store: store,
  };
}

function makeAdapter(): IAnalyticsAdapter & { batches: unknown[][] } {
  const batches: unknown[][] = [];
  return {
    batches,
    async send(batch) { batches.push([...batch]); },
  };
}

async function captureContext(
  client: SunglassesCore,
  adapter: IAnalyticsAdapter & { batches: unknown[][] },
  eventName: string
): Promise<EventContext> {
  client.capture(eventName);
  await vi.advanceTimersByTimeAsync(100);
  await client.flush();
  const event = adapter.batches.at(-1)![0] as { context: EventContext };
  return event.context;
}

describe('global app metadata on context', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('attaches config-provided metadata to every event context', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      platform: 'react-native',
      appName: 'example-rn',
      appVersion: '1.2.3',
      appVariant: 'pro',
      appUpdate: { id: 'upd_123', channel: 'production', embedded: false },
      environment: 'production',
      features: ['new-onboarding', 'dark-mode'],
      entitlements: ['premium'],
    });

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.app).toMatchObject({ name: 'example-rn', version: '1.2.3', variant: 'pro' });
    expect(ctx.app?.update).toEqual({ id: 'upd_123', channel: 'production', embedded: false });
    expect(ctx.environment).toBe('production');
    expect(ctx.features).toEqual(['new-onboarding', 'dark-mode']);
    expect(ctx.entitlements).toEqual(['premium']);

    await client.shutdown();
  });

  it('omits metadata fields that are not set', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.app).toBeUndefined();
    expect(ctx.environment).toBeUndefined();
    expect(ctx.features).toBeUndefined();
    expect(ctx.entitlements).toBeUndefined();

    await client.shutdown();
  });

  it('includes context.app when only appVariant/appUpdate are set (no name/version)', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      appVariant: 'beta',
    });

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.app?.variant).toBe('beta');
    expect(ctx.app?.name).toBeUndefined();

    await client.shutdown();
  });

  it('runtime setters update subsequent events', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
    });

    client.setEnvironment('staging');
    client.setAppUpdate({ id: 'upd_456', runtimeVersion: '2.0.0' });
    client.setFeatures(['flag-a']);
    client.setEntitlements(['trial']);

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.environment).toBe('staging');
    expect(ctx.app?.update).toEqual({ id: 'upd_456', runtimeVersion: '2.0.0' });
    expect(ctx.features).toEqual(['flag-a']);
    expect(ctx.entitlements).toEqual(['trial']);

    await client.shutdown();
  });

  it('setAppMetadata merges only provided keys', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      environment: 'production',
      features: ['keep-me'],
    });

    client.setAppMetadata({ entitlements: ['premium'] });

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.environment).toBe('production');
    expect(ctx.features).toEqual(['keep-me']);
    expect(ctx.entitlements).toEqual(['premium']);

    await client.shutdown();
  });

  it('getAppMetadata returns the current snapshot', async () => {
    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage: makeStorage(),
      defaultOptIn: true,
      environment: 'production',
      appVariant: 'pro',
      features: ['x'],
      entitlements: ['premium'],
    });

    expect(client.getAppMetadata()).toEqual({
      environment: 'production',
      appVariant: 'pro',
      appUpdate: undefined,
      features: ['x'],
      entitlements: ['premium'],
    });

    client.setEnvironment('staging');
    expect(client.getAppMetadata().environment).toBe('staging');

    await client.shutdown();
  });

  it('reset() clears entitlements but preserves app-scoped metadata', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      environment: 'production',
      appVariant: 'pro',
      appUpdate: { id: 'upd_1' },
      features: ['x'],
      entitlements: ['premium'],
    });

    await client.reset();

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.entitlements).toBeUndefined();
    expect(ctx.environment).toBe('production');
    expect(ctx.app?.variant).toBe('pro');
    expect(ctx.app?.update).toEqual({ id: 'upd_1' });
    expect(ctx.features).toEqual(['x']);

    await client.shutdown();
  });

  it('deleteUserData() clears entitlements but preserves app-scoped metadata', async () => {
    const adapter = makeAdapter();
    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      environment: 'production',
      features: ['x'],
      entitlements: ['premium'],
    });

    await client.deleteUserData();

    const ctx = await captureContext(client, adapter, 'evt');

    expect(ctx.entitlements).toBeUndefined();
    expect(ctx.environment).toBe('production');
    expect(ctx.features).toEqual(['x']);

    await client.shutdown();
  });
});
