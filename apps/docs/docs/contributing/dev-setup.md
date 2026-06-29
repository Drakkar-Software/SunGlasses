---
sidebar_position: 1
title: Dev Setup
---

# Developer Setup

SunGlasses is a TypeScript monorepo using pnpm workspaces and Turborepo.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Expo CLI (for RN example): `npm install -g @expo/cli`

## Common commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (dependency order)
pnpm dev              # Watch mode (all packages)
pnpm typecheck        # TypeScript checking
pnpm test             # Vitest unit tests
pnpm lint             # ESLint
pnpm clean            # Remove build artifacts
```

## Run a specific package

```bash
pnpm --filter @drakkar.software/sunglasses-core build
pnpm --filter example-web dev
pnpm --filter example-rn start
```

## Documentation site

The `website/` directory is a standalone Docusaurus project (not a pnpm workspace package). Install its dependencies once before running docs commands:

```bash
cd website && pnpm install --ignore-workspace
cd ..                 # back to repo root
pnpm docs:dev         # Docusaurus dev server
pnpm docs:build       # Production build
```

## Adding a new package

1. `mkdir packages/my-package`
2. Copy `packages/core/package.json` pattern (update `name`, `description`, deps)
3. Create `tsconfig.json` extending `@drakkar.software/sunglasses-tsconfig/base.json`
4. Create `src/index.ts`
5. Add workspace dependency to consumers
6. `pnpm install`

## Release

```bash
pnpm changeset        # Document changes + severity
pnpm version          # Bump versions + CHANGELOG
pnpm release          # Build + publish to npm
```

## Architecture decisions

- **Turborepo over Nx** — simpler config, better pnpm integration
- **tsup over tsc** — single command for CJS + ESM + `.d.ts`
- **Consent via IStorageAdapter** — platform-correct persistence automatically
- **Opt-out by default** — privacy-first; use `defaultOptIn: true` if needed
