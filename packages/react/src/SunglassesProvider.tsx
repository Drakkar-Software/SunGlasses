import React, { useEffect } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';
import { useScreenTracking } from './useScreenTracking.js';

export interface SunglassesProviderProps {
  /** An initialized ISunglassesClient (from SunglassesCore.create()). */
  client: ISunglassesClient;
  /** Optional screen tracking configuration. */
  screenTracking?: ScreenTrackingOptions;
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
  children,
}: SunglassesProviderProps): React.ReactElement {
  // Auto-shutdown on unmount
  useEffect(() => {
    return () => {
      client.shutdown().catch(() => {});
    };
  }, [client]);

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
