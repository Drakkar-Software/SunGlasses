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
  includeStack: false,      // include $error_stack — default false (privacy)
  maxStackFrames: 5,
  maxMessageLength: 200,    // truncate messages — they can contain PII
  ignorePatterns: [/ResizeObserver/],
  properties: { screen: 'Checkout' },
  beforeCapture: (props) => ({ ...props, app_version: '1.2.0' }), // transform or drop (null)
});
```

## Error boundary (render-phase errors)

`SunglassesErrorBoundary` catches render-phase errors with `$error_handled: true`:

```tsx
import { SunglassesProvider, SunglassesErrorBoundary } from '@drakkar.software/sunglasses-react';

<SunglassesProvider client={client}>
  <SunglassesErrorBoundary fallback={<ErrorPage />} config={{ includeStack: true }}>
    <App />
  </SunglassesErrorBoundary>
</SunglassesProvider>
```

## Global error autocapture (opt-in)

```tsx
<SunglassesProvider client={client} autoCaptureErrors>
  <App />
</SunglassesProvider>

// or with options
<SunglassesProvider client={client} autoCaptureErrors={{ includeStack: true, ignorePatterns: [/Network request failed/] }}>
  <App />
</SunglassesProvider>
```

On web: listens to `window` `'error'` and `'unhandledrejection'`. On RN: chains `ErrorUtils` (previous handler preserved).

:::warning
Error boundaries do **not** catch errors in event handlers or async code — use `captureException` there.
:::

## Console capture (opt-in)

```tsx
<SunglassesProvider client={client} autoCaptureErrors={{ console: true }}>
  <App />
</SunglassesProvider>
```

Console capture is **noisy** — React logs render errors and warnings through `console.error`. Use `ignorePatterns` to filter.

You can also patch directly:

```ts
import { patchConsole } from '@drakkar.software/sunglasses-react';
const unpatch = patchConsole(client, { levels: ['error', 'warn'] });
// ... later: unpatch();
```

## Full coverage pattern

Combine all three:

1. **Error boundary** — render errors (`$error_handled: true`)
2. **`autoCaptureErrors`** — global/unhandled errors (`$error_handled: false`)
3. **`captureException`** — try/catch in event handlers and async code
