---
sidebar_position: 1
title: Middleware
---

# Custom Middleware

Middleware runs after `PiiSanitizer` (which is always first and cannot be removed). Each middleware can transform or drop events before they reach adapters.

```ts
import type { IMiddleware, SunglassesEvent, MiddlewareNext } from '@drakkar.software/sunglasses-core';

const myMiddleware: IMiddleware = {
  name: 'AddAppVersion',
  async process(event: SunglassesEvent, next: MiddlewareNext) {
    // Drop internal events
    if (event.event.startsWith('$internal_')) return null;
    // Enrich the event
    return next({ ...event, properties: { ...event.properties, app_version: '2.0' } });
  },
};

SunglassesCore.create({ middleware: [myMiddleware], ... });
```

## Rules

1. **Never throw** — return `null` to drop; the pipeline catches throws and treats them as drops
2. **Always spread** when modifying — `{ ...event, properties: { ...event.properties } }`
3. **Never log `distinctId`** or user traits
4. **Call `next(event)`** to continue the pipeline

## Built-in middleware

| Middleware | Purpose |
|------------|---------|
| `PiiSanitizer` | Always prepended — redacts PII |
| `SamplingMiddleware` | Random volume reduction — see [Sampling](/core/sampling) |
| `FrequencyMiddleware` | Attach event counts — see [Frequency counting](/core/frequency-counting) |

## Contributor guide

See [Middleware authoring](/contributing/middleware-authoring) for testing patterns.
