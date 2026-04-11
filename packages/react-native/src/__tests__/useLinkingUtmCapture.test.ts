// @vitest-environment happy-dom
// Opt into React 18's strict act() environment so effects flush synchronously in tests
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

// ─── Mock react-native ─────────────────────────────────────────────────────────

vi.mock('react-native', () => ({
  Linking: {
    getInitialURL: vi.fn(() => Promise.resolve(null)),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// Import after mock is registered
import { Linking } from 'react-native';
import { useLinkingUtmCapture } from '../useLinkingUtmCapture.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(): Pick<ISunglassesClient, 'register'> {
  return { register: vi.fn() };
}

async function mountHook(client: ISunglassesClient): Promise<() => Promise<void>> {
  let root: ReturnType<typeof createRoot> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent() {
    useLinkingUtmCapture(client);
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

describe('useLinkingUtmCapture', () => {
  const mockGetInitialURL = vi.mocked(Linking.getInitialURL);
  const mockAddEventListener = vi.mocked(Linking.addEventListener);

  beforeEach(() => {
    mockGetInitialURL.mockResolvedValue(null);
    mockAddEventListener.mockReturnValue({ remove: vi.fn() } as ReturnType<typeof Linking.addEventListener>);
  });

  it('captures UTM params from the initial URL on cold start', async () => {
    mockGetInitialURL.mockResolvedValue(
      'myapp://home?utm_source=email&utm_campaign=sale'
    );
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'email',
      utm_campaign: 'sale',
    });

    await unmount();
  });

  it('does not call register when the initial URL has no UTM params', async () => {
    mockGetInitialURL.mockResolvedValue('myapp://home?tab=profile');
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).not.toHaveBeenCalled();
    await unmount();
  });

  it('does not call register when getInitialURL returns null', async () => {
    mockGetInitialURL.mockResolvedValue(null);
    const client = makeClient();

    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(client.register).not.toHaveBeenCalled();
    await unmount();
  });

  it('captures UTM params from a re-open deep link', async () => {
    let linkHandler: ((event: { url: string }) => void) | undefined;
    mockAddEventListener.mockImplementation((_event, handler) => {
      linkHandler = handler as (event: { url: string }) => void;
      return { remove: vi.fn() } as ReturnType<typeof Linking.addEventListener>;
    });

    const client = makeClient();
    const unmount = await mountHook(client as unknown as ISunglassesClient);

    // Simulate re-open via deep link
    await act(async () => {
      linkHandler?.({ url: 'myapp://promo?utm_source=push&utm_medium=notification' });
    });

    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({
        utm_source: 'push',
        utm_medium: 'notification',
      })
    );

    await unmount();
  });

  it('removes the event listener subscription on unmount', async () => {
    const removeMock = vi.fn();
    mockAddEventListener.mockReturnValue({ remove: removeMock } as ReturnType<typeof Linking.addEventListener>);

    const client = makeClient();
    const unmount = await mountHook(client as unknown as ISunglassesClient);

    expect(removeMock).not.toHaveBeenCalled();
    await unmount();
    expect(removeMock).toHaveBeenCalledOnce();
  });

  it('is a no-op when getInitialURL rejects', async () => {
    mockGetInitialURL.mockRejectedValue(new Error('not supported'));
    const client = makeClient();

    // Should not throw
    const unmount = await mountHook(client as unknown as ISunglassesClient);
    expect(client.register).not.toHaveBeenCalled();
    await unmount();
  });
});
