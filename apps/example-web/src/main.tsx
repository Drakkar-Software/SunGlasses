import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SunglassesCore } from '@drakkar.software/sunglasses-core';
import type { IAnalyticsAdapter, SunglassesEvent } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider } from '@drakkar.software/sunglasses-react';
import { LocalStorageAdapter } from '@drakkar.software/sunglasses-storage-localstorage';
import { App } from './App.js';

/**
 * Bootstrap the SDK before rendering the app.
 *
 * Storage: localStorage (persists across page reloads)
 * Adapter: devAdapter — logs batches to the browser console during development.
 *          Replace with HttpStorageAdapter pointing at a real ingest endpoint in production.
 *
 * Privacy settings:
 *   defaultOptIn: false → users must call optIn() before any events are sent.
 *   debug: true → logs internal SDK messages to the console (remove in production!).
 */

/** Minimal dev-only sink: pretty-prints each batch to the browser console. */
const devAdapter: IAnalyticsAdapter = {
  async send(batch: ReadonlyArray<SunglassesEvent>): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[sunglasses]', batch);
  },
};

async function bootstrap(): Promise<void> {
  const storage = new LocalStorageAdapter();

  // Replace devAdapter with HttpStorageAdapter for production:
  // const httpAdapter = new HttpStorageAdapter({
  //   endpoint: 'https://your-server.example.com/ingest',
  // });

  const client = await SunglassesCore.create({
    adapters: [devAdapter /*, httpAdapter */],
    storage,
    defaultOptIn: false, // Privacy-first: user must opt in
    platform: 'web',
    appName: 'example-web',
    appVersion: '0.1.0',
    debug: true,
    enableSessionTracking: true,
  });

  // Make the client available on window for easy demo testing in the console
  (window as unknown as Record<string, unknown>).sunglasses = client;

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <SunglassesProvider
        client={client}
        screenTracking={{ useHistoryApi: true }}
      >
        <App />
      </SunglassesProvider>
    </StrictMode>
  );
}

bootstrap().catch(console.error);
