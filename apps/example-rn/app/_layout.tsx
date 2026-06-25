import 'react-native-get-random-values'; // Must be imported before any crypto usage
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import type { ISunglassesClient, IAnalyticsAdapter, SunglassesEvent } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider, useSunglasses, useExpoRouterScreenTracking } from '@drakkar.software/sunglasses-react-native';
import { AsyncStorageAdapter } from '@drakkar.software/sunglasses-storage-async-storage';

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

/** Minimal dev-only sink: logs batch count and anonymous IDs to the RN console.
 *  Privacy: never logs distinctId, properties, or context. */
const devAdapter: IAnalyticsAdapter = {
  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[sunglasses] ${batch.length} event(s)`,
      batch.map((e) => ({ type: e.type, event: e.event, anonymousId: e.anonymousId })),
    );
  },
};

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

    // Replace devAdapter with HttpStorageAdapter for production:
    // const httpAdapter = new HttpStorageAdapter({
    //   endpoint: 'https://your-server.example.com/ingest',
    // });

    SunglassesCore.create({
      adapters: [devAdapter /*, httpAdapter */],
      storage,
      defaultOptIn: false,
      platform: 'react-native',
      appName: 'example-rn',
      appVersion: '0.1.0',
      debug: __DEV__,
      enableSessionTracking: true,
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
