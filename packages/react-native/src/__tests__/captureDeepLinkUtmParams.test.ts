import { describe, it, expect, vi } from 'vitest';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import { captureDeepLinkUtmParams } from '../captureDeepLinkUtmParams.js';

function makeClient(): Pick<ISunglassesClient, 'register'> {
  return { register: vi.fn() };
}

describe('captureDeepLinkUtmParams', () => {
  it('registers utm_source, utm_medium, utm_campaign from an HTTPS universal link', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'https://myapp.com/home?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale'
    );

    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'spring_sale',
      })
    );
  });

  it('registers utm params from a custom scheme deep link', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'myapp://profile/123?utm_source=email&utm_campaign=reengagement'
    );

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'email',
      utm_campaign: 'reengagement',
    });
  });

  it('registers all five utm params when present', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'myapp://home?utm_source=nl&utm_medium=email&utm_campaign=q4&utm_content=banner&utm_term=analytics'
    );

    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'nl',
      utm_medium: 'email',
      utm_campaign: 'q4',
      utm_content: 'banner',
      utm_term: 'analytics',
    });
  });

  it('only includes params that are present in the URL', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'myapp://home?utm_source=push_notification'
    );

    const call = vi.mocked(client.register).mock.calls[0][0];
    expect(call).toHaveProperty('utm_source', 'push_notification');
    expect(call).not.toHaveProperty('utm_medium');
    expect(call).not.toHaveProperty('utm_campaign');
  });

  it('does not call register when no utm params are present', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'myapp://home?ref=sidebar&tab=2'
    );

    expect(client.register).not.toHaveBeenCalled();
  });

  it('does not call register when the URL has no query string', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(client as unknown as ISunglassesClient, 'myapp://home');

    expect(client.register).not.toHaveBeenCalled();
  });

  it('strips URL fragments so they do not corrupt param values', () => {
    const client = makeClient();
    captureDeepLinkUtmParams(
      client as unknown as ISunglassesClient,
      'https://myapp.com/promo?utm_source=email&utm_campaign=sale#hero-section'
    );

    // utm_campaign must be "sale", not "sale#hero-section"
    expect(client.register).toHaveBeenCalledWith({
      utm_source: 'email',
      utm_campaign: 'sale',
    });
  });

  it('is a no-op and does not throw for an empty string', () => {
    const client = makeClient();
    expect(() =>
      captureDeepLinkUtmParams(client as unknown as ISunglassesClient, '')
    ).not.toThrow();
    expect(client.register).not.toHaveBeenCalled();
  });
});
