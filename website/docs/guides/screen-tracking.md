---
sidebar_position: 2
title: Screen Tracking
---

# Screen Tracking

## Web — History API

Pass `screenTracking` to `SunglassesProvider`:

```tsx
<SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
  <App />
</SunglassesProvider>
```

Route changes emit `$screen` events automatically.

### UTM capture (web)

```ts
import { captureUtmParams } from '@drakkar.software/sunglasses-react';

const client = await SunglassesCore.create({ ... });
captureUtmParams(client); // call once at startup
```

Reads `utm_*` params from `window.location.search` and `document.referrer`.

## React Native — Expo Router

```tsx
import { useExpoRouterUtmCapture, useExpoRouterScreenTracking } from '@drakkar.software/sunglasses-react-native';

export default function RootLayout() {
  const client = useSunglasses();
  useExpoRouterScreenTracking(client);
  useExpoRouterUtmCapture(client); // captures on mount + re-captures on new deep links
  return <Stack />;
}
```

## React Native — React Navigation

```tsx
import { useNavigationScreenTracking } from '@drakkar.software/sunglasses-react-native';

function AppNavigator() {
  const client = useSunglasses();
  useNavigationScreenTracking(client);
  return <NavigationContainer>...</NavigationContainer>;
}
```

## React Native — plain Linking API

```tsx
import { useLinkingUtmCapture } from '@drakkar.software/sunglasses-react-native';

export default function App() {
  const client = useSunglasses();
  useLinkingUtmCapture(client);
  return <NavigationContainer>...</NavigationContainer>;
}
```

You can also call `captureDeepLinkUtmParams(client, url)` directly if you manage deep link handling yourself.

## Manual screen tracking

```ts
client.screen('Settings', { tab: 'notifications' });
```
