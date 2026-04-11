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

function makeEvent(eventType: string, properties: Record<string, unknown> = {}) {
  return { event_type: eventType, properties, timestamp: '2024-01-01T00:00:00.000Z' };
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

  it('forwards system events when includeSystemEvents is true', () => {
    const beforeSend = createPostHogBeforeSend(client, { includeSystemEvents: true });
    beforeSend(makeEvent('$pageview', { url: '/home' }));

    expect(client.capture).toHaveBeenCalledWith('$pageview', { url: '/home' });
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
    beforeSend({ event_type: 'page_loaded' });

    expect(client.capture).toHaveBeenCalledWith('page_loaded', {});
  });
});
