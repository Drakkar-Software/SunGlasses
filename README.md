<p align="center">
  <img src="./logo.png" alt="SunGlasses" width="320" />
</p>

# SunGlasses

Privacy-first event tracking for Expo / React Native and web apps.

Track screen views, button taps, and custom events — with built-in PII sanitization, opt-out-by-default consent management, and pluggable storage backends.

**[Read the documentation →](https://drakkar-software.github.io/SunGlasses/)**

## Why SunGlasses?

- **Privacy by default** — users start opted out; no data is collected until they explicitly consent.
- **PII sanitization** — emails, phone numbers, and credit card patterns are stripped automatically before any event is queued or sent.
- **Anonymous identities** — a stable UUID is generated locally; it never contains user data.
- **Pluggable storage** — persist locally (localStorage / AsyncStorage) and/or push to an HTTP server, or sync to Starfish.
- **Cross-platform** — one SDK surface for React (web) and React Native / Expo.
- **Middleware pipeline** — drop or transform events before they leave the device.

## Packages

| Package | Platform | Description |
|---------|----------|-------------|
| `@drakkar.software/sunglasses-core` | Any | Platform-agnostic event engine + all interfaces |
| `@drakkar.software/sunglasses-react` | Web | React context provider + hooks |
| `@drakkar.software/sunglasses-react-native` | RN / Expo | React Native provider + screen tracking hooks |
| `@drakkar.software/sunglasses-storage-localstorage` | Web | localStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-async-storage` | React Native | AsyncStorage persistence adapter |
| `@drakkar.software/sunglasses-storage-http` | Any | Batched HTTP push output adapter |
| `@drakkar.software/sunglasses-adapter-starfish` | Any | Push events to Starfish (Parquet server-side) |

## Quickstart

### Web

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react @drakkar.software/sunglasses-storage-localstorage
```

See [Web setup](https://drakkar-software.github.io/SunGlasses/getting-started/web-setup) for full initialization.

### React Native / Expo

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react-native @drakkar.software/sunglasses-storage-async-storage
pnpm add @react-native-async-storage/async-storage react-native-get-random-values
```

See [React Native setup](https://drakkar-software.github.io/SunGlasses/getting-started/react-native-setup) for Expo Router integration.

## Documentation

Full guides, API reference, and contributor docs live at:

**https://drakkar-software.github.io/SunGlasses/**

| Topic | Link |
|-------|------|
| Getting started | [/getting-started/intro](https://drakkar-software.github.io/SunGlasses/getting-started/intro) |
| Consent & privacy | [/privacy/consent](https://drakkar-software.github.io/SunGlasses/privacy/consent) |
| Error capture | [/guides/error-capture](https://drakkar-software.github.io/SunGlasses/guides/error-capture) |
| Self-hosted ingest | [/backend/ingest-server](https://drakkar-software.github.io/SunGlasses/backend/ingest-server) |
| API reference | [/reference/config](https://drakkar-software.github.io/SunGlasses/reference/config) |

### Local docs development

```bash
pnpm docs:dev    # http://localhost:3000/SunGlasses/
pnpm docs:build
```

## Contributing

See [CLAUDE.md](./CLAUDE.md) and the [contributing docs](https://drakkar-software.github.io/SunGlasses/contributing/dev-setup).

## License

See package licenses on npm.
