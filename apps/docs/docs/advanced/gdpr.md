---
sidebar_position: 2
title: GDPR
---

# GDPR Features

## Consent versioning

When your privacy policy changes, force users to re-consent by bumping the version:

```ts
SunglassesCore.create({
  consentPolicyVersion: '2.0',
  ...
});
```

If a user previously consented under a different version, their status resets to `'unknown'`. Full consent history (up to 10 entries) is preserved:

```ts
const history = client.getConsentHistory();
```

Optional `consentExpiryMs` resets consent after N milliseconds of age (e.g. one year).

## Data portability (Article 20)

Export all locally stored user data as structured JSON — no network calls:

```ts
const data = await client.exportUserData();
// {
//   exportedAt: '...',
//   anonymousId: '...',
//   distinctId: 'user-123',
//   consentStatus: 'opted-in',
//   consentHistory: [...],
//   traits: { plan: 'pro' },
//   queuedEvents: [...],
//   archivedEvents: [...],
//   eventCountSummary: { ... }
// }
```

## Right to erasure (Article 17)

```ts
await client.deleteUserData({ resetConsent: true });
```

Clears identity, queue, traits, archive, and optionally resets consent.

## Local event archive

Enable `enableLocalArchive: true` for a permanent local copy used in exports. See [Local event archive](/advanced/local-archive).
