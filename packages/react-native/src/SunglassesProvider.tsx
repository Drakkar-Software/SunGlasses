import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import type { ISunglassesClient, AutoCaptureErrorsOptions } from '@drakkar.software/sunglasses-core';
import { captureException, patchConsole } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';

/**
 * React Native's global error handler hook. Provided by the RN runtime as a
 * global; declared here so the SDK can attach a handler without a hard
 * dependency on `@types/react-native`.
 */
type RNErrorHandler = (error: unknown, isFatal?: boolean) => void;
declare const ErrorUtils:
  | {
      getGlobalHandler?: () => RNErrorHandler | undefined;
      setGlobalHandler?: (handler: RNErrorHandler) => void;
    }
  | undefined;

export interface SunglassesProviderProps {
  /** An initialized ISunglassesClient (from SunglassesCore.create()). */
  client: ISunglassesClient;
  /**
   * Automatically capture unhandled errors as `$error` events
   * (`$error_handled: false`).
   *
   * - `true` installs a global `ErrorUtils` handler (the previous handler is
   *   preserved and still invoked).
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
 * Provides a SunGlasses client to the React Native component tree.
 *
 * Place this at the root of your Expo/RN application.
 *
 * For screen tracking, use one of these hooks inside your layout:
 * - `useExpoRouterScreenTracking(client)` — for Expo Router
 * - `useNavigationScreenTracking(client, navigationRef)` — for React Navigation
 *
 * @example
 * ```tsx
 * // App.tsx (React Navigation)
 * const client = await SunglassesCore.create({ ... });
 *
 * function App() {
 *   return (
 *     <SunglassesProvider client={client}>
 *       <NavigationContainer>
 *         <Stack.Navigator />
 *       </NavigationContainer>
 *     </SunglassesProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // app/_layout.tsx (Expo Router)
 * export default function RootLayout() {
 *   const client = useSunglasses();
 *   useExpoRouterScreenTracking(client);
 *   return <Stack />;
 * }
 * ```
 */
export function SunglassesProvider({
  client,
  autoCaptureErrors,
  children,
}: SunglassesProviderProps): React.ReactElement {
  // Auto-shutdown on unmount
  useEffect(() => {
    return () => {
      client.shutdown().catch(() => {});
    };
  }, [client]);

  // Optional: auto-capture unhandled errors (global ErrorUtils + console).
  useEffect(() => {
    if (!autoCaptureErrors) return;
    const options: AutoCaptureErrorsOptions =
      typeof autoCaptureErrors === 'object' ? autoCaptureErrors : {};
    const cleanups: Array<() => void> = [];

    // Global RN ErrorUtils handler (chained to the previous one).
    if (
      options.globalHandlers !== false &&
      typeof ErrorUtils !== 'undefined' &&
      ErrorUtils.setGlobalHandler
    ) {
      const previous = ErrorUtils.getGlobalHandler?.();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        captureException(client, error, { handled: false, ...options });
        previous?.(error, isFatal);
      });
      cleanups.push(() => {
        if (previous) ErrorUtils.setGlobalHandler?.(previous);
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

  // Flush queued events when the app moves to the background.
  // On mobile, apps can be killed at any time after entering the background,
  // so this is the last reliable opportunity to deliver pending events.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        client.flush().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [client]);

  return (
    <SunglassesContext.Provider value={client}>
      {children}
    </SunglassesContext.Provider>
  );
}
