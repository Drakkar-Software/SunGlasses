import { useEffect } from 'react';
import { Linking } from 'react-native';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { captureDeepLinkUtmParams } from './captureDeepLinkUtmParams.js';

/**
 * Hook that captures UTM attribution from deep links via React Native's Linking API.
 *
 * Handles two cases:
 * - **Cold start**: reads the initial URL that launched the app via `Linking.getInitialURL()`.
 * - **Re-open**: subscribes to new deep links while the app is running via
 *   `Linking.addEventListener('url', ...)` — useful for re-attribution when the
 *   user taps a new campaign link while the app is already open.
 *
 * UTM params are registered as super properties via `client.register()`, so they
 * are attached to all subsequent events automatically.
 *
 * Place this hook in your root component or app entry point.
 *
 * @example
 * ```tsx
 * // App.tsx
 * import { useLinkingUtmCapture } from '@drakkar.software/sunglasses-react-native';
 *
 * export default function App() {
 *   const client = useSunglasses();
 *   useLinkingUtmCapture(client);
 *   return <NavigationContainer>...</NavigationContainer>;
 * }
 * ```
 */
export function useLinkingUtmCapture(client: ISunglassesClient): void {
  useEffect(() => {
    // Cold start: capture UTM from the URL that opened the app
    Linking.getInitialURL()
      .then((url) => {
        if (url) captureDeepLinkUtmParams(client, url);
      })
      .catch(() => {
        // getInitialURL() can fail on some platforms — ignore silently
      });

    // Re-open: capture UTM from new deep links while the app is running
    const subscription = Linking.addEventListener('url', ({ url }) => {
      captureDeepLinkUtmParams(client, url);
    });

    return () => {
      subscription.remove();
    };
  }, [client]);
}
