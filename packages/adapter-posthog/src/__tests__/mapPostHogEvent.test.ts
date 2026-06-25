import { describe, it, expect } from 'vitest';
import { mapPostHogPageview, mapPostHogException } from '../mapPostHogEvent.js';

// ---------------------------------------------------------------------------
// mapPostHogPageview
// ---------------------------------------------------------------------------

describe('mapPostHogPageview', () => {
  it('returns null when no name-derivable props are present', () => {
    expect(mapPostHogPageview({})).toBeNull();
    expect(mapPostHogPageview({ $title: 'Home' })).toBeNull();
  });

  it('uses $screen_name for RN $screen events', () => {
    const result = mapPostHogPageview({ $screen_name: 'HomeScreen' });
    expect(result?.name).toBe('HomeScreen');
  });

  it('prefers $pathname over $current_url for the name', () => {
    const result = mapPostHogPageview({
      $pathname: '/dashboard',
      $current_url: 'https://example.com/dashboard',
    });
    expect(result?.name).toBe('/dashboard');
  });

  it('falls back to $current_url when $pathname is absent', () => {
    const result = mapPostHogPageview({ $current_url: 'https://example.com/about' });
    expect(result?.name).toBe('https://example.com/about');
  });

  it('maps $path from $pathname', () => {
    const result = mapPostHogPageview({ $pathname: '/settings' });
    expect(result?.screenProps.$path).toBe('/settings');
  });

  it('extracts $path from $current_url when $pathname absent', () => {
    const result = mapPostHogPageview({ $current_url: 'https://example.com/blog?q=1' });
    expect(result?.screenProps.$path).toBe('/blog');
  });

  it('falls back $path to full $current_url when URL is unparseable', () => {
    const result = mapPostHogPageview({ $current_url: 'not-a-valid-url' });
    expect(result?.screenProps.$path).toBe('not-a-valid-url');
  });

  it('includes $url when $current_url is present', () => {
    const result = mapPostHogPageview({
      $pathname: '/home',
      $current_url: 'https://example.com/home',
    });
    expect(result?.screenProps.$url).toBe('https://example.com/home');
  });

  it('omits $title when not present', () => {
    const result = mapPostHogPageview({ $pathname: '/home' });
    expect(result?.screenProps.$title).toBeUndefined();
  });

  it('includes $title and $referrer when present', () => {
    const result = mapPostHogPageview({
      $pathname: '/home',
      $title: 'Home',
      $referrer: 'https://google.com',
    });
    expect(result?.screenProps.$title).toBe('Home');
    expect(result?.screenProps.$referrer).toBe('https://google.com');
  });
});

// ---------------------------------------------------------------------------
// mapPostHogException
// ---------------------------------------------------------------------------

describe('mapPostHogException', () => {
  it('returns null when $exception_list is absent', () => {
    expect(mapPostHogException({})).toBeNull();
  });

  it('returns null when $exception_list is empty', () => {
    expect(mapPostHogException({ $exception_list: [] })).toBeNull();
  });

  it('maps $error_message, $error_type, $error_level from first item', () => {
    const result = mapPostHogException({
      $exception_list: [{ type: 'TypeError', value: 'Cannot read property' }],
      $exception_level: 'error',
    });
    expect(result?.$error_message).toBe('Cannot read property');
    expect(result?.$error_type).toBe('TypeError');
    expect(result?.$error_level).toBe('error');
  });

  it('defaults $error_type to "Error" and $error_level to "error"', () => {
    const result = mapPostHogException({
      $exception_list: [{ value: 'boom' }],
    });
    expect(result?.$error_type).toBe('Error');
    expect(result?.$error_level).toBe('error');
  });

  it('defaults $error_message to "Unknown error" when value absent', () => {
    const result = mapPostHogException({ $exception_list: [{ type: 'Error' }] });
    expect(result?.$error_message).toBe('Unknown error');
  });

  it('sets $error_handled: false when mechanism.handled is false', () => {
    const result = mapPostHogException({
      $exception_list: [{ value: 'boom', mechanism: { handled: false } }],
    });
    expect(result?.$error_handled).toBe(false);
  });

  it('sets $error_handled: false when mechanism is absent (unhandled default)', () => {
    const result = mapPostHogException({ $exception_list: [{ value: 'boom' }] });
    expect(result?.$error_handled).toBe(false);
  });

  it('sets $error_handled: true when mechanism.handled is true', () => {
    const result = mapPostHogException({
      $exception_list: [{ value: 'boom', mechanism: { handled: true } }],
    });
    expect(result?.$error_handled).toBe(true);
  });

  it('truncates $error_message at 500 chars', () => {
    const longMessage = 'x'.repeat(600);
    const result = mapPostHogException({ $exception_list: [{ value: longMessage }] });
    expect(result?.$error_message.length).toBe(500);
  });

  it('omits $error_stack by default (privacy)', () => {
    const result = mapPostHogException({
      $exception_list: [{ value: 'boom', stacktrace: { frames: [{ filename: 'app.js', lineno: 1 }] } }],
    });
    expect(result?.$error_stack).toBeUndefined();
  });

  it('includes $error_stack when includeStack is true', () => {
    const result = mapPostHogException(
      {
        $exception_list: [{
          value: 'boom',
          stacktrace: { frames: [{ filename: 'app.js', lineno: 10, colno: 5, function: 'handleClick' }] },
        }],
      },
      { includeStack: true },
    );
    expect(result?.$error_stack).toContain('handleClick');
    expect(result?.$error_stack).toContain('app.js:10:5');
  });

  it('respects maxStackFrames, taking the last N (innermost) frames', () => {
    const frames = Array.from({ length: 10 }, (_, i) => ({
      filename: `file${i}.js`, lineno: i, colno: 0, function: `fn${i}`,
    }));
    const result = mapPostHogException(
      { $exception_list: [{ value: 'boom', stacktrace: { frames } }] },
      { includeStack: true, maxStackFrames: 3 },
    );
    const lines = result?.$error_stack?.split('\n') ?? [];
    expect(lines.length).toBe(3);
    // Last 3 frames are fn7, fn8, fn9
    expect(lines[0]).toContain('fn7');
    expect(lines[2]).toContain('fn9');
  });
});
