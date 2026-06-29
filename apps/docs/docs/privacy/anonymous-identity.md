---
sidebar_position: 3
title: Anonymous Identity
---

# Anonymous Identity

A UUID v4 `anonymousId` is generated on first run and persisted via your `IStorageAdapter`.

## Properties

- **Never derived from user data** — always a freshly generated UUID v4
- **Stable across sessions** — persisted locally until `client.reset()`
- **Safe for analytics** — suitable for DAU/retention metrics without PII

## Linking to a known user

The only way to associate the anonymous ID with a user is through `identify()`:

```ts
client.identify('user-123', { plan: 'pro' });
```

After identify, events include both `anonymousId` and `distinctId` (the user ID you provided, optionally hashed if `anonymizeUserId: true`).

## Reset

`client.reset()` clears identity, queue, session, and user-scoped metadata. A **new** `anonymousId` is generated on the next event after reset.

## Alias

Use `alias(newId, existingId)` to merge two identities when a user signs up after anonymous usage.

## Related

- [Client API — identity methods](/reference/client-api)
- [Persistent user traits](/advanced/traits)
