# SunGlasses Landing Page

Marketing landing page for the SunGlasses privacy-first event-tracking library.

## Stack

React 19 + Vite 8 + Tailwind CSS v4 (CSS-first, no config file). Self-hosted fonts via
`@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` — no CDN calls.

## Dev

```bash
# From the repo root
pnpm install
pnpm --filter landing dev
```

Opens at `http://localhost:5173` (or next available port).

## Build & preview

```bash
pnpm --filter landing build    # runs tsc then vite build → dist/
pnpm --filter landing preview  # preview the production build locally
```

## Design system

- **Art direction**: "Through the Lens" — frosted glass surfaces over a deep ink base,
  cyan lens primary, warm amber glare accent. Default theme: dark ("shades on").
- **Tokens**: CSS-first via `@theme {}` in `src/index.css`. Dark overrides in `.dark {}`.
  Same pattern as `apps/analytics-dashboard`.
- **Theme persistence**: `localStorage['sg-landing-theme']`, falls back to `prefers-color-scheme`.
  Applied before first paint by the inline script in `index.html`.

## Status

`private: true` — not published to npm. Does not affect package releases.
