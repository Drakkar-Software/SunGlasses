// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from '../context.js';
import { SunglassesErrorBoundary } from '../SunglassesErrorBoundary.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn() } as unknown as ISunglassesClient;
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new TypeError('Explosion!');
  return <div>Safe</div>;
}

const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe('SunglassesErrorBoundary (react-native)', () => {
  it('captures $error with handled:true using the client from context', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesContext.Provider value={client}>
          <SunglassesErrorBoundary>
            <Bomb shouldThrow={true} />
          </SunglassesErrorBoundary>
        </SunglassesContext.Provider>
      );
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Explosion!',
      $error_type: 'TypeError',
      $error_handled: true,
    }));
    document.body.removeChild(container);
  });

  it('renders the fallback when an error is caught', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesContext.Provider value={client}>
          <SunglassesErrorBoundary fallback={<div id="fallback">Error!</div>}>
            <Bomb shouldThrow={true} />
          </SunglassesErrorBoundary>
        </SunglassesContext.Provider>
      );
    });

    expect(container.querySelector('#fallback')).not.toBeNull();
    document.body.removeChild(container);
  });

  it('renders children when no error occurs', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesContext.Provider value={client}>
          <SunglassesErrorBoundary>
            <div id="content">Hello</div>
          </SunglassesErrorBoundary>
        </SunglassesContext.Provider>
      );
    });

    expect(container.querySelector('#content')).not.toBeNull();
    expect(client.capture).not.toHaveBeenCalled();
    document.body.removeChild(container);
  });
});
