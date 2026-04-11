import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorageAdapter } from '../LocalStorageAdapter.js';

// ─── localStorage stub ─────────────────────────────────────────────────────
// We stub globalThis.localStorage so these tests run in Node (no DOM needed).

function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
    _store: store,
  };
}

describe('LocalStorageAdapter', () => {
  let stub: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    stub = makeLocalStorageStub();
    vi.stubGlobal('localStorage', stub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Basic CRUD ──────────────────────────────────────────────────────────────

  it('write then read returns the stored value', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.write('queue', '["event1"]');
    expect(await adapter.read('queue')).toBe('["event1"]');
  });

  it('read returns null for a missing key', async () => {
    const adapter = new LocalStorageAdapter();
    expect(await adapter.read('missing')).toBeNull();
  });

  it('delete removes the key', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.write('token', 'abc');
    await adapter.delete('token');
    expect(await adapter.read('token')).toBeNull();
  });

  // ── Prefix namespacing ──────────────────────────────────────────────────────

  it('uses the default prefix sg_', async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.write('key', 'value');
    expect(stub.setItem).toHaveBeenCalledWith('sg_key', 'value');
    expect(stub.getItem).not.toHaveBeenCalledWith('key');
  });

  it('uses a custom prefix when provided', async () => {
    const adapter = new LocalStorageAdapter('myapp_');
    await adapter.write('session', 'data');
    expect(stub.setItem).toHaveBeenCalledWith('myapp_session', 'data');
  });

  it('two adapters with different prefixes do not collide', async () => {
    const a = new LocalStorageAdapter('a_');
    const b = new LocalStorageAdapter('b_');
    await a.write('key', 'from-a');
    await b.write('key', 'from-b');
    expect(await a.read('key')).toBe('from-a');
    expect(await b.read('key')).toBe('from-b');
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it('read returns null when localStorage.getItem throws', async () => {
    stub.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const adapter = new LocalStorageAdapter();
    await expect(adapter.read('key')).resolves.toBeNull();
  });

  it('write is silent when localStorage.setItem throws a generic error', async () => {
    stub.setItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const adapter = new LocalStorageAdapter();
    await expect(adapter.write('key', 'val')).resolves.toBeUndefined();
  });

  it('write warns but does not throw on QuotaExceededError', async () => {
    const quotaError = Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    stub.setItem.mockImplementation(() => { throw quotaError; });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const adapter = new LocalStorageAdapter();
    await expect(adapter.write('key', 'val')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('quota exceeded')
    );

    warnSpy.mockRestore();
  });

  it('delete is silent when localStorage.removeItem throws', async () => {
    stub.removeItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const adapter = new LocalStorageAdapter();
    await expect(adapter.delete('key')).resolves.toBeUndefined();
  });
});
