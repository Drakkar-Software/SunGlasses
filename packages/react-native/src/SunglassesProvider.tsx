import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import type { ISunglassesClient } from '@sunglasses/core';
import { SunglassesContext } from './context.js';

export interface SunglassesProviderProps {
  /** An initialized ISunglassesClient (from SunglassesCore.create()). */
  client: ISunglassesClient;
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
  children,
}: SunglassesProviderProps): React.ReactElement {
  // Auto-shutdown on unmount
  useEffect(() => {
    return () => {
      client.shutdown().catch(() => {});
    };
  }, [client]);

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
