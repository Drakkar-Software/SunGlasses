// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import { SunglassesProvider } from '../SunglassesProvider.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn(), shutdown: vi.fn(async () => {}), flush: vi.fn(async () => {}) } as unknown as ISunglassesClient;
}

type RNErrorHandler = (error: unknown, isFatal?: boolean) => void;

let currentHandler: RNErrorHandler | undefined;
let previousHandler: RNErrorHandler | undefined;

beforeEach(() => {
  currentHandler = undefined;
  previousHandler = vi.fn();
  (globalThis as Record<string, unknown>)['ErrorUtils'] = {
    getGlobalHandler: () => currentHandler ?? previousHandler,
    setGlobalHandler: (h: RNErrorHandler) => {
      currentHandler = h;
    },
  };
});

function mount(client: ISunglassesClient, autoCaptureErrors: boolean | object): () => void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SunglassesProvider client={client} autoCaptureErrors={autoCaptureErrors as never}>
        <div>app</div>
      </SunglassesProvider>
    );
  });
  return () => {
    act(() => root.unmount());
    document.body.removeChild(container);
  };
}

describe('SunglassesProvider autoCaptureErrors (react-native)', () => {
  it('installs a global handler that captures with handled:false', () => {
    const client = makeClient();
    const unmount = mount(client, true);

    expect(currentHandler).toBeTypeOf('function');
    const err = new Error('native boom');
    currentHandler?.(err, true);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'native boom',
      $error_handled: false,
    }));
    unmount();
  });

  it('chains to the previously installed handler', () => {
    const client = makeClient();
    const unmount = mount(client, true);

    const err = new Error('chained');
    currentHandler?.(err, false);

    expect(previousHandler).toHaveBeenCalledWith(err, false);
    unmount();
  });

  it('does nothing when autoCaptureErrors is not set', () => {
    const client = makeClient();
    const unmount = mount(client, false);

    // Handler is left untouched (still the previous one).
    expect(currentHandler).toBeUndefined();
    unmount();
  });

  it('restores the previous handler on unmount', () => {
    const client = makeClient();
    const unmount = mount(client, true);
    unmount();

    expect(currentHandler).toBe(previousHandler);
  });
});

describe('SunglassesProvider autoCaptureErrors console capture (react-native)', () => {
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
  });

  it('captures console.error when console is enabled', () => {
    const client = makeClient();
    const unmount = mount(client, { console: true });

    console.error('rn console boom');

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'rn console boom',
      $error_handled: false,
      $error_source: 'console',
    }));
    unmount();
  });

  it('restores console.error on unmount', () => {
    const client = makeClient();
    const before = console.error;
    const unmount = mount(client, { console: true });
    expect(console.error).not.toBe(before);
    unmount();
    expect(console.error).toBe(before);
  });

  it('does not install the ErrorUtils handler when globalHandlers is false', () => {
    const client = makeClient();
    const unmount = mount(client, { globalHandlers: false, console: true });

    expect(currentHandler).toBeUndefined();

    console.error('console only');
    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_source: 'console',
    }));
    unmount();
  });
});
