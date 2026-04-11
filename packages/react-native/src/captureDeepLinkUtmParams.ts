import type { ISunglassesClient } from '@sunglasses/core';

export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

/**
 * Extract UTM attribution parameters from a deep link URL and register them
 * as super properties on the client.
 *
 * Works with both HTTPS universal links (`https://myapp.com/home?utm_source=email`)
 * and custom scheme deep links (`myapp://home?utm_source=email`).
 *
 * No-op if the URL contains no UTM parameters or if the URL cannot be parsed.
 *
 * @param client - The SunGlasses client instance.
 * @param url - The deep link URL to extract UTM params from.
 *
 * @example
 * ```ts
 * // Handle a deep link manually
 * Linking.getInitialURL().then((url) => {
 *   if (url) captureDeepLinkUtmParams(client, url);
 * });
 * ```
 */
export function captureDeepLinkUtmParams(client: ISunglassesClient, url: string): void {
  const params: Record<string, string> = {};
  try {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return;
    // Strip any fragment (#...) before parsing — URLSearchParams has no concept
    // of fragments and would otherwise include them in the last parameter's value.
    let qs = url.slice(queryStart + 1);
    const hashIdx = qs.indexOf('#');
    if (hashIdx !== -1) qs = qs.slice(0, hashIdx);
    const searchParams = new URLSearchParams(qs);
    for (const key of UTM_PARAMS) {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    }
  } catch {
    return;
  }
  if (Object.keys(params).length > 0) {
    client.register(params);
  }
}
