import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import type { ISunglassesClient, CaptureExceptionOptions } from '@drakkar.software/sunglasses-core';
import { captureException } from '@drakkar.software/sunglasses-core';
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
   * Automatically capture unhandled JS errors as `$error` events
   * (`$error_handled: false`) via React Native's global `ErrorUtils` handler.
   * Pass `true` for defaults, or an options object to configure truncation /
   * stack inclusion. The previous global handler is preserved and still
   * invoked. Default: off.
   */
  autoCaptureErrors?: boolean | CaptureExceptionOptions;
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

  // Optional: auto-capture unhandled JS errors via RN's global ErrorUtils.
  useEffect(() => {
    if (!autoCaptureErrors) return;
    if (typeof ErrorUtils === 'undefined' || !ErrorUtils.setGlobalHandler) return;
    const options: CaptureExceptionOptions =
      typeof autoCaptureErrors === 'object' ? autoCaptureErrors : {};

    const previous = ErrorUtils.getGlobalHandler?.();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      captureException(client, error, { handled: false, ...options });
      previous?.(error, isFatal);
    });
    return () => {
      // Restore the previous handler if it is still ours that is installed.
      if (previous) ErrorUtils.setGlobalHandler?.(previous);
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
