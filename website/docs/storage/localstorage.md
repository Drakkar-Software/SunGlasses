---
sidebar_position: 2
title: localStorage
---

# localStorage Adapter

For React web apps.

```ts
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';

SunglassesCore.create({
  storage: new LocalStorageAdapter(),
  ...
});
```

## Notes

- Uses browser `localStorage` — subject to per-origin quota (~5 MB)
- If storage quota is exceeded, writes are silently ignored; queue state may become inconsistent
- Not available in SSR — initialize the client only in the browser

See [Web setup](/getting-started/web-setup).
