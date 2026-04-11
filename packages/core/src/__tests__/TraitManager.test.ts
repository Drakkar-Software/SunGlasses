import { describe, it, expect, vi } from 'vitest';
import { TraitManager } from '../TraitManager.js';
import type { IStorageAdapter } from '../types.js';

function makeStorage(): IStorageAdapter & { _store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    read: async (key) => store[key] ?? null,
    write: async (key, value) => { store[key] = value; },
    delete: async (key) => { delete store[key]; },
    _store: store,
  };
}

function makeLogger() {
  return { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

describe('TraitManager', () => {
  it('starts with empty traits', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    expect(tm.getTraits()).toEqual({});
  });

  it('stores and retrieves traits', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'pro', age: 30 });
    expect(tm.getTraits()).toEqual({ plan: 'pro', age: 30 });
  });

  it('merges traits (does not replace)', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'free' });
    await tm.setTraits({ country: 'US' });
    expect(tm.getTraits()).toMatchObject({ plan: 'free', country: 'US' });
  });

  it('updates an existing key', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'free' });
    await tm.setTraits({ plan: 'pro' });
    expect(tm.getTraits().plan).toBe('pro');
  });

  it('removes a key when null is passed', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'pro', tag: 'vip' });
    await tm.setTraits({ tag: null });
    expect(tm.getTraits().tag).toBeUndefined();
    expect(tm.getTraits().plan).toBe('pro');
  });

  it('strips sensitive keys (email, phone, password, etc.)', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({
      plan: 'pro',
      email: 'test@example.com',
      password: 'secret123',
      phone: '555-1234',
      credit_card: '4111111111111111',
    });
    const traits = tm.getTraits();
    expect(traits.plan).toBe('pro');
    expect(traits.email).toBeUndefined();
    expect(traits.password).toBeUndefined();
    expect(traits.phone).toBeUndefined();
    expect(traits.credit_card).toBeUndefined();
  });

  it('persists traits to storage', async () => {
    const storage = makeStorage();
    const tm = new TraitManager(storage, makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'enterprise' });
    expect(storage._store['sunglasses:traits']).toContain('enterprise');
  });

  it('loads persisted traits on initialize()', async () => {
    const storage = makeStorage();
    // Pre-populate storage
    storage._store['sunglasses:traits'] = JSON.stringify({ plan: 'pro' });
    const tm = new TraitManager(storage, makeLogger());
    await tm.initialize();
    expect(tm.getTraits().plan).toBe('pro');
  });

  it('clearTraits() removes all traits and clears storage', async () => {
    const storage = makeStorage();
    const tm = new TraitManager(storage, makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'pro' });
    await tm.clearTraits();
    expect(tm.getTraits()).toEqual({});
    expect(storage._store['sunglasses:traits']).toBeUndefined();
  });

  it('getTraits() returns a copy, not the internal reference', async () => {
    const tm = new TraitManager(makeStorage(), makeLogger());
    await tm.initialize();
    await tm.setTraits({ plan: 'pro' });
    const traits = tm.getTraits();
    traits.plan = 'hacked';
    expect(tm.getTraits().plan).toBe('pro');
  });
});
