// @vitest-environment happy-dom
// Opt into React 18's strict act() environment so effects flush synchronously in tests
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@sunglasses/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      consentStatus: 'opted-in' as const,
      consentHistory: [],
      traits: {},
      queuedEvents: [],
      archivedEvents: [],
      eventCountSummary: {},
    })),
    deleteUserData: vi.fn(async () => {}),
  };
}

// Renders a component that calls useScreenTracking, returns an unmount function.
// We import dynamically so vi.resetModules() takes effect between tests.
async function mountScreenTracking(
  client: ISunglassesClient,
  options: { useHistoryApi?: boolean; screenNameMapper?: (p: string) => string } = {}
): Promise<() => void> {
  const { useScreenTracking } = await import('../useScreenTracking.js');

  let root: ReturnType<typeof createRoot> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent() {
    useScreenTracking(client, { useHistoryApi: true, ...options });
    return null;
  }

  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(TestComponent));
  });

  return async () => {
    await act(async () => {
      root!.unmount();
    });
    document.body.removeChild(container);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useScreenTracking', () => {
  // Snapshot the unbound originals before any tests run.
  // Note: the hook stores a .bind() copy internally, so we cannot test reference
  // equality after unmount. We test behaviour (no screen call) instead.
  const nativePushState = window.history.pushState;
  const nativeReplaceState = window.history.replaceState;

  beforeEach(() => {
    vi.resetModules();
    // happy-dom sets window.location.pathname — reset to a known value
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    // Restore history methods in case a test left them patched (e.g. after an
    // exception that prevented cleanup from running)
    window.history.pushState = nativePushState;
    window.history.replaceState = nativeReplaceState;
  });

  it('calls client.screen() for the initial page on mount', async () => {
    const client = makeClient();
    window.history.pushState({}, '', '/home');

    const unmount = await mountScreenTracking(client);
    expect(client.screen).toHaveBeenCalledWith(
      '/home',
      expect.objectContaining({ $path: '/home', $url: expect.stringContaining('/home') })
    );
    await unmount();
  });

  it('calls client.screen() when history.pushState is called', async () => {
    const client = makeClient();
    const unmount = await mountScreenTracking(client);

    vi.mocked(client.screen).mockClear();
    await act(async () => {
      window.history.pushState({}, '', '/about');
    });

    expect(client.screen).toHaveBeenCalledWith(
      '/about',
      expect.objectContaining({ $path: '/about', $url: expect.stringContaining('/about'), $referrer: '/' })
    );
    await unmount();
  });

  it('calls client.screen() when history.replaceState is called', async () => {
    const client = makeClient();
    const unmount = await mountScreenTracking(client);

    vi.mocked(client.screen).mockClear();
    await act(async () => {
      window.history.replaceState({}, '', '/replaced');
    });

    expect(client.screen).toHaveBeenCalledWith(
      '/replaced',
      expect.objectContaining({ $path: '/replaced', $url: expect.stringContaining('/replaced'), $referrer: '/' })
    );
    await unmount();
  });

  it('calls client.screen() on popstate (browser back/forward)', async () => {
    const client = makeClient();
    const unmount = await mountScreenTracking(client);

    vi.mocked(client.screen).mockClear();
    await act(async () => {
      // happy-dom: simulate a popstate by pushing first, then dispatching
      window.history.pushState({}, '', '/popped');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(client.screen).toHaveBeenCalled();
    await unmount();
  });

  it('stops tracking navigations after unmount', async () => {
    const client = makeClient();
    const unmount = await mountScreenTracking(client);

    // Capture the patched pushState while mounted
    const patchedPush = window.history.pushState;
    await unmount();

    // After unmount, the patched version must be gone
    expect(window.history.pushState).not.toBe(patchedPush);

    // Navigating after unmount must NOT call screen()
    vi.mocked(client.screen).mockClear();
    window.history.pushState({}, '', '/after-unmount');
    expect(client.screen).not.toHaveBeenCalled();
  });

  it('no-op when useHistoryApi is false', async () => {
    const { useScreenTracking } = await import('../useScreenTracking.js');
    const client = makeClient();

    const container = document.createElement('div');
    document.body.appendChild(container);

    function TestComponent() {
      useScreenTracking(client, { useHistoryApi: false });
      return null;
    }

    await act(async () => {
      const root = createRoot(container);
      root.render(React.createElement(TestComponent));
    });

    expect(client.screen).not.toHaveBeenCalled();
    document.body.removeChild(container);
  });

  it('applies screenNameMapper to the pathname', async () => {
    const client = makeClient();
    window.history.pushState({}, '', '/users/42/profile');

    const mapper = (path: string) => path.replace(/\/users\/\d+\//, '/users/:id/');
    const unmount = await mountScreenTracking(client, { screenNameMapper: mapper });

    // mapper transforms the screen name; $path/$url still reflect the actual URL
    expect(client.screen).toHaveBeenCalledWith(
      '/users/:id/profile',
      expect.objectContaining({
        $path: '/users/42/profile',
        $url: expect.stringContaining('/users/42/profile'),
      })
    );
    await unmount();
  });

  it('second concurrent mount is a no-op (module-level guard)', async () => {
    const { useScreenTracking } = await import('../useScreenTracking.js');
    const client1 = makeClient();
    const client2 = makeClient();

    const container1 = document.createElement('div');
    const container2 = document.createElement('div');
    document.body.appendChild(container1);
    document.body.appendChild(container2);

    let root1: ReturnType<typeof createRoot>;
    let root2: ReturnType<typeof createRoot>;

    function C1() { useScreenTracking(client1, { useHistoryApi: true }); return null; }
    function C2() { useScreenTracking(client2, { useHistoryApi: true }); return null; }

    await act(async () => {
      root1 = createRoot(container1);
      root1.render(React.createElement(C1));
    });

    vi.mocked(client1.screen).mockClear();
    vi.mocked(client2.screen).mockClear();

    await act(async () => {
      root2 = createRoot(container2);
      root2.render(React.createElement(C2));
    });

    // client2 should NOT have been called — it's the second concurrent instance
    await act(async () => { window.history.pushState({}, '', '/nav'); });

    expect(client1.screen).toHaveBeenCalled();
    expect(client2.screen).not.toHaveBeenCalled();

    await act(async () => { root1!.unmount(); root2!.unmount(); });
    document.body.removeChild(container1);
    document.body.removeChild(container2);
  });
});
