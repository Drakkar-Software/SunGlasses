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

  it('includes the stack by default (V8 format)', () => {
    const client = makeClient();
    const err = new Error('with stack');
    err.stack = 'Error: with stack\n    at foo (file.js:1:1)';
    captureException(client as unknown as ISunglassesClient, err);

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_stack).toBe('at foo (file.js:1:1)');
  });

  it('omits the stack when includeStack is false', () => {
    const client = makeClient();
    const err = new Error('with stack');
    err.stack = 'Error: with stack\n    at foo (file.js:1:1)';
    captureException(client as unknown as ISunglassesClient, err, { includeStack: false });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_stack).toBeUndefined();
  });

  it('respects maxStackFrames when includeStack is true (V8 format)', () => {
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

describe('captureException — new metadata fields', () => {
  it('captures $error_component_stack from options', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('render error'), {
      componentStack: '\n    at Button\n    at App',
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_component_stack: '\n    at Button\n    at App',
    }));
  });

  it('framework componentStack overrides any value in properties', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      properties: { $error_component_stack: 'from-props' },
      componentStack: 'from-framework',
    });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_component_stack).toBe('from-framework');
  });

  it('captures $error_fatal from options', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('crash'), {
      fatal: true,
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_fatal: true,
    }));
  });

  it('captures $error_fatal: false', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('non-fatal'), {
      fatal: false,
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_fatal: false,
    }));
  });

  it('omits $error_fatal when not provided', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'));

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_fatal).toBeUndefined();
  });

  it('captures $error_source from options', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      source: 'global',
    });

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_source: 'global',
    }));
  });

  it('framework source overrides any $error_source in properties', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('e'), {
      properties: { $error_source: 'from-props' },
      source: 'boundary',
    });

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_source).toBe('boundary');
  });

  it('captures $error_cause for a single-level cause', () => {
    const client = makeClient();
    const cause = new TypeError('root cause');
    const error = new Error('outer');
    (error as Error & { cause: unknown }).cause = cause;
    captureException(client as unknown as ISunglassesClient, error);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_cause: 'TypeError: root cause',
    }));
  });

  it('captures a multi-level cause chain joined with "caused by:"', () => {
    const client = makeClient();
    const root = new RangeError('range issue');
    const mid = new Error('middle');
    (mid as Error & { cause: unknown }).cause = root;
    const outer = new Error('outer');
    (outer as Error & { cause: unknown }).cause = mid;
    captureException(client as unknown as ISunglassesClient, outer);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_cause: 'Error: middle\ncaused by: RangeError: range issue',
    }));
  });

  it('handles a string cause', () => {
    const client = makeClient();
    const error = new Error('outer');
    (error as Error & { cause: unknown }).cause = 'string cause';
    captureException(client as unknown as ISunglassesClient, error);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_cause: 'string cause',
    }));
  });

  it('omits $error_cause when there is no cause', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('no cause'));

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_cause).toBeUndefined();
  });

  it('omits $error_cause for non-Error throws', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, 'just a string');

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_cause).toBeUndefined();
  });

  it('captures custom Error properties in $error_extra', () => {
    const client = makeClient();
    const err = new Error('api error') as Error & { code: number; statusCode: number };
    err.code = 42;
    err.statusCode = 404;
    captureException(client as unknown as ISunglassesClient, err);

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_extra: expect.objectContaining({ code: 42, statusCode: 404 }),
    }));
  });

  it('excludes standard Error keys from $error_extra', () => {
    const client = makeClient();
    const err = new Error('e') as Error & { custom: string };
    err.custom = 'yes';
    captureException(client as unknown as ISunglassesClient, err);

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    const extra = props.$error_extra as Record<string, unknown> | undefined;
    expect(extra).toBeDefined();
    expect(Object.keys(extra!)).not.toContain('message');
    expect(Object.keys(extra!)).not.toContain('name');
    expect(Object.keys(extra!)).not.toContain('stack');
    expect(extra!.custom).toBe('yes');
  });

  it('omits $error_extra when the Error has no custom props', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, new Error('plain'));

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_extra).toBeUndefined();
  });

  it('omits $error_extra for non-Error throws', () => {
    const client = makeClient();
    captureException(client as unknown as ISunglassesClient, 'just a string');

    const props = client.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(props.$error_extra).toBeUndefined();
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
