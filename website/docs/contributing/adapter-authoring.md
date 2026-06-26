---
sidebar_position: 4
title: Adapter Authoring
---

# Adapter Authoring

## IAnalyticsAdapter checklist

```ts
class MyAdapter implements IAnalyticsAdapter {
  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    // 1. Never mutate batch
    // 2. If delivery fails, throw — core keeps events in queue
    // 3. Do not log distinctId or traits
  }

  async reset(): Promise<void> {}
  async shutdown(): Promise<void> {}

  async cleanupAfterFlush(
    delivered: ReadonlyArray<SunglassesEvent>,
    config: CleanupConfig,
  ): Promise<void> {
    // Never throws — log and swallow errors
  }
}
```

## IStorageAdapter checklist

```ts
class MyStorage implements IStorageAdapter {
  // All methods async; never throw to caller
  async read(key: string): Promise<string | null> { ... }
  async write(key: string, value: string): Promise<void> { ... }
  async delete(key: string): Promise<void> { ... }
  async flush?(): Promise<void> { ... } // HTTP-backed stores only
}
```

Catch internal errors and silently ignore or log them.

## Code style

- All public API methods and interfaces must have JSDoc comments
- Use `async/await` rather than `.then()` chains
- Prefer `import type { Foo }` for interfaces and types
- Barrel exports in `src/index.ts`

See [Testing](/contributing/testing) for adapter test patterns.
