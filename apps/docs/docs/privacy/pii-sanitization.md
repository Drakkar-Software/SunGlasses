---
sidebar_position: 2
title: PII Sanitization
---

# PII Sanitization

`PiiSanitizer` runs **first** in the middleware pipeline — before any custom middleware or adapter. It cannot be removed or reordered.

## What gets redacted

Built-in sanitization runs before every event is queued:

- Email addresses → PII substring replaced with `[redacted]`
- Phone numbers → PII substring replaced with `[redacted]`
- IPv4 addresses → PII substring replaced with `[redacted]`
- Credit card numbers → PII substring replaced with `[redacted]`
- Common key names (`email`, `phone`, `password`, `ssn`, `credit_card`) are **removed entirely**

:::info Substring masking
PII is masked at the **matched substring** level, not the whole value. This means error messages and stack traces that contain incidental PII (`"User alice@example.com not found"`) become `"User [redacted] not found"` — the surrounding context is preserved. Bare PII values (`"alice@example.com"`) become `"[redacted]"` as before.
:::

## Property allowlist / blocklist

Configure full control at init:

```ts
SunglassesCore.create({
  allowedProperties: ['page', 'action', 'plan'], // only these keys pass through
  deniedProperties: ['internal_debug_token'],
  ...
});
```

If `allowedProperties` is set, **all other keys are stripped**. This is a common cause of "missing properties" — see [Troubleshooting](/reference/troubleshooting).

## User ID hashing

Set `anonymizeUserId: true` to SHA-256 hash `distinctId` before events leave the device.

## Traits

Sensitive keys are stripped from persisted traits before storage. See [Persistent user traits](/advanced/traits).

## Contributor note

Never log `distinctId` or user traits in adapters or middleware — even in debug mode. The logger may log `anonymousId` for debugging only.
