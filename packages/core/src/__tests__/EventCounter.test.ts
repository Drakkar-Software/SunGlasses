import { describe, it, expect } from 'vitest';
import { EventCounter } from '../EventCounter.js';
import { createLogger } from '../utils/logger.js';

function makeStorage() {
  const store: Record<string, string> = {};
  return {
    read: async (key: string) => store[key] ?? null,
    write: async (key: string, value: string) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
}

const logger = createLogger(false);

describe('EventCounter', () => {
  it('returns 0 for an event that has never been fired', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    expect(await counter.getCount('button_clicked', 'daily')).toBe(0);
    expect(await counter.getCount('button_clicked', 'monthly')).toBe(0);
    expect(await counter.getCount('button_clicked', 'all-time')).toBe(0);
  });

  it('increments daily count', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    const date = new Date('2024-03-15T12:00:00Z');
    await counter.increment('click', date);
    await counter.increment('click', date);
    expect(await counter.getCount('click', 'daily', date)).toBe(2);
  });

  it('increments monthly count', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    const d1 = new Date('2024-03-01T00:00:00Z');
    const d2 = new Date('2024-03-31T23:59:59Z');
    await counter.increment('click', d1);
    await counter.increment('click', d2);
    expect(await counter.getCount('click', 'monthly', d1)).toBe(2);
  });

  it('increments all-time count across multiple days', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    await counter.increment('click', new Date('2024-01-01'));
    await counter.increment('click', new Date('2024-06-15'));
    await counter.increment('click', new Date('2025-01-01'));
    expect(await counter.getCount('click', 'all-time')).toBe(3);
  });

  it('tracks different events independently', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    const date = new Date('2024-03-15');
    await counter.increment('click', date);
    await counter.increment('purchase', date);
    await counter.increment('purchase', date);
    expect(await counter.getCount('click', 'daily', date)).toBe(1);
    expect(await counter.getCount('purchase', 'daily', date)).toBe(2);
  });

  it('counts are separate for different days', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    const day1 = new Date('2024-03-14');
    const day2 = new Date('2024-03-15');
    await counter.increment('event', day1);
    await counter.increment('event', day1);
    await counter.increment('event', day2);
    expect(await counter.getCount('event', 'daily', day1)).toBe(2);
    expect(await counter.getCount('event', 'daily', day2)).toBe(1);
  });

  it('weekly bucket spans Monday–Sunday', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    // 2024-03-11 (Mon) and 2024-03-17 (Sun) are in the same ISO week
    const monday = new Date('2024-03-11');
    const sunday = new Date('2024-03-17');
    await counter.increment('event', monday);
    await counter.increment('event', sunday);
    expect(await counter.getCount('event', 'weekly', monday)).toBe(2);
  });

  it('reset() clears all periods for the given event', async () => {
    const counter = new EventCounter(makeStorage(), logger);
    const date = new Date('2024-03-15');
    await counter.increment('click', date);
    expect(await counter.getCount('click', 'all-time')).toBe(1);
    await counter.reset('click');
    expect(await counter.getCount('click', 'all-time')).toBe(0);
    expect(await counter.getCount('click', 'daily', date)).toBe(0);
  });

  it('persists counts to storage', async () => {
    const storage = makeStorage();
    const counter1 = new EventCounter(storage, logger);
    await counter1.increment('login', new Date('2024-03-15'));

    // Second instance reads from the same storage
    const counter2 = new EventCounter(storage, logger);
    expect(await counter2.getCount('login', 'daily', new Date('2024-03-15'))).toBe(1);
  });
});
