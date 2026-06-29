---
sidebar_position: 1
title: Introduction
---

# Introduction

SunGlasses is a privacy-first analytics SDK for web and mobile apps. It gives you event tracking (`capture`, `screen`, `identify`) with consent gating, automatic PII redaction, and pluggable output destinations — without shipping user data to third parties unless you explicitly wire an adapter.

## Core concepts

1. **Consent gate** — Every public method checks consent before any I/O. Opted-out users produce zero side effects: no queue writes, no storage writes, no network calls.
2. **Middleware pipeline** — `PiiSanitizer` always runs first, then your custom middleware. Events can be transformed or dropped before they reach adapters.
3. **Local queue** — Events are persisted via `IStorageAdapter` and flushed to `IAnalyticsAdapter` instances on a timer or when you call `flush()`.
4. **Anonymous identity** — A UUID v4 `anonymousId` is generated on first run and stored locally. It is never derived from PII.

## What you'll need

- **Web:** React 18+, a bundler (Vite, Next.js, etc.)
- **React Native / Expo:** Expo SDK 50+ or bare RN with AsyncStorage
- **Node.js 20+** for local development of the monorepo

## Next steps

- [Choose your packages](/getting-started/packages)
- [Web setup](/getting-started/web-setup)
- [React Native setup](/getting-started/react-native-setup)
- [Consent and privacy](/privacy/consent)
