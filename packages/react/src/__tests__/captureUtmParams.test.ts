// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { captureUtmParams } from '../captureUtmParams.js';

function makeClient(): Pick<ISunglassesClient, 'register'> {
  return { register: vi.fn() };
}

describe('captureUtmParams', () => {
  const originalLocation = window.location;

  afterEach(() => {
    // Restore window.location after each test
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  function setUrl(url: string) {
    Object.defineProperty(window, 'location', {
      value: new URL(url),
      writable: true,
    });
  }

  it('registers utm_source, utm_medium, utm_campaign when present', () => {
    setUrl('https://app.example.com/home?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale');
    const client = makeClient();
    captureUtmParams(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'spring_sale',
      })
    );
  });

  it('registers all five utm params when all are present', () => {
    setUrl('https://app.example.com/?utm_source=nl&utm_medium=email&utm_campaign=q4&utm_content=banner&utm_term=analytics');
    const client = makeClient();
    captureUtmParams(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'nl',
      utm_medium: 'email',
      utm_campaign: 'q4',
      utm_content: 'banner',
      utm_term: 'analytics',
    });
  });

  it('only registers params that are present in the URL', () => {
    setUrl('https://app.example.com/?utm_source=twitter');
    const client = makeClient();
    captureUtmParams(client as unknown as ISunglassesClient);

    const call = vi.mocked(client.register).mock.calls[0][0];
    expect(call).toHaveProperty('utm_source', 'twitter');
    expect(call).not.toHaveProperty('utm_medium');
    expect(call).not.toHaveProperty('utm_campaign');
  });

  it('captures $referrer and $referring_domain from document.referrer', () => {
    setUrl('https://app.example.com/signup');
    Object.defineProperty(document, 'referrer', {
      value: 'https://blog.acme.com/post/analytics',
      writable: true,
      configurable: true,
    });

    const client = makeClient();
    captureUtmParams(client as unknown as ISunglassesClient);

    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({
        $referrer: 'https://blog.acme.com/post/analytics',
        $referring_domain: 'blog.acme.com',
      })
    );

    Object.defineProperty(document, 'referrer', { value: '', writable: true, configurable: true });
  });

  it('does not call register when no utm params and no referrer', () => {
    setUrl('https://app.example.com/dashboard');
    Object.defineProperty(document, 'referrer', { value: '', writable: true, configurable: true });

    const client = makeClient();
    captureUtmParams(client as unknown as ISunglassesClient);

    expect(client.register).not.toHaveBeenCalled();
  });

  it('is a no-op when window is undefined (SSR)', () => {
    const savedWindow = (globalThis as Record<string, unknown>)['window'];
    (globalThis as Record<string, unknown>)['window'] = undefined;

    try {
      const client = makeClient();
      // Should not throw
      expect(() => captureUtmParams(client as unknown as ISunglassesClient)).not.toThrow();
      expect(client.register).not.toHaveBeenCalled();
    } finally {
      (globalThis as Record<string, unknown>)['window'] = savedWindow;
    }
  });
});
