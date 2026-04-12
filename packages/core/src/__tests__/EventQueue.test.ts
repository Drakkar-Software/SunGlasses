import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventQueue } from '../EventQueue.js';
import { createLogger } from '../utils/logger.js';
import type { SunglassesEvent } from '../types.js';

function makeStorage() {
  const store: Record<string, string> = {};
  return {
    read: async (key: string) => store[key] ?? null,
    write: async (key: string, value: string) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
}

function makeEvent(id: string): SunglassesEvent {
  return {
    type: 'capture',
    event: 'test',
    distinctId: 'anon',
    anonymousId: 'anon',
    timestamp: '2024-01-01T00:00:00.000Z',
    messageId: id,
    properties: {},
    context: { library: { name: '@drakkar.software/sunglasses-core', version: '0.1.0' }, platform: 'web' },
  };
}

describe('EventQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts empty', async () => {
    const q = new EventQueue(makeStorage(), createLogger(false), 100);
    await q.initialize();
    expect(q.size).toBe(0);
  });

  it('enqueues and peeks events', async () => {
    const q = new EventQueue(makeStorage(), createLogger(false), 100);
    await q.initialize();
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    expect(q.size).toBe(2);
    expect(q.peek(10).map(e => e.messageId)).toEqual(['a', 'b']);
  });

  it('removes events after flush', async () => {
    const q = new EventQueue(makeStorage(), createLogger(false), 100);
    await q.initialize();
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    q.remove(1);
    expect(q.size).toBe(1);
    expect(q.peek(10)[0].messageId).toBe('b');
  });

  it('drops oldest events when maxSize is exceeded', async () => {
    const q = new EventQueue(makeStorage(), createLogger(false), 3);
    await q.initialize();
    q.enqueue(makeEvent('a'));
    q.enqueue(makeEvent('b'));
    q.enqueue(makeEvent('c'));
    q.enqueue(makeEvent('d')); // 'a' should be dropped
    expect(q.size).toBe(3);
    expect(q.peek(3).map(e => e.messageId)).toEqual(['b', 'c', 'd']);
  });

  it('loads persisted events on initialize', async () => {
    const storage = makeStorage();
    const events = [makeEvent('x'), makeEvent('y')];
    storage._store['sg:queue'] = JSON.stringify(events);

    const q = new EventQueue(storage, createLogger(false), 100);
    await q.initialize();
    expect(q.size).toBe(2);
  });

  it('clears queue and removes from storage', async () => {
    const storage = makeStorage();
    const q = new EventQueue(storage, createLogger(false), 100);
    await q.initialize();
    q.enqueue(makeEvent('a'));
    await q.clear();
    expect(q.size).toBe(0);
    expect(storage._store['sg:queue']).toBeUndefined();
  });
});
