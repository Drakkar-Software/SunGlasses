import React, { useEffect } from 'react';
import type {
  ISunglassesClient,
  ScreenTrackingOptions,
  AutoCaptureErrorsOptions,
} from '@drakkar.software/sunglasses-core';
import { captureException, patchConsole } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';
import { useScreenTracking } from './useScreenTracking.js';

export interface SunglassesProviderProps {
  /** An initialized ISunglassesClient (from SunglassesCore.create()). */
  client: ISunglassesClient;
  /** Optional screen tracking configuration. */
  screenTracking?: ScreenTrackingOptions;
  /**
   * Automatically capture unhandled errors as `$error` events
   * (`$error_handled: false`).
   *
   * - `true` installs the global handlers for `window` `'error'` and
   *   `'unhandledrejection'`.
   * - An options object additionally lets you toggle `globalHandlers` and opt
   *   into `console` capture (`console.error` / `console.warn`), plus configure
   *   truncation / stack inclusion / ignore patterns.
   *
   * Default: off.
   */
  autoCaptureErrors?: boolean | AutoCaptureErrorsOptions;
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

  // Optional: auto-capture unhandled errors (global handlers + console).
  useEffect(() => {
    if (!autoCaptureErrors) return;
    const options: AutoCaptureErrorsOptions =
      typeof autoCaptureErrors === 'object' ? autoCaptureErrors : {};
    const cleanups: Array<() => void> = [];

    // Global window error / unhandledrejection handlers.
    if (options.globalHandlers !== false && typeof window !== 'undefined') {
      const onError = (event: ErrorEvent): void => {
        captureException(client, event.error ?? event.message, { handled: false, ...options });
      };
      const onRejection = (event: PromiseRejectionEvent): void => {
        captureException(client, event.reason, { handled: false, ...options });
      };
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      cleanups.push(() => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      });
    }

    // Optional console capture.
    if (options.console) {
      const consoleOptions = typeof options.console === 'object' ? options.console : {};
      cleanups.push(patchConsole(client, consoleOptions));
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
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
