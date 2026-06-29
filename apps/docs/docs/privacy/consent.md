---
sidebar_position: 1
title: Consent
---

# Consent

SunGlasses is **opt-out by default**. Users start with consent status `'unknown'` or `'opted-out'` (depending on prior storage) and no events are collected until they explicitly opt in.

## API

```ts
// User must explicitly opt in before any event is collected
await client.optIn();

// Revoke consent at any time — clears the queue immediately
await client.optOut();

// Check current status
client.getConsentStatus(); // 'opted-in' | 'opted-out' | 'unknown'
```

## Behaviour when opted out

When the user has not opted in (or has opted out):

- `capture()`, `screen()`, `identify()`, `alias()` return immediately
- No queue writes, no storage writes, no network calls
- Zero side effects — the consent gate is unconditional

:::tip
Set `defaultOptIn: true` in config if your product requires opt-in-by-default instead. Most privacy-first apps keep the default `false`.
:::

## Consent history

Every consent change is recorded locally (up to 10 entries):

```ts
const history = client.getConsentHistory();
// [
//   { status: 'opted-in', policyVersion: '1.0', timestamp: '...' },
//   { status: 'opted-out', policyVersion: '1.0', timestamp: '...' },
// ]
```

## Policy versioning

Bump `consentPolicyVersion` when your privacy policy changes to force re-consent. See [GDPR](/advanced/gdpr).

## Global Privacy Control (web)

When `respectDoNotTrack: true` (default on web), SunGlasses auto opts out if the browser sends a GPC/DNT signal.

## Related

- [Consent UI patterns](/guides/consent-ui-patterns)
- [PII sanitization](/privacy/pii-sanitization)
- [Anonymous identity](/privacy/anonymous-identity)
