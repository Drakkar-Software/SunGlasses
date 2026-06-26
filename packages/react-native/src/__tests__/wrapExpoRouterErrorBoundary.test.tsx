// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

const mockRouter = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('../expoRouterCompat.js', () => ({
  usePathname: () => mockRouter.pathname,
  useGlobalSearchParams: () => ({}),
}));

import { SunglassesContext } from '../context.js';
import { wrapExpoRouterErrorBoundary } from '../wrapExpoRouterErrorBoundary.js';
import type { ExpoRouterErrorBoundaryProps } from '../wrapExpoRouterErrorBoundary.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn() } as unknown as ISunglassesClient;
}

function BaseBoundary({ error }: ExpoRouterErrorBoundaryProps): React.ReactElement {
  return <div id="boundary">{error.message}</div>;
}

function mount(
  client: ISunglassesClient,
  Boundary: React.ComponentType<ExpoRouterErrorBoundaryProps>,
  props: ExpoRouterErrorBoundaryProps
): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SunglassesContext.Provider value={client}>
        <Boundary {...props} />
      </SunglassesContext.Provider>
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

describe('wrapExpoRouterErrorBoundary', () => {
  beforeEach(() => {
    mockRouter.pathname = '/settings/profile';
  });

  it('captures the boundary error with route context and renders the original boundary', () => {
    const client = makeClient();
    const Wrapped = wrapExpoRouterErrorBoundary(BaseBoundary);
    const error = new Error('route error');

    const { container, unmount } = mount(client, Wrapped, { error, retry: async () => {} });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'route error',
      $error_handled: true,
      $route_path: '/settings/profile',
      $route_name: '/settings/profile',
    }));
    expect(container.querySelector('#boundary')?.textContent).toBe('route error');
    unmount();
  });

  it('captures each distinct error once', () => {
    const client = makeClient();
    const Wrapped = wrapExpoRouterErrorBoundary(BaseBoundary);
    const error = new Error('stable error');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SunglassesContext.Provider value={client}>
          <Wrapped error={error} retry={async () => {}} />
        </SunglassesContext.Provider>
      );
    });
    // Re-render with the same error reference.
    act(() => {
      root.render(
        <SunglassesContext.Provider value={client}>
          <Wrapped error={error} retry={async () => {}} />
        </SunglassesContext.Provider>
      );
    });

    expect(client.capture).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('uses the client passed via options over context', () => {
    const contextClient = makeClient();
    const optionClient = makeClient();
    const Wrapped = wrapExpoRouterErrorBoundary(BaseBoundary, { client: optionClient });

    const { unmount } = mount(contextClient, Wrapped, {
      error: new Error('opt client'),
      retry: async () => {},
    });

    expect(optionClient.capture).toHaveBeenCalled();
    expect(contextClient.capture).not.toHaveBeenCalled();
    unmount();
  });
});
