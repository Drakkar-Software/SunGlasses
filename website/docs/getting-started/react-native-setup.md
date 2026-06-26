---
sidebar_position: 4
title: React Native Setup
---

# React Native / Expo Setup

## Install

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react-native @drakkar.software/sunglasses-storage-async-storage
pnpm add @react-native-async-storage/async-storage react-native-get-random-values
```

Add `@drakkar.software/sunglasses-storage-http` for HTTP push.

:::warning
`react-native-get-random-values` **must** be the first import in your entry file. Without it, UUID generation fails on React Native.
:::

## Initialize (Expo Router)

```tsx
// app/_layout.tsx (Expo Router)
import 'react-native-get-random-values'; // Must be first import
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider, useSunglasses, useExpoRouterScreenTracking } from '@drakkar.software/sunglasses-react-native';
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';
import { HttpStorageAdapter } from '@drakkar.software/sunglasses-storage-http';

function InnerLayout() {
  const client = useSunglasses();
  useExpoRouterScreenTracking(client); // Auto-tracks Expo Router screens
  return <Stack />;
}

export default function RootLayout() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    SunglassesCore.create({
      storage: new AsyncStorageAdapter(),
      adapters: [new HttpStorageAdapter({ endpoint: 'https://ingest.example.com/batch' })],
      defaultOptIn: false,
      platform: 'react-native',
    }).then(setClient);
  }, []);

  if (!client) return null;
  return <SunglassesProvider client={client}><InnerLayout /></SunglassesProvider>;
}
```

## Screen tracking options

| Hook | Use when |
|------|----------|
| `useExpoRouterScreenTracking` | Expo Router apps |
| `useNavigationScreenTracking` | React Navigation apps |

See [Screen tracking](/guides/screen-tracking) for deep-link UTM capture.

## Troubleshooting

If events never send, verify:

1. `react-native-get-random-values` is imported first
2. `client.getConsentStatus()` is `'opted-in'`
3. `debug: true` is set during development

## Next steps

- [Consent](/privacy/consent)
- [Error capture](/guides/error-capture)
- [Configuration reference](/reference/config)
