// @vitest-environment happy-dom
// Opt into React 18's strict act() environment so effects flush synchronously in tests
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

// ─── Mock expoRouterCompat ─────────────────────────────────────────────────────
//
// We mock the shim module (static import) rather than expo-router itself (dynamic
// require). This gives vi.mock a real module boundary to intercept and keeps the
// hook's require() call out of the test entirely.

const mockExpoRouter = vi.hoisted(() => ({
  params: {} as Record<string, string | string[]>,
}));

vi.mock('../expoRouterCompat.js', () => ({
  useGlobalSearchParams: () => mockExpoRouter.params,
}));

import { useExpoRouterUtmCapture } from '../useExpoRouterUtmCapture.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(): Pick<ISunglassesClient, 'register'> {
  return { register: vi.fn() };
}

async function mountHook(
  client: ISunglassesClient
): Promise<() => Promise<void>> {
  let root: ReturnType<typeof createRoot> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent() {
    useExpoRouterUtmCapture(client);
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

describe('useExpoRouterUtmCapture', () => {
  beforeEach(() => {
    mockExpoRouter.params = {};
  });

  it('registers UTM params from Expo Router global search params', async () => {
    mockExpoRouter.params = {
      utm_source: 'email',
      utm_campaign: 'welcome_back',
    };
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'email',
      utm_campaign: 'welcome_back',
    });

    await unmount();
  });

  it('registers all five UTM params', async () => {
    mockExpoRouter.params = {
      utm_source: 'nl',
      utm_medium: 'email',
      utm_campaign: 'q4',
      utm_content: 'hero',
      utm_term: 'analytics',
    };
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'nl',
      utm_medium: 'email',
      utm_campaign: 'q4',
      utm_content: 'hero',
      utm_term: 'analytics',
    });

    await unmount();
  });

  it('takes the first value when a param is an array', async () => {
    mockExpoRouter.params = { utm_source: ['push', 'email'] };
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith({ utm_source: 'push' });
    await unmount();
  });

  it('does not call register when no UTM params are present', async () => {
    mockExpoRouter.params = { tab: 'home', id: '42' };
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).not.toHaveBeenCalled();
    await unmount();
  });

  it('does not call register when params are empty', async () => {
    mockExpoRouter.params = {};
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).not.toHaveBeenCalled();
    await unmount();
  });

  it('re-registers when params update (new deep link with UTM)', async () => {
    // Start with no UTM params
    mockExpoRouter.params = { tab: 'home' };
    const client = makeClient();

    let root: ReturnType<typeof createRoot> | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);

    function TestComponent() {
      useExpoRouterUtmCapture(client as unknown as ISunglassesClient);
      return null;
    }

    await act(async () => {
      root = createRoot(container);
      root.render(React.createElement(TestComponent));
    });

    expect(client.register).not.toHaveBeenCalled();

    // Simulate new deep link with UTM params arriving
    mockExpoRouter.params = { utm_source: 'push', utm_campaign: 'flash_sale' };
    await act(async () => {
      root!.render(React.createElement(TestComponent));
    });

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'push',
      utm_campaign: 'flash_sale',
    });

    await act(async () => { root!.unmount(); });
    document.body.removeChild(container);
  });
});
