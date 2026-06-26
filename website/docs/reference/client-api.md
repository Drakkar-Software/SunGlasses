---
sidebar_position: 2
title: Client API
---

# Client API

All methods on `ISunglassesClient` (returned by `SunglassesCore.create()`).

## Event tracking

```ts
client.capture(eventName, properties?, options?)
client.screen(screenName, properties?)
client.identify(userId, traits?)
client.alias(newId, existingId)
client.group(groupId, traits?)
```

## Super properties

```ts
client.register({ experiment_group: 'A' })
client.unregister('experiment_group')
client.getRegisteredProperties()
```

## App metadata

```ts
client.setEnvironment('production')
client.setAppUpdate({ id, channel, embedded })
client.setFeatures(['new-onboarding'])
client.setEntitlements(['premium'])
client.setAppMetadata({ environment, features })
client.getAppMetadata()
```

## Consent

```ts
client.optIn()
client.optOut()
client.getConsentStatus()    // 'opted-in' | 'opted-out' | 'unknown'
client.getConsentHistory()
```

## Identity

```ts
client.reset()               // Clear identity + queue + session
```

## GDPR

```ts
client.exportUserData()
client.deleteUserData({ resetConsent? })
client.clearLocalArchive({ maxAgeMs? })
```

## Lifecycle

```ts
client.flush()               // Force-send queued events
client.shutdown()            // Flush + stop timers (call on unmount)
```

## Diagnostics

```ts
client.getQueuedEventCount()
client.getEventCount(name, period, date?)  // requires enableEventCounting
client.resetEventCount(name)
client.eventCounter                        // EventCounter instance (if enabled)
```

## React hooks

| Hook | Package | Purpose |
|------|---------|---------|
| `useSunglasses()` | react, react-native | Access client from context |
| `useCapture()` | react | Typed capture helper |
| `useConsentStatus()` | react | Reactive consent state |
| `useScreenTracking()` | react | History API screen tracking |
| `useExpoRouterScreenTracking()` | react-native | Expo Router screens |
| `useNavigationScreenTracking()` | react-native | React Navigation screens |
| `useExpoRouterUtmCapture()` | react-native | UTM from Expo Router |
| `useLinkingUtmCapture()` | react-native | UTM from Linking API |

## Components

| Component | Package | Purpose |
|-----------|---------|---------|
| `SunglassesProvider` | react, react-native | Context + optional tracking |
| `SunglassesErrorBoundary` | react, react-native | Render error capture |
