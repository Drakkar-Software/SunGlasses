import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLazyClient } from '../LazyClient.js';
import type { ISunglassesClient } from '../types.js';

type TestEvents = {
  button_clicked: { buttonId: string };
  page_viewed: undefined;
};

function makeClient(): ISunglassesClient & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(0 as never);
    };

  return {
    calls,
    capture: record('capture'),
    screen: record('screen'),
    identify: record('identify'),
    alias: record('alias'),
    group: record('group'),
    reset: record('reset') as () => Promise<void>,
    register: record('register'),
    unregister: record('unregister'),
    getRegisteredProperties: () => ({ env: 'test' }),
    optIn: record('optIn') as () => Promise<void>,
    optOut: record('optOut') as () => Promise<void>,
    hasOptedIn: () => true,
    hasOptedOut: () => false,
    getConsentStatus: () => 'opted-in',
    getConsentHistory: () => [],
    flush: record('flush') as () => Promise<void>,
    shutdown: record('shutdown') as () => Promise<void>,
    getEventCount: record('getEventCount') as () => Promise<number>,
    resetEventCount: record('resetEventCount') as () => Promise<void>,
    get eventCounter() { return null; },
    getQueuedEventCount: () => 3,
    clearLocalArchive: record('clearLocalArchive') as () => Promise<void>,
    exportUserData: async () => ({
      exportedAt: '2026-01-01T00:00:00.000Z',
      anonymousId: 'anon-1',
      distinctId: null,
      traits: {},
      consentStatus: 'opted-in' as const,
      consentHistory: [],
      queuedEvents: [],
      archivedEvents: [],
      eventCountSummary: {},
    }),
    deleteUserData: record('deleteUserData') as () => Promise<void>,
  };
}

describe('createLazyClient', () => {
  let lazy: ReturnType<typeof createLazyClient<TestEvents>>;

  beforeEach(() => {
    lazy = createLazyClient<TestEvents>();
  });

  describe('before init()', () => {
    it('capture() is a noop', () => {
      expect(() => lazy.capture('button_clicked', { buttonId: 'cta' })).not.toThrow();
    });

    it('screen() is a noop', () => {
      expect(() => lazy.screen('Home')).not.toThrow();
    });

    it('identify() is a noop', () => {
      expect(() => lazy.identify('user-1')).not.toThrow();
    });

    it('flush() resolves without error', async () => {
      await expect(lazy.flush()).resolves.toBeUndefined();
    });

    it('shutdown() resolves without error', async () => {
      await expect(lazy.shutdown()).resolves.toBeUndefined();
    });

    it('optIn() resolves without error', async () => {
      await expect(lazy.optIn()).resolves.toBeUndefined();
    });

    it('optOut() resolves without error', async () => {
      await expect(lazy.optOut()).resolves.toBeUndefined();
    });

    it('reset() resolves without error', async () => {
      await expect(lazy.reset()).resolves.toBeUndefined();
    });

    it('hasOptedIn() returns false', () => {
      expect(lazy.hasOptedIn()).toBe(false);
    });

    it('hasOptedOut() returns false', () => {
      expect(lazy.hasOptedOut()).toBe(false);
    });

    it('getConsentStatus() returns "unknown"', () => {
      expect(lazy.getConsentStatus()).toBe('unknown');
    });

    it('getConsentHistory() returns empty array', () => {
      expect(lazy.getConsentHistory()).toEqual([]);
    });

    it('getRegisteredProperties() returns empty object', () => {
      expect(lazy.getRegisteredProperties()).toEqual({});
    });

    it('getQueuedEventCount() returns 0', () => {
      expect(lazy.getQueuedEventCount()).toBe(0);
    });

    it('eventCounter is null', () => {
      expect(lazy.eventCounter).toBeNull();
    });

    it('getEventCount() resolves to 0', async () => {
      await expect(lazy.getEventCount('button_clicked', 'daily')).resolves.toBe(0);
    });

    it('exportUserData() resolves with empty-state export', async () => {
      const data = await lazy.exportUserData();
      expect(data.anonymousId).toBe('');
      expect(data.consentStatus).toBe('unknown');
      expect(data.queuedEvents).toEqual([]);
    });
  });

  describe('after init()', () => {
    let client: ReturnType<typeof makeClient>;

    beforeEach(() => {
      client = makeClient();
      lazy.init(client);
    });

    it('capture() delegates to the real client', () => {
      lazy.capture('button_clicked', { buttonId: 'cta' });
      expect(client.calls).toContainEqual({
        method: 'capture',
        args: ['button_clicked', { buttonId: 'cta' }, undefined],
      });
    });

    it('screen() delegates to the real client', () => {
      lazy.screen('Home', { referrer: 'push' });
      expect(client.calls).toContainEqual({
        method: 'screen',
        args: ['Home', { referrer: 'push' }],
      });
    });

    it('identify() delegates to the real client', () => {
      lazy.identify('user-1', { plan: 'pro' });
      expect(client.calls).toContainEqual({
        method: 'identify',
        args: ['user-1', { plan: 'pro' }],
      });
    });

    it('flush() delegates to the real client', async () => {
      await lazy.flush();
      expect(client.calls).toContainEqual({ method: 'flush', args: [] });
    });

    it('shutdown() delegates to the real client', async () => {
      await lazy.shutdown();
      expect(client.calls).toContainEqual({ method: 'shutdown', args: [] });
    });

    it('hasOptedIn() delegates to the real client', () => {
      expect(lazy.hasOptedIn()).toBe(true);
    });

    it('hasOptedOut() delegates to the real client', () => {
      expect(lazy.hasOptedOut()).toBe(false);
    });

    it('getConsentStatus() delegates to the real client', () => {
      expect(lazy.getConsentStatus()).toBe('opted-in');
    });

    it('getRegisteredProperties() delegates to the real client', () => {
      expect(lazy.getRegisteredProperties()).toEqual({ env: 'test' });
    });

    it('getQueuedEventCount() delegates to the real client', () => {
      expect(lazy.getQueuedEventCount()).toBe(3);
    });

    it('exportUserData() delegates to the real client', async () => {
      const data = await lazy.exportUserData();
      expect(data.anonymousId).toBe('anon-1');
    });
  });

  describe('init() called multiple times', () => {
    it('last init wins', () => {
      const first = makeClient();
      const second = makeClient();

      lazy.init(first);
      lazy.init(second);

      lazy.capture('page_viewed');

      expect(first.calls).toHaveLength(0);
      expect(second.calls).toContainEqual({
        method: 'capture',
        args: ['page_viewed', undefined, undefined],
      });
    });
  });
});
