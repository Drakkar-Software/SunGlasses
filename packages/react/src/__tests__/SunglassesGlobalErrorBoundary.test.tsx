// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { publishGlobalError } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from '../context.js';
import { SunglassesGlobalErrorBoundary } from '../SunglassesGlobalErrorBoundary.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn() } as unknown as ISunglassesClient;
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new TypeError('Render explosion!');
  return <div>Safe</div>;
}

const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function mount(ui: React.ReactNode): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<>{ui}</>);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

describe('SunglassesGlobalErrorBoundary (web) — render errors', () => {
  it('captures render-phase errors with handled:true and shows the fallback', () => {
    const client = makeClient();
    const { container, unmount } = mount(
      <SunglassesContext.Provider value={client}>
        <SunglassesGlobalErrorBoundary fallback={<div id="fallback">Error!</div>}>
          <Bomb shouldThrow={true} />
        </SunglassesGlobalErrorBoundary>
      </SunglassesContext.Provider>
    );

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Render explosion!',
      $error_handled: true,
    }));
    expect(container.querySelector('#fallback')).not.toBeNull();
    unmount();
  });
});

describe('SunglassesGlobalErrorBoundary (web) — global errors', () => {
  it('shows the fallback for a fatal global error without re-capturing', () => {
    const client = makeClient();
    const { container, unmount } = mount(
      <SunglassesContext.Provider value={client}>
        <SunglassesGlobalErrorBoundary fallback={<div id="fallback">Boom</div>}>
          <div id="content">app</div>
        </SunglassesGlobalErrorBoundary>
      </SunglassesContext.Provider>
    );

    act(() => {
      publishGlobalError({ error: new Error('fatal'), fatal: true, kind: 'error' });
    });

    expect(container.querySelector('#fallback')).not.toBeNull();
    expect(client.capture).not.toHaveBeenCalled();
    unmount();
  });

  it('ignores non-fatal global errors and rejections by default', () => {
    const client = makeClient();
    const { container, unmount } = mount(
      <SunglassesContext.Provider value={client}>
        <SunglassesGlobalErrorBoundary fallback={<div id="fallback">Boom</div>}>
          <div id="content">app</div>
        </SunglassesGlobalErrorBoundary>
      </SunglassesContext.Provider>
    );

    act(() => {
      publishGlobalError({ error: new Error('non-fatal'), fatal: false, kind: 'error' });
      publishGlobalError({ error: new Error('rejected'), fatal: false, kind: 'rejection' });
    });

    expect(container.querySelector('#fallback')).toBeNull();
    expect(container.querySelector('#content')).not.toBeNull();
    unmount();
  });

  it('shows the fallback for rejections when opted in', () => {
    const client = makeClient();
    const { container, unmount } = mount(
      <SunglassesContext.Provider value={client}>
        <SunglassesGlobalErrorBoundary fallback={<div id="fallback">Boom</div>} includeUnhandledRejections>
          <div id="content">app</div>
        </SunglassesGlobalErrorBoundary>
      </SunglassesContext.Provider>
    );

    act(() => {
      publishGlobalError({ error: new Error('rejected'), fatal: false, kind: 'rejection' });
    });

    expect(container.querySelector('#fallback')).not.toBeNull();
    unmount();
  });
});
