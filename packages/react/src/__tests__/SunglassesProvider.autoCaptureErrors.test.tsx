// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { SunglassesProvider } from '../SunglassesProvider.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn(), shutdown: vi.fn(async () => {}), flush: vi.fn(async () => {}) } as unknown as ISunglassesClient;
}

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

describe('SunglassesProvider autoCaptureErrors (web)', () => {
  it('captures window error events with handled:false', () => {
    const client = makeClient();
    const unmount = mount(client, true);

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'boom',
      $error_handled: false,
    }));
    unmount();
  });

  it('captures unhandledrejection events', () => {
    const client = makeClient();
    const unmount = mount(client, true);

    act(() => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: new Error('rejected') });
      window.dispatchEvent(event);
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'rejected',
      $error_handled: false,
    }));
    unmount();
  });

  it('does nothing when autoCaptureErrors is not set', () => {
    const client = makeClient();
    const unmount = mount(client, false);

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }));
    });

    expect(client.capture).not.toHaveBeenCalled();
    unmount();
  });

  it('removes listeners on unmount', () => {
    const client = makeClient();
    const unmount = mount(client, true);
    unmount();

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after unmount') }));
    expect(client.capture).not.toHaveBeenCalled();
  });
});
