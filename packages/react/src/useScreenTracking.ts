import { useEffect, useRef } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@drakkar.software/sunglasses-core';

// Module-level guard: track whether history methods are currently patched.
// Prevents stacking multiple patches if the hook is accidentally mounted more
// than once at the same time (e.g. two components both calling useScreenTracking).
let historyPatched = false;

// Track the previous path for SPA referrer attribution.
// On the initial page view this is null, so document.referrer (external site) is used.
// On subsequent SPA navigations, this holds the path navigated away from.
let previousPath: string | null = null;

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

  // Keep the mapper in a ref so patched history methods always call the latest
  // version without needing to re-run the effect when the function reference
  // changes (which would cause unnecessary unpatch → repatch cycles).
  const mapperRef = useRef(screenNameMapper);
  mapperRef.current = screenNameMapper;

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

    const handleRouteChange = (path: string): void => {
      const name = mapperRef.current ? mapperRef.current(path) : path;
      const props: Record<string, unknown> = {
        $path: path,
        $url: window.location.href,
      };
      if (document.title) props.$title = document.title;
      // Use tracked previous path for SPA navigation; fall back to
      // document.referrer only on the initial page view (previousPath === null).
      if (previousPath !== null) {
        props.$referrer = previousPath;
      } else if (document.referrer) {
        props.$referrer = document.referrer;
      }
      previousPath = path;
      clientRef.current.screen(name, props);
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
      previousPath = null;
    };
  }, [useHistoryApi]); // screenNameMapper is accessed via ref — no dep needed
}
