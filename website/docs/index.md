---
slug: /
sidebar_position: 0
title: Home
---

# SunGlasses

Privacy-first event tracking for Expo / React Native and web apps.

Track screen views, button taps, and custom events — with built-in PII sanitization, opt-out-by-default consent management, and pluggable storage backends.

## Why SunGlasses?

- **Privacy by default** — users start opted out; no data is collected until they explicitly consent.
- **PII sanitization** — emails, phone numbers, and credit card patterns are stripped automatically before any event is queued or sent.
- **Anonymous identities** — a stable UUID is generated locally; it never contains user data.
- **Pluggable storage** — persist locally (localStorage / AsyncStorage) and/or push to an HTTP server, or sync to Starfish.
- **Cross-platform** — one SDK surface for React (web) and React Native / Expo.
- **Middleware pipeline** — drop or transform events before they leave the device.

## Package overview

```
@drakkar.software/sunglasses-core (no deps)
  ↑
  ├── sunglasses-react
  ├── sunglasses-react-native
  ├── sunglasses-storage-localstorage
  ├── sunglasses-storage-async-storage
  ├── sunglasses-storage-http
  └── sunglasses-adapter-starfish
```

## Quick links

| I want to… | Start here |
|------------|------------|
| Add SunGlasses to a React web app | [Web setup](/getting-started/web-setup) |
| Add SunGlasses to Expo / React Native | [React Native setup](/getting-started/react-native-setup) |
| Understand consent and privacy | [Consent](/privacy/consent) |
| Capture errors automatically | [Error capture](/guides/error-capture) |
| Self-host event ingestion | [Ingest server](/backend/ingest-server) |
| Build a custom adapter | [Custom adapter](/adapters/custom-adapter) |
| Contribute to the SDK | [Dev setup](/contributing/dev-setup) |

## Install

```bash
pnpm add @drakkar.software/sunglasses-core @drakkar.software/sunglasses-react @drakkar.software/sunglasses-storage-localstorage
```

See [Packages](/getting-started/packages) for the full install matrix per platform.
