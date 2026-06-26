import { useEffect } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@drakkar.software/sunglasses-core';
import { usePathname as _resolvedUsePathname } from './expoRouterCompat.js';

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

function _noopPathname(): string { return ''; }

// Resolved once at module load via expoRouterCompat (which already uses a module-level
// try/catch invisible to React Compiler's hook analysis). Calling _impl() inside the
// hook always calls the same function across every render — stable hook call count.
const _impl = _resolvedUsePathname ?? _noopPathname;

export function useExpoRouterScreenTracking(
  client: ISunglassesClient,
  options: Pick<ScreenTrackingOptions, 'screenNameMapper'> = {}
): void {
  const pathname = _impl();
  const { screenNameMapper } = options;
  useEffect(() => {
    if (!pathname) return;
    const name = screenNameMapper ? screenNameMapper(pathname) : pathname;
    client.screen(name, { $path: pathname });
  }, [pathname, screenNameMapper, client]);
}
