# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial monorepo scaffold with Turborepo + pnpm workspaces
- `@sunglasses/core` — platform-agnostic event engine with consent management, identity management, PII sanitization, event queue, and middleware pipeline
- `@sunglasses/react` — React web provider (`SunglassesProvider`), `useSunglasses` hook, and History API screen tracking
- `@sunglasses/react-native` — React Native / Expo provider, `useSunglasses` hook, Expo Router screen tracking (`useExpoRouterScreenTracking`), and React Navigation screen tracking (`useNavigationScreenTracking`)
- `@sunglasses/storage-localstorage` — localStorage persistence adapter for web
- `@sunglasses/storage-async-storage` — AsyncStorage persistence adapter for React Native
- `@sunglasses/storage-http` — Batched HTTP push output adapter with exponential backoff retry
- `@sunglasses/adapter-starfish` — Drakkar-Software/Starfish document-sync output adapter with optimistic locking conflict resolution
- `@sunglasses/tsconfig` — Shared TypeScript configurations (base, react, react-native)
- `apps/example-web` — Vite + React demo application
- `apps/example-rn` — Expo Router demo application
- Privacy-first defaults: opt-out by default, built-in PII sanitization (email, phone, IPv4, credit card), anonymous UUID identity

[unreleased]: https://github.com/herklos/sunglasses/compare/HEAD...HEAD
