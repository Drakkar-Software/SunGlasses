import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { createPostHogBeforeSend } from '../createPostHogBeforeSend.js';

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

function makeEvent(eventName: string, properties: Record<string, unknown> = {}) {
  return { event: eventName, properties, timestamp: new Date('2024-01-01T00:00:00.000Z') };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPostHogBeforeSend', () => {
  let client: ISunglassesClient;

  beforeEach(() => {
    client = makeClient();
  });

  it('forwards a user event to client.capture with correct name and properties', () => {
    const beforeSend = createPostHogBeforeSend(client);
    beforeSend(makeEvent('button_clicked', { button: 'submit' }));

    expect(client.capture).toHaveBeenCalledWith('button_clicked', { button: 'submit' });
  });

  it('returns the original event when suppressPostHogSend is false', () => {
    const beforeSend = createPostHogBeforeSend(client);
    const event = makeEvent('button_clicked');
    const result = beforeSend(event);

    expect(result).toBe(event);
  });

  it('skips system events ($pageview) by default', () => {
    const beforeSend = createPostHogBeforeSend(client);
    beforeSend(makeEvent('$pageview', { url: '/home' }));

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('forwards non-pageview/exception system events when includeSystemEvents is true', () => {
    // $pageview and $exception are handled by dedicated mappers; other $-events
    // (e.g. $pageleave, $autocapture) are forwarded when includeSystemEvents: true.
    const beforeSend = createPostHogBeforeSend(client, { includeSystemEvents: true });
    beforeSend(makeEvent('$pageleave', { url: '/home' }));

    expect(client.capture).toHaveBeenCalledWith('$pageleave', { url: '/home' });
  });

  it('$pageview is NOT forwarded via includeSystemEvents (use systemEvents.pageview instead)', () => {
    // $pageview always returns early without calling capture — even with includeSystemEvents.
    const beforeSend = createPostHogBeforeSend(client, { includeSystemEvents: true });
    beforeSend(makeEvent('$pageview', { $pathname: '/home' }));

    // Neither capture nor screen — $pageview requires systemEvents.pageview: true
    expect(client.capture).not.toHaveBeenCalled();
    expect(client.screen).not.toHaveBeenCalled();
  });

  it('skips events in ignoreEventTypes list', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      ignoreEventTypes: ['survey_shown'],
    });
    beforeSend(makeEvent('survey_shown'));

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('skips events matching ignorePatterns', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      ignorePatterns: [/^debug_/],
    });
    beforeSend(makeEvent('debug_trace'));

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('still returns the PostHog event when ignorePatterns matches', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      ignorePatterns: [/^debug_/],
    });
    const event = makeEvent('debug_trace');
    const result = beforeSend(event);

    expect(result).toBe(event);
  });

  it('suppressPostHogSend: returns null and still captures to SunGlasses', () => {
    const beforeSend = createPostHogBeforeSend(client, { suppressPostHogSend: true });
    const result = beforeSend(makeEvent('purchase', { amount: 99 }));

    expect(result).toBeNull();
    expect(client.capture).toHaveBeenCalledWith('purchase', { amount: 99 });
  });

  it('suppressPostHogSend + ignoreEventTypes: returns null and skips SunGlasses capture', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      suppressPostHogSend: true,
      ignoreEventTypes: ['noisy_event'],
    });
    const result = beforeSend(makeEvent('noisy_event'));

    expect(result).toBeNull();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('applies beforeCapture transform to props', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      beforeCapture: (name, props) => ({ ...props, source: 'posthog', _event: name }),
    });
    beforeSend(makeEvent('sign_up', { plan: 'pro' }));

    expect(client.capture).toHaveBeenCalledWith('sign_up', {
      plan: 'pro',
      source: 'posthog',
      _event: 'sign_up',
    });
  });

  it('skips SunGlasses capture when beforeCapture returns null', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      beforeCapture: () => null,
    });
    const event = makeEvent('filtered_event');
    const result = beforeSend(event);

    expect(client.capture).not.toHaveBeenCalled();
    // PostHog still gets the event (suppressPostHogSend is false)
    expect(result).toBe(event);
  });

  it('renames event via transformEventName before client.capture', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      transformEventName: (n) => n.replace(/_/g, ' '),
    });
    beforeSend(makeEvent('button_clicked'));

    expect(client.capture).toHaveBeenCalledWith('button clicked', expect.anything());
  });

  it('handles events with no properties gracefully', () => {
    const beforeSend = createPostHogBeforeSend(client);
    beforeSend({ event: 'page_loaded' });

    expect(client.capture).toHaveBeenCalledWith('page_loaded', {});
  });

  // -------------------------------------------------------------------------
  // systemEvents.pageview
  // -------------------------------------------------------------------------

  it('systemEvents.pageview: routes $pageview to client.screen() with $path/$url', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { pageview: true },
    });
    beforeSend(makeEvent('$pageview', {
      $pathname: '/dashboard',
      $current_url: 'https://example.com/dashboard',
      $title: 'Dashboard',
    }));

    expect(client.screen).toHaveBeenCalledWith('/dashboard', {
      $path: '/dashboard',
      $url: 'https://example.com/dashboard',
      $title: 'Dashboard',
    });
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('systemEvents.pageview: routes $screen (RN) to client.screen()', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { pageview: true },
    });
    beforeSend(makeEvent('$screen', { $screen_name: 'HomeScreen' }));

    expect(client.screen).toHaveBeenCalledWith('HomeScreen', expect.any(Object));
  });

  it('$pageview is NOT routed when systemEvents.pageview is false (default)', () => {
    const beforeSend = createPostHogBeforeSend(client);
    beforeSend(makeEvent('$pageview', { $pathname: '/home' }));

    expect(client.screen).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('suppressPostHogSend + systemEvents.pageview: still calls client.screen() but returns null', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      suppressPostHogSend: true,
      systemEvents: { pageview: true },
    });
    const result = beforeSend(makeEvent('$pageview', { $pathname: '/home', $current_url: 'https://example.com/home' }));

    expect(result).toBeNull();
    expect(client.screen).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // systemEvents.exception
  // -------------------------------------------------------------------------

  it('systemEvents.exception: routes $exception to client.capture("$error")', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { exception: true },
    });
    beforeSend(makeEvent('$exception', {
      $exception_list: [{ type: 'TypeError', value: 'Cannot read property of undefined', mechanism: { handled: false } }],
      $exception_level: 'error',
    }));

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Cannot read property of undefined',
      $error_type: 'TypeError',
      $error_handled: false,
      $error_level: 'error',
    }));
  });

  it('systemEvents.exception: $error_stack omitted by default (privacy)', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { exception: true },
    });
    beforeSend(makeEvent('$exception', {
      $exception_list: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: 'app.js', lineno: 1, function: 'foo' }] } }],
    }));

    const captured = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(captured.$error_stack).toBeUndefined();
  });

  it('systemEvents.exception + includeStack: includes $error_stack', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { exception: true, includeStack: true },
    });
    beforeSend(makeEvent('$exception', {
      $exception_list: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: 'app.js', lineno: 1, colno: 5, function: 'foo' }] } }],
    }));

    const captured = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(captured.$error_stack).toBeDefined();
  });

  it('$exception is NOT routed when systemEvents.exception is false (default)', () => {
    const beforeSend = createPostHogBeforeSend(client);
    beforeSend(makeEvent('$exception', { $exception_list: [{ type: 'Error', value: 'boom' }] }));

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('suppressPostHogSend + systemEvents.exception: still calls client.capture() but returns null', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      suppressPostHogSend: true,
      systemEvents: { exception: true },
    });
    const result = beforeSend(makeEvent('$exception', {
      $exception_list: [{ type: 'Error', value: 'boom' }],
    }));

    expect(result).toBeNull();
    expect(client.capture).toHaveBeenCalledWith('$error', expect.any(Object));
  });

  // -------------------------------------------------------------------------
  // systemEvents.forward
  // -------------------------------------------------------------------------

  it('systemEvents.forward: forwards $web_vitals via client.capture()', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { forward: ['$web_vitals'] },
    });
    beforeSend(makeEvent('$web_vitals', { CLS: 0.1 }));

    expect(client.capture).toHaveBeenCalledWith('$web_vitals', { CLS: 0.1 });
  });

  it('systemEvents.forward: does NOT forward unlisted system events ($autocapture)', () => {
    const beforeSend = createPostHogBeforeSend(client, {
      systemEvents: { forward: ['$web_vitals'] },
    });
    beforeSend(makeEvent('$autocapture', { el: 'button' }));

    expect(client.capture).not.toHaveBeenCalled();
  });
});
