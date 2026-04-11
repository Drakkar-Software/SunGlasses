import { useEffect, useRef } from 'react';
import type { ISunglassesClient, ScreenTrackingOptions } from '@sunglasses/core';

interface NavigationState {
  index: number;
  routes: Array<{
    name: string;
    state?: NavigationState;
  }>;
}

interface NavigationContainerRef {
  addListener(event: string, callback: () => void): { remove: () => void };
  getRootState(): NavigationState | undefined;
  isReady(): boolean;
}

/**
 * Recursively find the name of the currently focused route.
 */
function getActiveRouteName(state: NavigationState | undefined): string {
  if (!state) return '';
  const route = state.routes[state.index];
  if (!route) return '';
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

/**
 * React Navigation screen tracking hook.
 *
 * Pass the `ref` from `<NavigationContainer ref={navigationRef}>`.
 * Tracks screen changes via the `state` listener.
 *
 * @example
 * ```tsx
 * const navigationRef = useRef(null);
 *
 * <NavigationContainer ref={navigationRef}>
 *   ...
 * </NavigationContainer>
 *
 * // In a component:
 * useNavigationScreenTracking(client, navigationRef);
 * ```
 */
export function useNavigationScreenTracking(
  client: ISunglassesClient,
  navigationRef: React.RefObject<NavigationContainerRef | null>,
  options: Pick<ScreenTrackingOptions, 'screenNameMapper'> = {}
): void {
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const ref = navigationRef.current;
    if (!ref) return;

    const handleStateChange = (): void => {
      const state = ref.getRootState();
      const routeName = getActiveRouteName(state);
      if (!routeName) return;
      const name = options.screenNameMapper ? options.screenNameMapper(routeName) : routeName;
      clientRef.current.screen(name, { $route: routeName });
    };

    // Listen to navigation state changes to track the active screen
    const stateListener = ref.addListener('state', handleStateChange);

    return () => {
      stateListener.remove();
    };
  }, [navigationRef, options.screenNameMapper]);
}
