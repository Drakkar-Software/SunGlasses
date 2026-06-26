---
sidebar_position: 1
title: Configuration
---

# Configuration

## `SunglassesCore.create(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adapters` | `IAnalyticsAdapter[]` | required | Output destinations |
| `storage` | `IStorageAdapter` | required | Local persistence |
| `defaultOptIn` | `boolean` | `false` | Start opted in or out |
| `allowedProperties` | `string[]` | — | Allowlist for event properties |
| `deniedProperties` | `string[]` | — | Blocklist for event properties |
| `anonymizeUserId` | `boolean` | `false` | SHA-256 hash `distinctId` |
| `respectDoNotTrack` | `boolean` | `true` | Auto opt-out on GPC/DNT (web) |
| `flushInterval` | `number` | `30000` | Auto-flush interval (ms) |
| `maxQueueSize` | `number` | `500` | Max events in queue |
| `maxBatchSize` | `number` | `50` | Events per adapter call |
| `platform` | `'web' \| 'react-native'` | `'web'` | Platform label |
| `appName` | `string` | — | App name → `context.app.name` |
| `appVersion` | `string` | — | App version → `context.app.version` |
| `appBuild` | `string` | — | Build number → `context.app.build` |
| `appVariant` | `string` | — | App variant → `context.app.variant` |
| `appUpdate` | `AppUpdateInfo` | — | OTA info → `context.app.update` |
| `environment` | `string` | — | Deployment environment |
| `features` | `string[]` | — | Enabled features → `context.features` |
| `entitlements` | `string[]` | — | User entitlements → `context.entitlements` |
| `debug` | `boolean` | `false` | Verbose console logging |
| `disabled` | `boolean` | `false` | Hard-disable all tracking |
| `middleware` | `IMiddleware[]` | `[]` | Custom middleware chain |
| `consentPolicyVersion` | `string` | — | Reset consent when policy changes |
| `consentExpiryMs` | `number` | — | Reset consent after N ms |
| `enableSessionTracking` | `boolean` | `false` | Session IDs + `$session_start` |
| `sessionIdleTimeoutMs` | `number` | `1800000` | Session idle timeout (30 min) |
| `enableEventCounting` | `boolean` | `false` | Event frequency counters |
| `enableLocalArchive` | `boolean` | `false` | Permanent local event copy |
| `cleanupAfterFlush` | `CleanupConfig` | — | Prune remote data after flush |

## `CaptureOptions`

Third argument to `capture()`:

| Option | Type | Description |
|--------|------|-------------|
| `timestamp` | `string` | ISO-8601 back-date for offline events |
| `messageId` | `string` | Server-side deduplication UUID |

## `CleanupConfig`

| Option | Type | Description |
|--------|------|-------------|
| `maxAgeMs` | `number` | Remove events older than N ms |
| `maxEventsPerIdentity` | `number` | Max events per user in remote store |
