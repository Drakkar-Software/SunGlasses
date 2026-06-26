import React, { useEffect } from 'react';
import type {
  ISunglassesClient,
  ScreenTrackingOptions,
  CaptureExceptionOptions,
} from '@drakkar.software/sunglasses-core';
import { captureException } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';
import { useScreenTracking } from './useScreenTracking.js';

export interface SunglassesProviderProps {
  /** An initialized ISunglassesClient (from SunglassesCore.create()). */
  client: ISunglassesClient;
  /** Optional screen tracking configuration. */
  screenTracking?: ScreenTrackingOptions;
  /**
   * Automatically capture unhandled global errors as `$error` events
   * (`$error_handled: false`). Listens to `window` `'error'` and
   * `'unhandledrejection'`. Pass `true` for defaults, or an options object to
   * configure truncation / stack inclusion. Default: off.
   */
  autoCaptureErrors?: boolean | CaptureExceptionOptions;
  children: React.ReactNode;
}

/**
 * Provides a SunGlasses client to the React component tree.
 *
 * Place this at the root of your application, wrapping all components that
 * need access to event tracking.
 *
 * @example
 * ```tsx
 * const client = await SunglassesCore.create({ ... });
 *
 * function App() {
 *   return (
 *     <SunglassesProvider client={client} screenTracking={{ useHistoryApi: true }}>
 *       <Router />
 *     </SunglassesProvider>
 *   );
 * }
 * ```
 */
export function SunglassesProvider({
  client,
  screenTracking,
  autoCaptureErrors,
  children,
}: SunglassesProviderProps): React.ReactElement {
  // Auto-shutdown on unmount
  useEffect(() => {
    return () => {
      client.shutdown().catch(() => {});
    };
  }, [client]);

  // Optional: auto-capture unhandled global errors and promise rejections.
  useEffect(() => {
    if (!autoCaptureErrors) return;
    if (typeof window === 'undefined') return;
    const options: CaptureExceptionOptions =
      typeof autoCaptureErrors === 'object' ? autoCaptureErrors : {};

    const onError = (event: ErrorEvent): void => {
      captureException(client, event.error ?? event.message, { handled: false, ...options });
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      captureException(client, event.reason, { handled: false, ...options });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [client, autoCaptureErrors]);

  // Flush queued events when the page is hidden (tab switch, browser close).
  // This is more reliable than relying on unmount, which rarely fires in SPAs.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        client.flush().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [client]);

  // Optional automatic screen tracking
  useScreenTracking(client, screenTracking ?? { useHistoryApi: false });

  return (
    <SunglassesContext.Provider value={client}>
      {children}
    </SunglassesContext.Provider>
  );
}
