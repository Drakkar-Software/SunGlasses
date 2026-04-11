// @vitest-environment happy-dom
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@sunglasses/core';
import { SunglassesErrorBoundary } from '../SunglassesErrorBoundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): ISunglassesClient {
  return {
    capture: vi.fn(),
    screen: vi.fn(),
    identify: vi.fn(),
    alias: vi.fn(),
    group: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    getRegisteredProperties: vi.fn(() => ({})),
    reset: vi.fn(async () => {}),
    optIn: vi.fn(async () => {}),
    optOut: vi.fn(async () => {}),
    hasOptedIn: vi.fn(() => true),
    hasOptedOut: vi.fn(() => false),
    getConsentStatus: vi.fn(() => 'opted-in' as const),
    getConsentHistory: vi.fn(() => []),
    flush: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    getEventCount: vi.fn(async () => 0),
    resetEventCount: vi.fn(async () => {}),
    eventCounter: null,
    getQueuedEventCount: vi.fn(() => 0),
    clearLocalArchive: vi.fn(async () => {}),
    exportUserData: vi.fn(async () => ({
      exportedAt: '',
      anonymousId: 'anon',
      distinctId: null,
      traits: {},
      consentStatus: 'opted-in' as const,
      consentHistory: [],
      queuedEvents: [],
    })),
    deleteUserData: vi.fn(async () => {}),
  };
}

/** Component that throws during render. */
function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new TypeError('Explosion!');
  return <div>Safe</div>;
}

// Suppress React's console.error output for expected errors in tests.
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SunglassesErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary client={client}>
          <div id="content">Hello</div>
        </SunglassesErrorBoundary>
      );
    });

    expect(container.querySelector('#content')).not.toBeNull();
    expect(client.capture).not.toHaveBeenCalled();
    document.body.removeChild(container);
  });

  it('captures $error event with $error_handled: true when child throws', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary client={client}>
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Explosion!',
      $error_type: 'TypeError',
      $error_handled: true,
      $error_level: 'error',
    }));
    document.body.removeChild(container);
  });

  it('renders fallback when an error is caught', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary client={client} fallback={<div id="fallback">Error!</div>}>
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(container.querySelector('#fallback')).not.toBeNull();
    document.body.removeChild(container);
  });

  it('renders null (not fallback) by default when an error is caught', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary client={client}>
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(container.innerHTML).toBe('');
    document.body.removeChild(container);
  });

  it('skips capture when error message matches an ignorePattern', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary
          client={client}
          config={{ ignorePatterns: [/Explosion/] }}
        >
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(client.capture).not.toHaveBeenCalled();
    document.body.removeChild(container);
  });

  it('applies beforeCapture transform to props', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary
          client={client}
          config={{ beforeCapture: (props) => ({ ...props, source: 'boundary' }) }}
        >
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      source: 'boundary',
    }));
    document.body.removeChild(container);
  });

  it('skips capture when beforeCapture returns null', () => {
    const client = makeClient();
    const container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      createRoot(container).render(
        <SunglassesErrorBoundary
          client={client}
          config={{ beforeCapture: () => null }}
        >
          <Bomb shouldThrow={true} />
        </SunglassesErrorBoundary>
      );
    });

    expect(client.capture).not.toHaveBeenCalled();
    document.body.removeChild(container);
  });
});
