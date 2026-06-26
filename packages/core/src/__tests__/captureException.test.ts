import { describe, it, expect, vi } from 'vitest';
import type { ISunglassesClient } from '../types.js';
import { captureException } from '../captureException.js';

/** Minimal client stub exposing only what captureException touches. */
function makeClient(): { capture: ReturnType<typeof vi.fn> } & Pick<ISunglassesClient, 'capture'> {
  return { capture: vi.fn() };
}

describe('captureException', () => {
  it('captures an Error as a $error event with handled=true by default', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new TypeError('Boom'));

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'Boom',
      $error_type: 'TypeError',
      $error_handled: true,
      $error_level: 'error',
    }));
  });

  it('respects the handled option', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('Nope'), { handled: false });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_handled: false,
    }));
  });

  it('normalizes a string throw', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, 'just a string');

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'just a string',
      $error_type: 'Error',
    }));
  });

  it('normalizes a non-Error object', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, { message: 'obj msg', name: 'CustomError' });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'obj msg',
      $error_type: 'CustomError',
    }));
  });

  it('truncates the message to maxMessageLength', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('x'.repeat(500)), {
      maxMessageLength: 10,
    });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect((props.$error_message as string).length).toBe(10);
  });

  it('skips capture when the raw message matches an ignorePattern', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('database connection refused'), {
      maxMessageLength: 5,
      ignorePatterns: [/database connection/],
    });

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('omits the stack by default', () => {
    const client = makeClient();
    const err = new Error('with stack');
    err.stack = 'Error: with stack\n    at foo (file.js:1:1)';
    captureException(client as unknown as ISunglassesClient, err);

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_stack).toBeUndefined();
  });

  it('includes a truncated stack when includeStack is true (V8 format)', () => {
    const client = makeClient();
    const err = new Error('with stack');
    err.stack = [
      'Error: with stack',
      '    at foo (file.js:1:1)',
      '    at bar (file.js:2:2)',
      '    at baz (file.js:3:3)',
    ].join('\n');
    captureException(client as unknown as ISunglassesClient, err, { includeStack: true, maxStackFrames: 2 });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_stack).toBe('at foo (file.js:1:1)\nat bar (file.js:2:2)');
  });

  it('includes a stack in React Native (Hermes) format', () => {
    const client = makeClient();
    const err = new Error('rn stack');
    err.stack = ['rn stack', 'foo@file.js:1:1', 'bar@file.js:2:2'].join('\n');
    captureException(client as unknown as ISunglassesClient, err, { includeStack: true });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_stack).toBe('foo@file.js:1:1\nbar@file.js:2:2');
  });

  it('merges extra properties (lower precedence than computed props)', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      properties: { source: 'manual', $error_type: 'ShouldBeOverridden' },
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      source: 'manual',
      $error_type: 'Error',
    }));
  });

  it('applies beforeCapture transform', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      beforeCapture: (props) => ({ ...props, tagged: true }),
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({ tagged: true }));
  });

  it('skips capture when beforeCapture returns null', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      beforeCapture: () => null,
    });

    expect(client.capture).not.toHaveBeenCalled();
  });
});

describe('captureException deduplication', () => {
  it('drops an identical error captured within the window (same error reaching two paths)', () => {
    const client = makeClient();
    const err = new Error('dup');
    captureException(client as unknown as ISunglassesClient, err);
    captureException(client as unknown as ISunglassesClient, err);

    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it('does not collapse the handled flag — first capture wins regardless', () => {
    const client = makeClient();
    const err = new Error('dup');
    captureException(client as unknown as ISunglassesClient, err, { handled: true });
    captureException(client as unknown as ISunglassesClient, err, { handled: false });

    expect(client.capture).toHaveBeenCalledTimes(1);
    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_handled: true,
    }));
  });

  it('captures distinct errors', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('a'));
    captureException(client as unknown as ISunglassesClient, new Error('b'));

    expect(client.capture).toHaveBeenCalledTimes(2);
  });

  it('captures duplicates when dedupe is disabled', () => {
    const client = makeClient();
    const err = new Error('dup');
    captureException(client as unknown as ISunglassesClient, err, { dedupe: false });
    captureException(client as unknown as ISunglassesClient, err, { dedupe: false });

    expect(client.capture).toHaveBeenCalledTimes(2);
  });

  it('isolates dedupe state per client', () => {
    const a = makeClient();
    const b = makeClient();
    const err = new Error('same');
    captureException(a as unknown as ISunglassesClient, err);
    captureException(b as unknown as ISunglassesClient, err);

    expect(a.capture).toHaveBeenCalledTimes(1);
    expect(b.capture).toHaveBeenCalledTimes(1);
  });

  it('re-captures an identical error after the dedupe window elapses', () => {
    vi.useFakeTimers();
    try {
      const client = makeClient();
      const err = new Error('windowed');
      captureException(client as unknown as ISunglassesClient, err, { dedupeWindowMs: 1000 });
      vi.advanceTimersByTime(1500);
      captureException(client as unknown as ISunglassesClient, err, { dedupeWindowMs: 1000 });

      expect(client.capture).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
