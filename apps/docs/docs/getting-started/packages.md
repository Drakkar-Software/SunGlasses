---
sidebar_position: 2
title: Packages
---

# Packages

SunGlasses is distributed as a TypeScript monorepo. Install only the packages you need for your platform and output destination.

## Package matrix

| Package | Platform | Description |
|---------|----------|-------------|
| `@drakkar.software/sunglasses-core` | Any | Platform-agnostic event engine + all interfaces |
| `@drakkar.software/sunglasses-react` | Web | React context provider + hooks |
| `@drakkar.software/sunglasses-react-native` | RN / Expo | React Native provider + screen tracking hooks |
| `@drakkar.software/sunglasses-storage-localstorage` | Web | localStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-async-storage` | React Native | AsyncStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-http` | Any | Batched HTTP push output adapter |
| `@drakkar.software/sunglasses-adapter-starfish` | Any | Push events to a Starfish events collection (Parquet server-side) |

## Common install recipes

### Web — local persistence + HTTP push

```bash
pnpm add @drakkar.software/sunglasses-core \
  @drakkar.software/sunglasses-react \
  @drakkar.software/sunglasses-storage-localstorage \
  @drakkar.software/sunglasses-storage-http
```

### React Native / Expo — local persistence + HTTP push

```bash
pnpm add @drakkar.software/sunglasses-core \
  @drakkar.software/sunglasses-react-native \
  @drakkar.software/sunglasses-storage-async-storage \
  @drakkar.software/sunglasses-storage-http \
  @react-native-async-storage/async-storage \
  react-native-get-random-values
```

### Starfish output

```bash
pnpm add @drakkar.software/sunglasses-core \
  @drakkar.software/sunglasses-adapter-starfish
```

You also need `@drakkar.software/starfish-client` in your app to construct the push client. See [Starfish adapter](/adapters/starfish).

### Development only (console logging)

No extra packages — use an inline adapter. See [Development adapter](/advanced/development-adapter).

## Dependency graph

```
@drakkar.software/sunglasses-core (no runtime deps)
  ↑
  ├── sunglasses-react
  ├── sunglasses-react-native
  ├── sunglasses-storage-localstorage
  ├── sunglasses-storage-async-storage
  ├── sunglasses-storage-http
  └── sunglasses-adapter-starfish
```

All framework and adapter packages depend on `sunglasses-core`. You always need `sunglasses-core` plus one storage adapter and at least one output adapter (or an inline dev adapter).
