import { createContext, useContext } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

export const SunglassesContext = createContext<ISunglassesClient | null>(null);

/**
 * Access the SunGlasses client from React context (React Native).
 * Throws if called outside of a SunglassesProvider.
 */
export function useSunglasses(): ISunglassesClient {
  const client = useContext(SunglassesContext);
  if (client === null) {
    throw new Error(
      '[SunGlasses] useSunglasses() must be called inside a <SunglassesProvider>.'
    );
  }
  return client;
}
