import { useEffect } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@drakkar.software/sunglasses-core';

/**
 * Expo Router screen tracking hook.
 *
 * Tracks screen changes by observing the `pathname` from Expo Router.
 * Place this hook inside your root `_layout.tsx`.
 *
 * **Requires**: `expo-router` to be installed in your project.
 *
 * @example
 * ```tsx
 * // app/_layout.tsx
 * import { useExpoRouterScreenTracking } from '@drakkar.software/sunglasses-react-native';
 *
 * export default function RootLayout() {
 *   const client = useSunglasses();
 *   useExpoRouterScreenTracking(client);
 *   return <Stack />;
 * }
 * ```
 */
export function useExpoRouterScreenTracking(
  client: ISunglassesClient,
  options: Pick<ScreenTrackingOptions, 'screenNameMapper'> = {}
): void {
  // Lazy import to avoid hard dependency on expo-router at import time.
  // This keeps the package usable in projects that use React Navigation instead.
  let pathname: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usePathname } = require('expo-router') as { usePathname: () => string };
    // We call the hook unconditionally here — the try/catch is around the require,
    // not the hook call. If expo-router isn't installed this throws at require time,
    // before any hook rules are violated.
    pathname = usePathname();
  } catch {
    // expo-router not installed; this hook is a no-op
    return;
  }

  const { screenNameMapper } = options;
  useEffect(() => {
    if (!pathname) return;
    const name = screenNameMapper ? screenNameMapper(pathname) : pathname;
    client.screen(name, { $path: pathname });
  }, [pathname, screenNameMapper, client]);
}
