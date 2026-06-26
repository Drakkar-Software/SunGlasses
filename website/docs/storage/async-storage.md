---
sidebar_position: 3
title: AsyncStorage
---

# AsyncStorage Adapter

For React Native and Expo apps.

```ts
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';

SunglassesCore.create({
  storage: new AsyncStorageAdapter(),
  ...
});
```

## Peer dependency

Requires `@react-native-async-storage/async-storage` in your app.

## Notes

- Persists across app restarts
- Queue survives process kill — events flush on next launch when adapters succeed

See [React Native setup](/getting-started/react-native-setup).
