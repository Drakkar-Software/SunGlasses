# CLAUDE.md — Developer Guide for SunGlasses

This file provides guidance for contributors and AI-assisted development in this repository.

## Repo Overview

SunGlasses is a privacy-first event tracking library distributed as a TypeScript monorepo.

```
@sunglasses/core               Platform-agnostic event engine (no React/RN deps)
@sunglasses/react              React (web) provider + hooks
@sunglasses/react-native       React Native / Expo provider + hooks
@sunglasses/storage-localstorage  localStorage adapter (web)
@sunglasses/storage-async-storage AsyncStorage adapter (React Native)
@sunglasses/storage-http          Batched HTTP push adapter (output destination)
@sunglasses/adapter-starfish      Starfish document-sync adapter
@sunglasses/tsconfig              Shared TypeScript configs (private)
```

Package dependency graph (runtime, not devDeps):
```
@sunglasses/core  (no deps)
        ↑
├── @sunglasses/react
├── @sunglasses/react-native
├── @sunglasses/storage-localstorage
├── @sunglasses/storage-async-storage
├── @sunglasses/storage-http
└── @sunglasses/adapter-starfish
```

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Expo CLI (for RN example app): `npm install -g @expo/cli`

## Common Commands

```bash
# Install all dependencies
pnpm install

# Build all packages (respects dependency order via Turborepo)
pnpm build

# Watch mode (all packages in parallel)
pnpm dev

# TypeScript type checking
pnpm typecheck

# Run all unit tests
pnpm test

# Lint all packages
pnpm lint

# Clean all build artifacts
pnpm clean

# Run a command in a specific package
pnpm --filter @sunglasses/core build
pnpm --filter example-web dev

# Add a dependency to a specific package
pnpm --filter @sunglasses/core add some-package
pnpm --filter @sunglasses/core add -D some-dev-package
```

## Adding a New Package

1. Create the directory: `mkdir packages/my-package`
2. Copy the `packages/core/package.json` pattern (update `name`, `description`, deps)
3. Create `packages/my-package/tsconfig.json` extending `@sunglasses/tsconfig/base.json`
4. Create `packages/my-package/src/index.ts`
5. Add `"@sunglasses/my-package": "workspace:*"` to consumers that need it
6. Run `pnpm install` to link the workspace

## Making a Release

```bash
# 1. Document your changes
pnpm changeset           # prompts which packages changed and severity (major/minor/patch)

# 2. Apply version bumps and generate CHANGELOG entries
pnpm version

# 3. Build and publish to npm
pnpm release
```

## Privacy Rules — Critical for AI-Assisted Coding

These invariants must never be broken:

1. **PiiSanitizer always runs first.** In `SunglassesCore.ts`, `PiiSanitizer` is unconditionally prepended to the `MiddlewarePipeline`. Never remove or reorder this.

2. **Consent gate is unconditional.** Every public method in `SunglassesCore.ts` calls `this.canCapture()` before any I/O. If opted out, the method returns immediately with zero side effects — no queue writes, no network calls.

3. **Never log `distinctId` or user traits.** The logger may log `anonymousId` (for debugging) but must never log `distinctId`, `traits`, or raw user identifiers, even in debug mode.

4. **All consent reads are async.** `ConsentManager.initialize()` reads from storage, which may be async on all platforms. Never assume consent state is available synchronously before `initialize()` completes.

5. **`IAnalyticsAdapter.send()` must not mutate the input batch.** Adapters receive a reference to the queue's internal slice; mutating it corrupts the queue.

6. **`IMiddleware.process()` must never throw.** The `MiddlewarePipeline` catches errors and treats them as drops, but throwing is a code smell. Use `return null` to drop; `return next(event)` to continue.

7. **`anonymousId` is never derived from PII.** It is always a freshly generated UUID v4. The only way to associate it with a user is through `identify()`.

## Code Style

- All public API methods and interfaces must have JSDoc comments.
- Use `async/await` rather than `.then()` chains for readability.
- Prefer `type` imports (`import type { Foo }`) for interfaces and types.
- File-level barrel exports go in `src/index.ts`.
- Tests live in `src/__tests__/` alongside the code they test.
- Vitest is the test runner; no Jest.

## Architecture Decision Records

Key decisions made during initial design:

- **Why Turborepo over Nx?** Simpler config for our use case; better pnpm integration; no need for Nx's richer plugin ecosystem.
- **Why tsup over tsc?** Single command to produce CJS + ESM + `.d.ts`. TypeScript's `tsc` requires multiple runs for dual-module output.
- **Why no TypeScript Project References?** They conflict with Turborepo's own dependency graph caching. `"dependsOn": ["^build"]` in `turbo.json` is sufficient.
- **Why is consent stored via IStorageAdapter?** Keeps storage platform-correct automatically. No need for a separate consent storage mechanism.
- **Why opt-out by default?** Privacy-first design. Users who want opt-in-by-default can set `defaultOptIn: true` in their config.
