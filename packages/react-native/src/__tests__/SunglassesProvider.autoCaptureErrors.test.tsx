// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
