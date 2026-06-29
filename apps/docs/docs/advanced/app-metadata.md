---
sidebar_position: 6
title: App Metadata
---

# Global App Metadata

Attach typed, non-PII metadata about the running app to **every event's `context`** — app name/version/variant, OTA update info, deployment environment, enabled features, and user entitlements.

```ts
const client = await SunglassesCore.create({
  adapters: [/* ... */],
  storage,
  appName: 'my-app',
  appVersion: '1.4.2',
  appVariant: 'pro',
  appUpdate: { id: 'upd_abc', channel: 'production', runtimeVersion: '1.4.0', embedded: false },
  environment: 'production',
  features: ['new-onboarding', 'dark-mode'],
  entitlements: ['premium'],
});

// Update at runtime
client.setEntitlements(['premium', 'team-seat']);
client.setFeatures(['new-onboarding']);
client.setAppUpdate({ id: 'upd_def', embedded: false });
```

Every event carries:

```json
{
  "context": {
    "app": { "name": "my-app", "version": "1.4.2", "variant": "pro", "update": { ... } },
    "environment": "production",
    "features": ["new-onboarding", "dark-mode"],
    "entitlements": ["premium"]
  }
}
```

## Scoping and lifecycle

| Field | Scope | Survives `reset()`? |
|-------|-------|---------------------|
| `environment`, `appVariant`, `appUpdate`, `features` | App-scoped | Yes |
| `entitlements` | User-scoped | No |

All metadata is **in-memory only** — re-supply on each app boot. Use `register()` for free-form per-event super properties instead.

## Runtime API

```ts
client.setEnvironment('production');
client.setAppUpdate({ id, channel, embedded });
client.setFeatures(['flag-a']);
client.setEntitlements(['premium']);
client.setAppMetadata({ environment, features });
client.getAppMetadata();
```
