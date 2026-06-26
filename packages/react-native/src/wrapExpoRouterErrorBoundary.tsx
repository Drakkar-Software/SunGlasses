import React, { useContext, useEffect, useRef } from 'react';
import type { ISunglassesClient, CaptureExceptionOptions } from '@drakkar.software/sunglasses-core';
import { captureException } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';
import { usePathname } from './expoRouterCompat.js';

/**
 * Props Expo Router passes to a route-level `ErrorBoundary` export.
 */
export interface ExpoRouterErrorBoundaryProps {
  /** The render error caught by Expo Router for this route. */
  error: Error;
  /** Re-mounts the route's components to retry rendering. */
  retry: () => Promise<void>;
}

export interface WrapExpoRouterErrorBoundaryOptions {
  /**
   * SunGlasses client. Optional — defaults to the client provided by the
   * nearest `<SunglassesProvider>`.
   */
  client?: ISunglassesClient;
  /** Error capture configuration forwarded to `captureException`. */
  config?: CaptureExceptionOptions;
}

/**
 * Read the current Expo Router pathname. `usePathname` is `null` when
 * expo-router is not installed; its availability never changes during the
 * component's lifetime, so the hook call order stays stable.
 */
function useExpoRouterPathname(): string | undefined {
  if (!usePathname) return undefined;
  return usePathname();
}

/**
 * Wrap an Expo Router route-level `ErrorBoundary` so render errors that reach it
 * are also captured as SunGlasses `$error` events (`$error_handled: true`) with
 * route context (`$route_path`, `$route_name`). The original boundary still
 * renders unchanged.
 *
 * The client is read from the nearest `<SunglassesProvider>` by default; pass
 * `options.client` to override. Each distinct error is captured once.
 *
 * @example
 * ```tsx
 * // app/_layout.tsx
 * import { ErrorBoundary as ExpoErrorBoundary } from 'expo-router';
 * import { wrapExpoRouterErrorBoundary } from '@drakkar.software/sunglasses-react-native';
 *
 * export const ErrorBoundary = wrapExpoRouterErrorBoundary(ExpoErrorBoundary);
 * ```
 */
export function wrapExpoRouterErrorBoundary<P extends ExpoRouterErrorBoundaryProps>(
  Boundary: React.ComponentType<P>,
  options: WrapExpoRouterErrorBoundaryOptions = {},
): React.ComponentType<P> {
  function WrappedExpoRouterErrorBoundary(props: P): React.ReactElement {
    const contextClient = useContext(SunglassesContext);
    const client = options.client ?? contextClient;
    const pathname = useExpoRouterPathname();
    const lastCaptured = useRef<unknown>(null);
    const { error } = props;

    useEffect(() => {
      if (!client || !error || lastCaptured.current === error) return;
      lastCaptured.current = error;

      const routeProps: Record<string, unknown> = {};
      if (pathname) {
        routeProps.$route_path = pathname;
        routeProps.$route_name = pathname;
      }

      captureException(client, error, {
        handled: true,
        ...options.config,
        properties: { ...routeProps, ...options.config?.properties },
      });
    }, [client, error, pathname]);

    return <Boundary {...props} />;
  }

  const name = Boundary.displayName || Boundary.name || 'ErrorBoundary';
  WrappedExpoRouterErrorBoundary.displayName = `wrapExpoRouterErrorBoundary(${name})`;
  return WrappedExpoRouterErrorBoundary;
}
