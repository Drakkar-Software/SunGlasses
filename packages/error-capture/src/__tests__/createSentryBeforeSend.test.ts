import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISunglassesClient } from '@sunglasses/core';
import { createSentryBeforeSend } from '../createSentryBeforeSend.js';

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

/** Build a minimal Sentry-like event. */
function makeSentryEvent(message = 'Something went wrong', type = 'TypeError') {
  return {
    exception: {
      values: [
        {
          type,
          value: message,
          stacktrace: {
            frames: [
              { filename: '/app/utils.js', lineno: 10, function: 'doThing' },
              { filename: '/app/main.js', lineno: 42, function: 'main' },
            ],
          },
        },
      ],
    },
    level: 'error' as const,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSentryBeforeSend', () => {
  let client: ISunglassesClient;

  beforeEach(() => {
    client = makeClient();
  });

  it('extracts message and type from the first exception value', () => {
    const beforeSend = createSentryBeforeSend(client);
    beforeSend(makeSentryEvent('Oops', 'RangeError'), null);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Oops',
      $error_type: 'RangeError',
      $error_handled: false,
      $error_level: 'error',
    }));
  });

  it('truncates message to maxMessageLength', () => {
    const long = 'x'.repeat(300);
    const beforeSend = createSentryBeforeSend(client, { maxMessageLength: 50 });
    beforeSend(makeSentryEvent(long), null);

    const [, props] = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect((props.$error_message as string).length).toBe(50);
  });

  it('omits $error_stack by default', () => {
    const beforeSend = createSentryBeforeSend(client);
    beforeSend(makeSentryEvent(), null);

    const [, props] = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(props.$error_stack).toBeUndefined();
  });

  it('includes stack frames when includeStack is true', () => {
    const beforeSend = createSentryBeforeSend(client, { includeStack: true });
    beforeSend(makeSentryEvent(), null);

    const [, props] = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof props.$error_stack).toBe('string');
    expect(props.$error_stack as string).toContain('main');
  });

  it('limits stack frames to maxStackFrames', () => {
    const event = {
      exception: {
        values: [{
          type: 'Error',
          value: 'boom',
          stacktrace: {
            frames: Array.from({ length: 10 }, (_, i) => ({
              filename: `/app/file${i}.js`,
              lineno: i,
              function: `fn${i}`,
            })),
          },
        }],
      },
      level: 'error' as const,
    };
    const beforeSend = createSentryBeforeSend(client, { includeStack: true, maxStackFrames: 3 });
    beforeSend(event, null);

    const [, props] = (client.capture as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    const lines = (props.$error_stack as string).split('\n');
    expect(lines.length).toBe(3);
  });

  it('skips capture when message matches an ignorePattern', () => {
    const beforeSend = createSentryBeforeSend(client, {
      ignorePatterns: [/ResizeObserver/],
    });
    beforeSend(makeSentryEvent('ResizeObserver loop limit exceeded'), null);

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('still returns the event to Sentry when ignorePattern matches', () => {
    const beforeSend = createSentryBeforeSend(client, {
      ignorePatterns: [/ResizeObserver/],
    });
    const event = makeSentryEvent('ResizeObserver loop limit exceeded');
    const result = beforeSend(event, null);

    expect(result).toBe(event);
  });

  it('forwards to originalBeforeSend and returns its result', () => {
    const modifiedEvent = { ...makeSentryEvent(), tags: { env: 'test' } };
    const original = vi.fn(() => modifiedEvent);

    const beforeSend = createSentryBeforeSend(client, {}, original);
    const event = makeSentryEvent();
    const result = beforeSend(event, null);

    expect(original).toHaveBeenCalledWith(event, null);
    expect(result).toBe(modifiedEvent);
    expect(client.capture).toHaveBeenCalledOnce();
  });

  it('applies beforeCapture transform to props', () => {
    const beforeSend = createSentryBeforeSend(client, {
      beforeCapture: (props) => ({ ...props, custom_tag: 'web' }),
    });
    beforeSend(makeSentryEvent(), null);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      custom_tag: 'web',
    }));
  });

  it('skips capture when beforeCapture returns null', () => {
    const beforeSend = createSentryBeforeSend(client, {
      beforeCapture: () => null,
    });
    beforeSend(makeSentryEvent(), null);

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('returns null to Sentry when suppressSentrySend is true', () => {
    const beforeSend = createSentryBeforeSend(client, { suppressSentrySend: true });
    const result = beforeSend(makeSentryEvent(), null);

    expect(result).toBeNull();
  });

  it('still captures to SunGlasses when suppressSentrySend is true', () => {
    const beforeSend = createSentryBeforeSend(client, { suppressSentrySend: true });
    beforeSend(makeSentryEvent('Network error'), null);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Network error',
    }));
  });

  it('suppressSentrySend + ignorePattern: returns null and skips SunGlasses capture', () => {
    const beforeSend = createSentryBeforeSend(client, {
      suppressSentrySend: true,
      ignorePatterns: [/ResizeObserver/],
    });
    const result = beforeSend(makeSentryEvent('ResizeObserver loop limit exceeded'), null);

    expect(result).toBeNull();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('async originalBeforeSend: returns its Promise and still captures synchronously', async () => {
    const modifiedEvent = { ...makeSentryEvent(), tags: { env: 'test' } };
    const original = vi.fn(async () => modifiedEvent);

    const beforeSend = createSentryBeforeSend(client, {}, original);
    const event = makeSentryEvent();
    const result = beforeSend(event, null);

    // capture fires synchronously (does not await originalBeforeSend)
    expect(client.capture).toHaveBeenCalledOnce();
    // returned value is the Promise from originalBeforeSend
    await expect(result).resolves.toBe(modifiedEvent);
  });

  it('handles events with no exception values gracefully', () => {
    const beforeSend = createSentryBeforeSend(client);
    beforeSend({ level: 'error' }, null);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: '',
      $error_type: 'Error',
    }));
  });
});
