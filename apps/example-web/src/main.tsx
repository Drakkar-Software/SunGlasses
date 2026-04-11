import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SunglassesCore } from '@sunglasses/core';
import { SunglassesProvider } from '@sunglasses/react';
import { LocalStorageAdapter } from '@sunglasses/storage-localstorage';
import { HttpStorageAdapter } from '@sunglasses/storage-http';
import { App } from './App.js';

/**
 * Bootstrap the SDK before rendering the app.
 *
 * Storage: localStorage (persists across page reloads)
 * Adapter: HttpStorageAdapter (POSTs batched events to your server)
 *          Replace the endpoint with your real ingest URL.
 *
 * Privacy settings:
 *   defaultOptIn: false → users must call optIn() before any events are sent.
 *   debug: true → logs events to the console (remove in production!).
 */
async function bootstrap(): Promise<void> {
  const storage = new LocalStorageAdapter();

  // Console adapter for demo — logs events to browser DevTools
  const consoleAdapter = {
    async send(batch: unknown[]) {
      // eslint-disable-next-line no-console
      console.log('[SunGlasses demo] Events flushed:', JSON.stringify(batch, null, 2));
    },
  };

  // Uncomment and configure to push to a real server:
  // const httpAdapter = new HttpStorageAdapter({
  //   endpoint: 'https://your-server.example.com/ingest',
  //   flushIntervalMs: 10_000,
  // });

  const client = await SunglassesCore.create({
    adapters: [consoleAdapter /*, httpAdapter */],
    storage,
    defaultOptIn: false, // Privacy-first: user must opt in
    platform: 'web',
    appName: 'example-web',
    appVersion: '0.1.0',
    debug: true,
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
