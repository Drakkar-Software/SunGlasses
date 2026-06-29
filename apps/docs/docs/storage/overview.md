---
sidebar_position: 1
title: Overview
---

# Storage Adapters

`IStorageAdapter` persists consent state, the event queue, identity, traits, and other local SDK state. You must provide exactly one storage adapter at init.

## Built-in adapters

| Adapter | Package | Platform |
|---------|---------|----------|
| `LocalStorageAdapter` | `sunglasses-storage-localstorage` | Web |
| `AsyncStorageAdapter` | `sunglasses-storage-async-storage` | React Native / Expo |

## What gets stored

- Consent status and history
- Event queue (pending flush)
- `anonymousId`, `distinctId`, traits
- Event counters (if enabled)
- Local archive (if enabled)

All keys are prefixed with `sg:` internally.

## Interface

```ts
interface IStorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  flush?(): Promise<void>; // Optional — HTTP-backed stores only
}
```

All methods must be async and must not throw to the caller.

## Custom storage

See [Custom storage](/storage/custom-storage) to use SecureStore, IndexedDB, or any key-value backend.
