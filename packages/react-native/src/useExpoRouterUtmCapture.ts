import { useEffect } from 'react';
import type { ISunglassesClient } from '@sunglasses/core';
import { useGlobalSearchParams } from './expoRouterCompat.js';

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

/**
 * Expo Router UTM capture hook.
 *
 * Reads UTM attribution params from the current Expo Router URL via
 * `useGlobalSearchParams()` and registers any found params as super properties
 * on the client. Re-runs whenever the URL params change, so new campaign links
 * opened while the app is running are also captured.
 *
 * Uses `useGlobalSearchParams()` rather than `useLocalSearchParams()` so the
 * hook works correctly from the root `_layout.tsx` — it sees params from any
 * nested route, not just the current layout segment.
 *
 * **Requires**: `expo-router` to be installed in your project.
 *
 * @example
 * ```tsx
 * // app/_layout.tsx
 * import { useExpoRouterUtmCapture } from '@sunglasses/react-native';
 *
 * export default function RootLayout() {
 *   const client = useSunglasses();
 *   useExpoRouterUtmCapture(client);
 *   return <Stack />;
 * }
 * ```
 */
export function useExpoRouterUtmCapture(client: ISunglassesClient): void {
  // useGlobalSearchParams is null when expo-router is not installed.
  // The early return keeps this component's hook count consistent — either
  // useGlobalSearchParams() + useEffect() are always called, or neither is.
  if (!useGlobalSearchParams) return;

  // Hook call — safe here because useGlobalSearchParams is guaranteed non-null
  // and its availability does not change during the component's lifetime.
  const params = useGlobalSearchParams<Record<string, string | string[]>>();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const utmParams: Record<string, string> = {};
    for (const key of UTM_PARAMS) {
      const value = params[key];
      if (typeof value === 'string' && value) {
        utmParams[key] = value;
      } else if (Array.isArray(value) && value[0]) {
        // Expo Router returns arrays when a param appears multiple times; take first
        utmParams[key] = value[0];
      }
    }
    if (Object.keys(utmParams).length > 0) {
      client.register(utmParams);
    }
  }, [params, client]);
}
