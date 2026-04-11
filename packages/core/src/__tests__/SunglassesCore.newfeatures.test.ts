/**
 * Tests for features added in the analytics-gap milestone:
 *  - CaptureOptions (custom timestamp / messageId)
 *  - Device / browser context auto-enrichment
 *  - deleteUserData() — GDPR Article 17
 *  - consentExpiryMs — time-based consent expiry
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SunglassesCore } from '../SunglassesCore.js';
import type { IAnalyticsAdapter, IStorageAdapter } from '../types.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

async function makeOptedInClient(storage = makeStorage(), adapter = makeAdapter()) {
  const client = await SunglassesCore.create({
    adapters: [adapter],
    storage,
    defaultOptIn: true,
  });
  return { client, adapter, storage };
}

// ─── CaptureOptions ───────────────────────────────────────────────────────────

describe('CaptureOptions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('uses a custom timestamp when provided', async () => {
    const { client, adapter } = await makeOptedInClient();
    const customTs = '2020-01-15T10:00:00.000Z';
    client.capture('custom_ts_event', {}, { timestamp: customTs });

    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    expect(adapter.batches.length).toBe(1);
    const event = adapter.batches[0][0] as { timestamp: string };
    expect(event.timestamp).toBe(customTs);
    await client.shutdown();
  });

  it('uses a custom messageId when provided', async () => {
    const { client, adapter } = await makeOptedInClient();
    const customId = '00000000-0000-0000-0000-000000000001';
    client.capture('custom_id_event', {}, { messageId: customId });

    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    expect(adapter.batches.length).toBe(1);
    const event = adapter.batches[0][0] as { messageId: string };
    expect(event.messageId).toBe(customId);
    await client.shutdown();
  });

  it('auto-generates timestamp and messageId when options are omitted', async () => {
    const { client, adapter } = await makeOptedInClient();
    const before = new Date().toISOString();
    client.capture('no_options_event');

    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as { timestamp: string; messageId: string };
    expect(event.timestamp >= before).toBe(true);
    expect(event.messageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    await client.shutdown();
  });
});

// ─── Device / browser context enrichment ─────────────────────────────────────

describe('device/browser context auto-enrichment', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('populates device.os and device.type from navigator.userAgent on web platform', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      language: 'en-US',
    });
    vi.stubGlobal('screen', { width: 1920, height: 1080 });

    const { client, adapter } = await makeOptedInClient();
    client.capture('page_loaded');

    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as {
      context: { device?: { os?: string; type?: string }; screen?: { width?: number; height?: number }; locale?: string };
    };
    expect(event.context.device?.os).toBe('Windows');
    expect(event.context.device?.type).toBe('desktop');
    expect(event.context.screen?.width).toBe(1920);
    expect(event.context.screen?.height).toBe(1080);
    expect(event.context.locale).toBe('en-US');
    await client.shutdown();
  });

  it('detects iOS mobile device', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      language: 'fr-FR',
    });

    const { client, adapter } = await makeOptedInClient();
    client.capture('app_opened');

    await vi.advanceTimersByTimeAsync(100);
    await client.flush();

    const event = adapter.batches[0][0] as {
      context: { device?: { os?: string; type?: string }; locale?: string };
    };
    expect(event.context.device?.os).toBe('iOS');
    expect(event.context.device?.type).toBe('mobile');
    expect(event.context.locale).toBe('fr-FR');
    await client.shutdown();
  });

  it('does not enrich context on react-native platform', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      language: 'en-US',
    });

    const adapter = makeAdapter();
    const rnClient = await SunglassesCore.create({
      adapters: [adapter],
      storage: makeStorage(),
      defaultOptIn: true,
      platform: 'react-native',
    });
    rnClient.capture('rn_event');

    await vi.advanceTimersByTimeAsync(100);
    await rnClient.flush();

    const event = adapter.batches[0][0] as {
      context: { device?: { os?: string }; locale?: string };
    };
    // No auto-enrichment on RN — device/locale should not be set
    expect(event.context.device).toBeUndefined();
    expect(event.context.locale).toBeUndefined();
    await rnClient.shutdown();
  });
});

// ─── deleteUserData ───────────────────────────────────────────────────────────

describe('deleteUserData()', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('clears the event queue and traits', async () => {
    const storage = makeStorage();
    const { client } = await makeOptedInClient(storage);

    client.identify('user-123', { plan: 'pro' });
    client.capture('pending_event');
    await vi.advanceTimersByTimeAsync(100); // let enqueue settle

    expect(client.getQueuedEventCount()).toBeGreaterThan(0);

    await client.deleteUserData();

    expect(client.getQueuedEventCount()).toBe(0);
    // Traits should be cleared from storage
    expect(storage._store['sunglasses:traits']).toBeUndefined();
  });

  it('resets identity — new anonymousId, no distinctId', async () => {
    const storage = makeStorage();
    const { client } = await makeOptedInClient(storage);

    client.identify('alice');
    await vi.advanceTimersByTimeAsync(100);

    const exportBefore = await client.exportUserData();
    expect(exportBefore.distinctId).not.toBeNull();

    await client.deleteUserData();

    const exportAfter = await client.exportUserData();
    expect(exportAfter.distinctId).toBeNull();
    // anonymousId must change (fresh UUID)
    expect(exportAfter.anonymousId).not.toBe(exportBefore.anonymousId);
    await client.shutdown();
  });

  it('calls adapter.reset() on all adapters', async () => {
    const storage = makeStorage();
    const adapter = makeAdapter() as IAnalyticsAdapter & { batches: unknown[][]; resetCalled: boolean };
    adapter.resetCalled = false;
    adapter.reset = async () => { adapter.resetCalled = true; };

    const client = await SunglassesCore.create({
      adapters: [adapter],
      storage,
      defaultOptIn: true,
    });

    await client.deleteUserData();
    expect(adapter.resetCalled).toBe(true);
    await client.shutdown();
  });

  it('preserves consent status when resetConsent is omitted', async () => {
    const { client } = await makeOptedInClient();
    await client.optIn();

    await client.deleteUserData();

    // Consent should still be opted-in (default: don't touch consent)
    expect(client.getConsentStatus()).toBe('opted-in');
    await client.shutdown();
  });

  it('resets consent to unknown when resetConsent: true', async () => {
    const { client } = await makeOptedInClient();
    await client.optIn();
    expect(client.getConsentStatus()).toBe('opted-in');

    await client.deleteUserData({ resetConsent: true });

    expect(client.getConsentStatus()).toBe('unknown');
    await client.shutdown();
  });
});

// ─── consentExpiryMs ─────────────────────────────────────────────────────────

describe('consentExpiryMs', () => {
  it('resets consent to unknown when stored consent is older than expiryMs', async () => {
    const storage = makeStorage();

    // Seed storage with a consent record 2 years old
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    storage._store['sunglasses:consent'] = JSON.stringify({
      status: 'opted-in',
      updatedAt: twoYearsAgo,
      history: [],
    });

    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage,
      defaultOptIn: true,
      consentExpiryMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    expect(client.getConsentStatus()).toBe('unknown');
    await client.shutdown();
  });

  it('keeps consent when it is within the expiry window', async () => {
    const storage = makeStorage();

    // Seed storage with a consent record 1 month old
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    storage._store['sunglasses:consent'] = JSON.stringify({
      status: 'opted-in',
      updatedAt: oneMonthAgo,
      history: [],
    });

    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage,
      defaultOptIn: true,
      consentExpiryMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    expect(client.getConsentStatus()).toBe('opted-in');
    await client.shutdown();
  });

  it('does not expire unknown consent (no-op)', async () => {
    const storage = makeStorage();

    // Seed storage with unknown consent (user never chose)
    const longAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    storage._store['sunglasses:consent'] = JSON.stringify({
      status: 'unknown',
      updatedAt: longAgo,
      history: [],
    });

    const client = await SunglassesCore.create({
      adapters: [makeAdapter()],
      storage,
      defaultOptIn: false,
      consentExpiryMs: 365 * 24 * 60 * 60 * 1000,
    });

    expect(client.getConsentStatus()).toBe('unknown');
    await client.shutdown();
  });
});
