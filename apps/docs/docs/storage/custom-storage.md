---
sidebar_position: 4
title: Custom Storage
---

# Custom Storage Adapter

Implement `IStorageAdapter` to use any key-value store (SecureStore, MMKV, IndexedDB, etc.).

```ts
import type { IStorageAdapter } from '@drakkar.software/sunglasses-core';

class SecureStorageAdapter implements IStorageAdapter {
  async read(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }
  async write(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }
  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}
```

## Rules

- All methods must be **async**
- Methods must **not throw** to the caller — catch internal errors and log or ignore
- Optional `flush()` is only needed for HTTP-backed stores that buffer writes

See [Adapter authoring](/contributing/adapter-authoring) in the contributor guide.
