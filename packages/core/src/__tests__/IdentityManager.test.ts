import { describe, it, expect } from 'vitest';
import { IdentityManager } from '../IdentityManager.js';
import { createLogger } from '../utils/logger.js';

function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    read: async (key: string) => store[key] ?? null,
    write: async (key: string, value: string) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
}

const logger = createLogger(false);

describe('IdentityManager', () => {
  it('generates a new anonymousId on first run', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, false);
    await mgr.initialize();
    expect(mgr.getAnonymousId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('persists and reloads anonymousId across instances', async () => {
    const storage = makeStorage();
    const mgr1 = new IdentityManager(storage, logger, false);
    await mgr1.initialize();
    const id1 = mgr1.getAnonymousId();

    const mgr2 = new IdentityManager(storage, logger, false);
    await mgr2.initialize();
    expect(mgr2.getAnonymousId()).toBe(id1);
  });

  it('getEffectiveDistinctId returns anonymousId before identify()', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, false);
    await mgr.initialize();
    expect(mgr.getEffectiveDistinctId()).toBe(mgr.getAnonymousId());
  });

  it('identify() sets distinctId and persists it', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, false);
    await mgr.initialize();
    const resolved = await mgr.identify('user-123');
    expect(resolved).toBe('user-123');
    expect(mgr.getEffectiveDistinctId()).toBe('user-123');
    expect(mgr.getState().isIdentified).toBe(true);
    expect(storage._store['sg:distinct_id']).toBe('user-123');
  });

  it('identify() with anonymizeUserId=true returns a hash (not plaintext)', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, true);
    await mgr.initialize();
    const resolved = await mgr.identify('user-123');
    expect(resolved).not.toBe('user-123');
    expect(resolved).toHaveLength(64); // SHA-256 hex
  });

  it('reset() clears distinctId and generates a new anonymousId', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, false);
    await mgr.initialize();
    const originalAnon = mgr.getAnonymousId();
    await mgr.identify('user-123');
    await mgr.reset();

    expect(mgr.getState().distinctId).toBeNull();
    expect(mgr.getState().isIdentified).toBe(false);
    expect(mgr.getAnonymousId()).not.toBe(originalAnon);
    expect(storage._store['sg:distinct_id']).toBeUndefined();
  });

  it('getEffectiveDistinctId returns distinctId after identify()', async () => {
    const storage = makeStorage();
    const mgr = new IdentityManager(storage, logger, false);
    await mgr.initialize();
    await mgr.identify('user-abc');
    expect(mgr.getEffectiveDistinctId()).toBe('user-abc');
  });
});
