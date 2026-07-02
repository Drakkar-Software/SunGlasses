/**
 * Result of one item run through {@link mapWithConcurrency}. Never throws —
 * failures are captured per-item so the caller decides what "partial success"
 * means for its own bookkeeping.
 */
export interface PoolResult<T, R> {
  index:  number;
  item:   T;
  result?: R;
  error?:  unknown;
}

/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 *
 * Does not fail fast: every item runs to completion (success or error) and
 * results are returned in original item order (not completion order).
 * Callers decide how to treat partial failures.
 */
export async function mapWithConcurrency<T, R>(
  items:  readonly T[],
  limit:  number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PoolResult<T, R>[]> {
  const results: PoolResult<T, R>[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { index: i, item: items[i]!, result: await worker(items[i]!, i) };
      } catch (error) {
        results[i] = { index: i, item: items[i]!, error };
      }
    }
  }

  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));
  await Promise.all(Array.from({ length: workers }, () => runOne()));
  return results;
}
