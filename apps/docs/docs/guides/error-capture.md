---
sidebar_position: 3
title: Error Capture
---

# Error Capture

The `react` and `react-native` packages ship error capture out of the box — no third-party bridge needed. Everything emits `$error` events through the consent-gated `capture()` pipeline and runs through `PiiSanitizer` automatically.

## Manual capture (`captureException`)

`captureException` lives in core and is re-exported from both framework packages:

```ts
import { captureException } from '@drakkar.software/sunglasses-react'; // or -react-native

try {
  doRiskyThing();
} catch (err) {
  captureException(client, err); // $error_handled: true
}
```

### Options

```ts
captureException(client, err, {
  handled: true,            // false for unhandled errors — default true
  level: 'error',           // Sentry-compatible severity
  includeStack: true,       // include $error_stack — on by default
  maxStackFrames: 5,        // number of frames to include
  maxMessageLength: 200,    // truncate messages — they can contain PII
  ignorePatterns: [/ResizeObserver/],
  properties: { screen: 'Checkout' },
  beforeCapture: (props) => ({ ...props, app_version: '1.2.0' }), // transform or drop (null)
});
```

### What gets captured automatically

Beyond `message` and `type`, `captureException` extracts:

| Field | What it captures |
|---|---|
| `$error_stack` | Parsed stack frames (V8 and Hermes formats) |
| `$error_cause` | `error.cause` chain — serialized as `"Name: msg\ncaused by: …"` |
| `$error_extra` | Custom scalar properties on the Error (`code`, `statusCode`, etc.) |
| `$error_source` | Origin tag set by the capture path (see below) |
| `$error_fatal` | React Native `isFatal` flag from `ErrorUtils` |
| `$error_component_stack` | React component stack from error boundaries |
| `$error_filename/line/column` | Source location from web `ErrorEvent` |

See [Event Shape → `$error` properties](/reference/event-shape#error-event-properties) for the full type.

## Error boundary (render-phase errors)

`SunglassesErrorBoundary` catches render-phase errors with `$error_handled: true` and automatically captures the React component stack (`$error_component_stack`) from `errorInfo`:

```tsx
import { SunglassesProvider, SunglassesErrorBoundary } from '@drakkar.software/sunglasses-react';

<SunglassesProvider client={client}>
  <SunglassesErrorBoundary fallback={<ErrorPage />}>
    <App />
  </SunglassesErrorBoundary>
</SunglassesProvider>
```

Captured event will have `$error_source: 'boundary'` and `$error_component_stack` showing the React tree at the time of the crash.

## Global error autocapture (opt-in)

```tsx
<SunglassesProvider client={client} autoCaptureErrors>
  <App />
</SunglassesProvider>
```

On web: listens to `window 'error'` (sets `$error_source: 'global'` + filename/line/column) and `'unhandledrejection'` (`$error_source: 'rejection'`). On RN: chains `ErrorUtils` (`$error_source: 'global'`, `$error_fatal: isFatal`).

To disable the stack or restrict patterns:

```tsx
<SunglassesProvider
  client={client}
  autoCaptureErrors={{ includeStack: false, ignorePatterns: [/Network request failed/] }}
>
```

:::warning
Error boundaries do **not** catch errors in event handlers or async code — use `captureException` there.
:::

## Console capture (opt-in)

```tsx
<SunglassesProvider client={client} autoCaptureErrors={{ console: true }}>
  <App />
</SunglassesProvider>
```

Console-captured events carry `$error_source: 'console'`. Console capture is **noisy** — React logs render errors and warnings through `console.error`. Use `ignorePatterns` to filter.

You can also patch directly:

```ts
import { patchConsole } from '@drakkar.software/sunglasses-react';
const unpatch = patchConsole(client, { levels: ['error', 'warn'] });
// ... later: unpatch();
```

## Full coverage pattern

Combine all three:

1. **Error boundary** — render errors (`$error_handled: true`, `$error_source: 'boundary'`, with component stack)
2. **`autoCaptureErrors`** — global/unhandled errors (`$error_handled: false`, `$error_source: 'global'` / `'rejection'`)
3. **`captureException`** — try/catch in event handlers and async code

## Privacy and stacks

Stack traces are **on by default** (`includeStack: true`). They may expose internal file paths and function names. Set `includeStack: false` if your privacy policy prohibits this. PII inside stack frames is masked (not whole-value-dropped) — see [PII Sanitization](/privacy/pii-sanitization).
