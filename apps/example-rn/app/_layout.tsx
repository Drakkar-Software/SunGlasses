import 'react-native-get-random-values'; // Must be imported before any crypto usage
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SunglassesCore } from '@sunglasses/core';
import { SunglassesProvider, useSunglasses, useExpoRouterScreenTracking } from '@sunglasses/react-native';
import { AsyncStorageAdapter } from '@sunglasses/storage-async-storage';
import type { ISunglassesClient } from '@sunglasses/core';

/**
 * Inner layout component — runs inside the SunglassesProvider context,
 * so it has access to useSunglasses() and can set up screen tracking.
 */
function InnerLayout(): React.ReactElement {
  const client = useSunglasses();
  // Automatically tracks screen changes via Expo Router's usePathname
  useExpoRouterScreenTracking(client);
  return <Stack />;
}

/**
 * Root layout: bootstrap the SDK, wrap the app in SunglassesProvider.
 *
 * Storage: AsyncStorage (persists across app restarts)
 * Privacy:  defaultOptIn: false — user must explicitly opt in
 * Debug:    true in development, set to false for production builds
 */
export default function RootLayout(): React.ReactElement | null {
  const [client, setClient] = useState<ISunglassesClient | null>(null);

  useEffect(() => {
    const storage = new AsyncStorageAdapter();

    // Console adapter for demo — replace with HttpStorageAdapter in production
    const consoleAdapter = {
      async send(batch: unknown[]) {
        console.log('[SunGlasses demo] Events flushed:', JSON.stringify(batch, null, 2));
      },
    };

    // Uncomment to push to a real server:
    // const httpAdapter = new HttpStorageAdapter({
    //   endpoint: 'https://your-server.example.com/ingest',
    //   flushIntervalMs: 10_000,
    // });

    SunglassesCore.create({
      adapters: [consoleAdapter /*, httpAdapter */],
      storage,
      defaultOptIn: false,
      platform: 'react-native',
      appName: 'example-rn',
      appVersion: '0.1.0',
      debug: __DEV__,
    })
      .then(setClient)
      .catch(console.error);
  }, []);

  if (!client) return null;

  return (
    <SunglassesProvider client={client}>
      <InnerLayout />
    </SunglassesProvider>
  );
}
