---
sidebar_position: 2
title: PII Sanitization
---

# PII Sanitization

`PiiSanitizer` runs **first** in the middleware pipeline — before any custom middleware or adapter. It cannot be removed or reordered.

## What gets redacted

Built-in sanitization runs before every event is queued:

- Email addresses → `[redacted]`
- Phone numbers → `[redacted]`
- IPv4 addresses → `[redacted]`
- Credit card numbers → `[redacted]`
- Common key names (`email`, `phone`, `password`, `ssn`, `credit_card`) are removed

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
