import { useEffect, useRef } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@sunglasses/core';

// Module-level guard: track whether history methods are currently patched.
// Prevents stacking multiple patches if the hook is accidentally mounted more
// than once at the same time (e.g. two components both calling useScreenTracking).
let historyPatched = false;

/**
 * Web screen tracking via the History API.
 *
 * Monkey-patches history.pushState and history.replaceState, and listens to
 * the popstate event. Fires client.screen() on every navigation.
 *
 * Must be called inside a component that has access to the SunGlasses client,
 * typically inside SunglassesProvider. Only one instance of this hook should
 * be active at a time — mounting it in multiple components simultaneously will
 * result in the second instance being a no-op until the first unmounts.
 */
export function useScreenTracking(
  client: ISunglassesClient,
  options: ScreenTrackingOptions = {}
): void {
  const { useHistoryApi = true, screenNameMapper } = options;
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    if (!useHistoryApi || typeof window === 'undefined') return;

    // Bail out if another instance already owns the patch
    if (historyPatched) {
      console.warn(
        '[SunGlasses] useScreenTracking: history is already patched by another instance — this instance will not track.'
      );
      return;
    }

    historyPatched = true;

    const resolveName = (path: string): string =>
      screenNameMapper ? screenNameMapper(path) : path;

    const handleRouteChange = (path: string): void => {
      clientRef.current.screen(resolveName(path), { $url: path });
    };

    // Track initial page view
    handleRouteChange(window.location.pathname);

    // Patch history.pushState
    const originalPush = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPush(...args);
      handleRouteChange(window.location.pathname);
    };

    // Patch history.replaceState
    const originalReplace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      originalReplace(...args);
      handleRouteChange(window.location.pathname);
    };

    // Listen for back/forward navigation
    const onPopState = (): void => handleRouteChange(window.location.pathname);
    window.addEventListener('popstate', onPopState);

    return () => {
      // Restore originals
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener('popstate', onPopState);
      historyPatched = false;
    };
  }, [useHistoryApi, screenNameMapper]);
}
