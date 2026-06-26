import { describe, it, expect } from 'vitest';
import { ConsentManager } from '../ConsentManager.js';
import { createLogger } from '../utils/logger.js';

// In-memory IStorageAdapter for tests
function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    read: async (key: string) => store[key] ?? null,
    write: async (key: string, value: string) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
}

describe('ConsentManager', () => {
  const logger = createLogger(false);

  it('defaults to opted-out when defaultOptIn=false and no persisted state', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false);
    expect(mgr.status).toBe('opted-out');
    expect(mgr.isOptedIn()).toBe(false);
    expect(mgr.isOptedOut()).toBe(true);
  });

  it('defaults to opted-in when defaultOptIn=true and no persisted state', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(true);
    expect(mgr.status).toBe('opted-in');
  });

  it('loads persisted consent state', async () => {
    const storage = makeStorage({
      'sg:consent': JSON.stringify({ status: 'opted-in', updatedAt: '2024-01-01T00:00:00.000Z' }),
    });
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false);
    expect(mgr.status).toBe('opted-in');
  });

  it('transitions opted-out → opted-in via optIn()', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false);
    await mgr.optIn();
    expect(mgr.status).toBe('opted-in');
    expect(mgr.isOptedIn()).toBe(true);
  });

  it('transitions opted-in → opted-out via optOut()', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(true);
    await mgr.optOut();
    expect(mgr.status).toBe('opted-out');
    expect(mgr.isOptedOut()).toBe(true);
  });

  it('persists consent changes to storage', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false);
    await mgr.optIn();
    const persisted = JSON.parse(storage._store['sg:consent']);
    expect(persisted.status).toBe('opted-in');
    expect(persisted.updatedAt).toBeTruthy();
  });

  // ── Policy versioning ──────────────────────────────────────────────────────

  it('resets consent to unknown when policy version changes', async () => {
    const storage = makeStorage({
      'sg:consent': JSON.stringify({
        status: 'opted-in',
        updatedAt: '2024-01-01T00:00:00.000Z',
        policyVersion: '1.0',
        history: [],
      }),
    });
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false, '2.0'); // version changed
    expect(mgr.status).toBe('unknown');
  });

  it('does NOT reset consent when policy version is the same', async () => {
    const storage = makeStorage({
      'sg:consent': JSON.stringify({
        status: 'opted-in',
        updatedAt: '2024-01-01T00:00:00.000Z',
        policyVersion: '1.0',
        history: [],
      }),
    });
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false, '1.0'); // same version
    expect(mgr.status).toBe('opted-in');
  });

  it('records policyVersion in history on optIn/optOut', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false, '1.0');
    await mgr.optIn('1.0');
    await mgr.optOut('1.0');
    const history = mgr.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe('opted-in');
    expect(history[0].policyVersion).toBe('1.0');
    expect(history[1].status).toBe('opted-out');
  });

  it('caps history at 10 entries', async () => {
    const storage = makeStorage();
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false);
    // Toggle 12 times
    for (let i = 0; i < 6; i++) {
      await mgr.optIn();
      await mgr.optOut();
    }
    expect(mgr.getHistory().length).toBeLessThanOrEqual(10);
  });

  it('appends a reset entry to history when policy version changes', async () => {
    const storage = makeStorage({
      'sg:consent': JSON.stringify({
        status: 'opted-in',
        updatedAt: '2024-01-01T00:00:00.000Z',
        policyVersion: '1.0',
        history: [{ status: 'opted-in', policyVersion: '1.0', timestamp: '2024-01-01T00:00:00.000Z' }],
      }),
    });
    const mgr = new ConsentManager(storage, logger);
    await mgr.initialize(false, '2.0');
    const history = mgr.getHistory();
    expect(history.length).toBe(2);
    expect(history[1].status).toBe('unknown');
    expect(history[1].policyVersion).toBe('2.0');
  });
});
