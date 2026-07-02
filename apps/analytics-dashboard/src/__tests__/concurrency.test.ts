/**
 * Unit tests for the bounded-concurrency pool used to download Parquet
 * batches in parallel (see starfish-sync.ts downloadBatchIds).
 */
import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../engine/concurrency.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('mapWithConcurrency', () => {
  it('runs every item and returns results in original item order, not completion order', async () => {
    const items = [30, 10, 20, 5, 25];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await sleep(ms);
      return ms;
    });

    expect(results.map((r) => r.item)).toEqual(items);
    expect(results.map((r) => r.result)).toEqual(items);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('never runs more than `limit` workers concurrently', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await sleep(5 + (i % 3));
      active--;
      return i;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4); // with 20 items and delay, we should actually saturate the pool
  });

  it('a rejecting worker does not stop other items from completing', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (i) => {
      if (i === 3) throw new Error(`boom-${i}`);
      await sleep(1);
      return i * 10;
    });

    expect(results[2]!.error).toBeInstanceOf(Error);
    expect((results[2]!.error as Error).message).toBe('boom-3');
    // Siblings still resolved.
    expect(results[0]!.result).toBe(10);
    expect(results[1]!.result).toBe(20);
    expect(results[3]!.result).toBe(40);
    expect(results[4]!.result).toBe(50);
  });

  it('multiple rejecting workers are each captured independently', async () => {
    const items = [1, 2, 3, 4];
    const results = await mapWithConcurrency(items, 4, async (i) => {
      if (i % 2 === 0) throw new Error(`even-${i}`);
      return i;
    });

    expect(results[0]!.result).toBe(1);
    expect((results[1]!.error as Error).message).toBe('even-2');
    expect(results[2]!.result).toBe(3);
    expect((results[3]!.error as Error).message).toBe('even-4');
  });

  it('propagates non-Error thrown values as-is', async () => {
    const results = await mapWithConcurrency([1], 1, async () => {
      throw 'a string error';
    });
    expect(results[0]!.error).toBe('a string error');
  });

  it('limit larger than items.length does not over-spawn workers or break results', async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 100, async (i) => i * 2);
    expect(results.map((r) => r.result)).toEqual([2, 4, 6]);
  });

  it('limit of 0 is clamped to at least 1 (fully sequential, not a hang)', async () => {
    const order: number[] = [];
    const results = await mapWithConcurrency([1, 2, 3], 0, async (i) => {
      order.push(i);
      return i;
    });
    expect(order).toEqual([1, 2, 3]);
    expect(results.map((r) => r.result)).toEqual([1, 2, 3]);
  });

  it('negative limit is clamped to at least 1', async () => {
    const results = await mapWithConcurrency([1, 2], -5, async (i) => i);
    expect(results.map((r) => r.result)).toEqual([1, 2]);
  });

  it('non-integer limit is floored before clamping', async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2.9, async (i) => {
      active++;
      peak = Math.max(peak, active);
      await sleep(2);
      active--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((r) => r.result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('empty items array resolves immediately to an empty array', async () => {
    const results = await mapWithConcurrency([], 4, async () => {
      throw new Error('worker should never run for an empty input');
    });
    expect(results).toEqual([]);
  });

  it('single item runs and resolves correctly regardless of limit', async () => {
    const results = await mapWithConcurrency(['only'], 10, async (s) => s.toUpperCase());
    expect(results).toEqual([{ index: 0, item: 'only', result: 'ONLY' }]);
  });

  it('all items failing still returns one entry per item, all with .error set', async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 3, async (i) => {
      throw new Error(`fail-${i}`);
    });
    expect(results).toHaveLength(3);
    for (const r of results) expect(r.error).toBeInstanceOf(Error);
  });

  it('worker receives the correct (item, index) pair even under concurrency', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(items, 2, async (item, index) => {
      seen.push([item, index]);
      await sleep(1);
    });
    const sorted = [...seen].sort((a, b) => a[1] - b[1]);
    expect(sorted).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
  });

  it('does not double-invoke the worker for any item (no duplicate index draws)', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const callCounts = new Map<number, number>();
    await mapWithConcurrency(items, 7, async (i) => {
      callCounts.set(i, (callCounts.get(i) ?? 0) + 1);
      await sleep(Math.random() * 3);
    });
    expect(callCounts.size).toBe(50);
    for (const count of callCounts.values()) expect(count).toBe(1);
  });
});
