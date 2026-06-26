---
sidebar_position: 3
title: Testing
---

# Testing Strategy

Vitest is the test runner (no Jest). Tests live in `src/__tests__/` alongside the code they test.

## In-memory storage stub

Every test needing `IStorageAdapter` uses a local stub:

```ts
function makeStorage() {
  const store: Record<string, string> = {};
  return {
    read: async (key: string) => store[key] ?? null,
    write: async (key: string, value: string) => { store[key] = value; },
    delete: async (key: string) => { delete store[key]; },
    _store: store,
  };
}
```

## Fake timers

`SunglassesCore` uses `setInterval` for auto-flush. Use Vitest fake timers:

```ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('flushes on demand', async () => {
  const client = await SunglassesCore.create({ ... });
  client.capture('event');
  await vi.advanceTimersByTimeAsync(100);
  await client.flush();
  expect(adapter.batches.length).toBe(1);
});
```

:::warning
Use `vi.advanceTimersByTimeAsync(100)` — **not** `vi.runAllTimersAsync()`, which loops forever on the flush interval.
:::

## Testing adapters

```ts
import { vi } from 'vitest';
const mockFetch = vi.fn();
global.fetch = mockFetch;
mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
// call adapter.send(batch) and assert mockFetch was called
```

## Testing middleware

Cover:
- Happy path: event passes through unchanged
- Drop case: return `null`
- Transform case: properties modified
- Error case: throw → treated as drop, should not propagate
