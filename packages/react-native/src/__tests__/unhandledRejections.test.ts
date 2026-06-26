// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { subscribeGlobalError } from '@drakkar.software/sunglasses-core';

// Controllable stand-in for the bundled rejection tracker. We mock the shim
// module (static import) rather than the dynamic require it wraps.
const mockTracking = vi.hoisted(() => ({
  current: null as
    | null
    | {
        enable: ReturnType<typeof vi.fn>;
        disable: ReturnType<typeof vi.fn>;
        onUnhandled?: (id: unknown, error: unknown) => void;
      },
}));

vi.mock('../rejectionTracking.js', () => ({
  get rejectionTracking() {
    return mockTracking.current;
  },
}));

import { attachUnhandledRejectionHandler } from '../unhandledRejections.js';

function makeClient(): ISunglassesClient {
  return { capture: vi.fn() } as unknown as ISunglassesClient;
}

describe('attachUnhandledRejectionHandler (rejection tracker available)', () => {
  beforeEach(() => {
    const tracker = {
      onUnhandled: undefined as undefined | ((id: unknown, error: unknown) => void),
      enable: vi.fn((opts: { onUnhandled?: (id: unknown, error: unknown) => void }) => {
        tracker.onUnhandled = opts.onUnhandled;
      }),
      disable: vi.fn(),
    };
    mockTracking.current = tracker;
  });

  it('captures rejections with handled:false and publishes to the bus', () => {
    const client = makeClient();
    const busListener = vi.fn();
    const unsubscribe = subscribeGlobalError(busListener);

    const cleanup = attachUnhandledRejectionHandler(client);
    expect(mockTracking.current?.enable).toHaveBeenCalledWith(
      expect.objectContaining({ allRejections: true })
    );

    const error = new Error('rejected promise');
    mockTracking.current?.onUnhandled?.(1, error);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'rejected promise',
      $error_handled: false,
    }));
    expect(busListener).toHaveBeenCalledWith(
      expect.objectContaining({ error, fatal: false, kind: 'rejection' })
    );

    cleanup();
    expect(mockTracking.current?.disable).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('attachUnhandledRejectionHandler (no tracker — global fallback)', () => {
  beforeEach(() => {
    mockTracking.current = null;
  });

  it('captures via a global unhandledrejection listener', () => {
    const client = makeClient();
    const cleanup = attachUnhandledRejectionHandler(client);

    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: new Error('global rejection') });
    globalThis.dispatchEvent(event);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'global rejection',
      $error_handled: false,
    }));

    cleanup();
  });

  it('removes the global listener on cleanup', () => {
    const client = makeClient();
    const cleanup = attachUnhandledRejectionHandler(client);
    cleanup();

    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: new Error('after cleanup') });
    globalThis.dispatchEvent(event);

    expect(client.capture).not.toHaveBeenCalled();
  });
});
