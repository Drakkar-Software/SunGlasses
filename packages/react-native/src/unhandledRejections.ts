import type { ISunglassesClient, CaptureExceptionOptions } from '@drakkar.software/sunglasses-core';
import { captureException, publishGlobalError } from '@drakkar.software/sunglasses-core';
import { rejectionTracking } from './rejectionTracking.js';

interface RejectionGlobal {
  addEventListener?: (type: string, cb: (event: unknown) => void) => void;
  removeEventListener?: (type: string, cb: (event: unknown) => void) => void;
  onunhandledrejection?: ((event: unknown) => void) | null;
}

/** Extract the rejection reason from a DOM-like `unhandledrejection` event. */
function reasonOf(event: unknown): unknown {
  if (event && typeof event === 'object' && 'reason' in event) {
    return (event as { reason: unknown }).reason;
  }
  return event;
}

/**
 * Attach an unhandled promise rejection handler that captures rejections as
 * `$error` events (`$error_handled: false`) and publishes them to the global
 * error bus.
 *
 * Tries React Native's bundled rejection tracker first
 * (`promise/setimmediate/rejection-tracking`, the same mechanism Sentry uses),
 * then falls back to a global `unhandledrejection` listener / `onunhandledrejection`
 * hook for engines that expose one. Never throws.
 *
 * @param client - SunGlasses client instance.
 * @param options - Capture configuration forwarded to `captureException`.
 * @returns A cleanup function that detaches the handler.
 */
export function attachUnhandledRejectionHandler(
  client: ISunglassesClient,
  options: CaptureExceptionOptions = {},
): () => void {
  const onUnhandled = (error: unknown): void => {
    captureException(client, error, { handled: false, ...options });
    publishGlobalError({ error, fatal: false, kind: 'rejection' });
  };

  // Primary: the rejection-tracking module React Native bundles.
  const tracking = rejectionTracking;
  if (tracking) {
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id, error) => onUnhandled(error),
      onHandled: () => {},
    });
    return () => {
      try {
        tracking.disable?.();
      } catch {
        // disabling is best-effort
      }
    };
  }

  // Fallback: a global unhandledrejection hook (Hermes / web-like globals).
  const g = globalThis as unknown as RejectionGlobal;

  if (typeof g.addEventListener === 'function' && typeof g.removeEventListener === 'function') {
    const listener = (event: unknown): void => onUnhandled(reasonOf(event));
    g.addEventListener('unhandledrejection', listener);
    return () => g.removeEventListener?.('unhandledrejection', listener);
  }

  if ('onunhandledrejection' in g) {
    const previous = g.onunhandledrejection ?? null;
    g.onunhandledrejection = (event: unknown): void => {
      onUnhandled(reasonOf(event));
      previous?.(event);
    };
    return () => {
      g.onunhandledrejection = previous;
    };
  }

  // Nothing to hook into on this runtime.
  return () => {};
}
