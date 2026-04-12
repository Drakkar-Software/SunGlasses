import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../SessionManager.js';
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

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('creates a new session on first getOrCreate()', async () => {
    const sm = new SessionManager(makeStorage(), makeLogger());
    await sm.initialize();
    const session = sm.getOrCreate();
    expect(session.sessionId).toBeTruthy();
    expect(session.eventCount).toBe(0);
  });

  it('returns the same session on subsequent getOrCreate() calls', async () => {
    const sm = new SessionManager(makeStorage(), makeLogger());
    await sm.initialize();
    const s1 = sm.getOrCreate();
    const s2 = sm.getOrCreate();
    expect(s1.sessionId).toBe(s2.sessionId);
  });

  it('touch() increments eventCount', async () => {
    const sm = new SessionManager(makeStorage(), makeLogger());
    await sm.initialize();
    sm.getOrCreate();
    sm.touch();
    sm.touch();
    expect(sm.getOrCreate().eventCount).toBe(2);
  });

  it('session expires after idleTimeoutMs', async () => {
    const idleMs = 5_000;
    const sm = new SessionManager(makeStorage(), makeLogger(), idleMs);
    await sm.initialize();
    const firstId = sm.getOrCreate().sessionId;

    // Advance time past idle timeout
    await vi.advanceTimersByTimeAsync(idleMs + 1);

    const secondId = sm.getOrCreate().sessionId;
    expect(secondId).not.toBe(firstId);
  });

  it('touch() resets the idle timer', async () => {
    const idleMs = 5_000;
    const sm = new SessionManager(makeStorage(), makeLogger(), idleMs);
    await sm.initialize();
    const firstId = sm.getOrCreate().sessionId;

    // Advance to just before timeout, then touch
    await vi.advanceTimersByTimeAsync(idleMs - 100);
    sm.touch();
    // Advance another full idle period — should NOT have expired yet
    await vi.advanceTimersByTimeAsync(idleMs - 100);
    expect(sm.getOrCreate().sessionId).toBe(firstId);
  });

  it('end() clears session and storage', async () => {
    const storage = makeStorage();
    const sm = new SessionManager(storage, makeLogger());
    await sm.initialize();
    sm.getOrCreate();
    await sm.end();

    expect(sm.sessionId).toBeNull();
    expect(storage._store['sg:session']).toBeUndefined();
  });

  it('resumes a valid session from storage on initialize()', async () => {
    const storage = makeStorage();
    const sm1 = new SessionManager(storage, makeLogger(), 60_000);
    await sm1.initialize();
    const originalId = sm1.getOrCreate().sessionId;
    sm1.touch(); // persist with recent lastActiveAt

    // New instance loading the same storage
    const sm2 = new SessionManager(storage, makeLogger(), 60_000);
    await sm2.initialize();
    expect(sm2.getOrCreate().sessionId).toBe(originalId);
  });

  it('discards an expired session from storage on initialize()', async () => {
    const storage = makeStorage();
    // Write a stale session directly
    const staleSession = {
      sessionId: 'old-session',
      startedAt: new Date(Date.now() - 200_000).toISOString(),
      lastActiveAt: new Date(Date.now() - 200_000).toISOString(), // 200 s ago
      eventCount: 5,
    };
    storage._store['sg:session'] = JSON.stringify(staleSession);

    const sm = new SessionManager(storage, makeLogger(), 60_000); // 60 s timeout
    await sm.initialize();
    expect(sm.getOrCreate().sessionId).not.toBe('old-session');
  });
});
