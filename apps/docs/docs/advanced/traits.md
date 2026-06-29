---
sidebar_position: 5
title: User Traits
---

# Persistent User Traits

Set user traits once via `identify()` and they are automatically forwarded with every subsequent event in `context.traits`.

```ts
client.identify('user-123', { plan: 'pro', country: 'US' });

// All subsequent events include context.traits = { plan: 'pro', country: 'US' }
client.capture('button_clicked', { buttonId: 'cta' });
```

Sensitive keys (`email`, `password`, `phone`, etc.) are stripped before traits are persisted. Traits survive app restarts. Call `client.reset()` to clear them.

See [PII sanitization](/privacy/pii-sanitization).
