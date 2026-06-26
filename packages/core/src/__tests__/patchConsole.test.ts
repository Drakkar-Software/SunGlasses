import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ISunglassesClient } from '../types.js';
import { patchConsole } from '../patchConsole.js';

function makeClient(): { capture: ReturnType<typeof vi.fn> } & Pick<ISunglassesClient, 'capture'> {
  return { capture: vi.fn() };
}

// Always restore console after each test, even if a test forgets to unpatch.
const originalError = console.error;
const originalWarn = console.warn;
afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

describe('patchConsole', () => {
  it('captures console.error as a $error event (handled:false, source console)', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient);

    console.error('something broke');

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'something broke',
      $error_handled: false,
      $error_level: 'error',
      $error_source: 'console',
    }));
    unpatch();
  });

  it('does not capture console.warn unless included in levels', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient); // defaults to ['error']

    console.warn('just a warning');
    expect(client.capture).not.toHaveBeenCalled();
    unpatch();
  });

  it('captures console.warn with warning level when configured', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient, { levels: ['warn'] });

    console.warn('heads up');

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'heads up',
      $error_level: 'warning',
    }));
    unpatch();
  });

  it('preserves an Error argument (type and message)', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient);

    console.error('context:', new TypeError('boom'));

    expect(client.capture).toHaveBeenCalledWith('$error', expect.objectContaining({
      $error_message: 'boom',
      $error_type: 'TypeError',
    }));
    unpatch();
  });

  it('skips messages matching ignorePatterns', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient, {
      ignorePatterns: [/Warning: validateDOMNesting/],
    });

    console.error('Warning: validateDOMNesting(...): <div> cannot appear');
    expect(client.capture).not.toHaveBeenCalled();
    unpatch();
  });

  it('skips our own [SunGlasses]-prefixed logs', () => {
    const client = makeClient();
    const unpatch = patchConsole(client as unknown as ISunglassesClient);

    console.error('[SunGlasses]', '[error]', 'internal log');
    expect(client.capture).not.toHaveBeenCalled();
    unpatch();
  });

  it('does not recurse when capture itself logs to console.error', () => {
    const client = makeClient();
    // Simulate a client whose capture logs an error (as the core logger might).
    client.capture.mockImplementation(() => {
      console.error('failure while capturing');
    });
    const unpatch = patchConsole(client as unknown as ISunglassesClient);

    console.error('trigger');
    // Exactly one capture — the nested console.error is suppressed by the guard.
    expect(client.capture).toHaveBeenCalledTimes(1);
    unpatch();
  });

  it('still calls the original console method', () => {
    const client = makeClient();
    const spy = vi.fn();
    console.error = spy;
    const unpatch = patchConsole(client as unknown as ISunglassesClient);

    console.error('visible');
    expect(spy).toHaveBeenCalledWith('visible');
    unpatch();
    expect(console.error).toBe(spy);
  });

  it('unpatch restores the original methods', () => {
    const client = makeClient();
    const before = console.error;
    const unpatch = patchConsole(client as unknown as ISunglassesClient);
    expect(console.error).not.toBe(before);
    unpatch();
    expect(console.error).toBe(before);
  });
});
