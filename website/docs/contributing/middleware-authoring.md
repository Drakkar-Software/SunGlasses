---
sidebar_position: 5
title: Middleware Authoring
---

# Middleware Authoring

```ts
import type { IMiddleware, MiddlewareNext, SunglassesEvent } from '@drakkar.software/sunglasses-core';

class MyMiddleware implements IMiddleware {
  readonly name = 'MyMiddleware'; // must be unique

  async process(event: SunglassesEvent, next: MiddlewareNext): Promise<SunglassesEvent | null> {
    if (shouldDrop(event)) return null;
    return next({ ...event, properties: { ...event.properties, extra: 'value' } });
  }
}
```

## Rules

1. **Never throw** — return `null` to drop
2. **Always spread** when modifying — `{ ...event, properties: { ...event.properties } }`
3. **Never log `distinctId`** or user traits
4. **Call `next(event)`** to continue the pipeline
5. **Async work is fine** — the pipeline `await`s each middleware

`PiiSanitizer` is always prepended before your middleware. See [Privacy invariants](/contributing/privacy-invariants).

## Testing

See [Testing](/contributing/testing).
