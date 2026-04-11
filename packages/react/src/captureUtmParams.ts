import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

/**
 * Read UTM attribution parameters from the current URL and register them as
 * super properties on the client.
 *
 * Call this once at app startup, immediately after `SunglassesCore.create()`.
 * The registered properties are automatically merged into every subsequent event
 * until `client.unregister()` or `client.reset()` is called.
 *
 * Captured properties (when present):
 * - `utm_source`         — traffic source (e.g. "google", "newsletter")
 * - `utm_medium`         — marketing channel (e.g. "cpc", "email")
 * - `utm_campaign`       — campaign name (e.g. "spring_sale")
 * - `utm_content`        — ad variant (e.g. "banner_v2")
 * - `utm_term`           — paid search keyword
 * - `$referrer`          — full URL of the referring page
 * - `$referring_domain`  — hostname of the referring page
 *
 * @example
 * ```ts
 * const client = await SunglassesCore.create({ ... });
 * captureUtmParams(client); // call once on initial load
 * ```
 */
export function captureUtmParams(client: ISunglassesClient): void {
  if (typeof window === 'undefined') return;

  const params: Record<string, string> = {};
  const searchParams = new URLSearchParams(window.location.search);

  for (const key of UTM_PARAMS) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }

  if (document.referrer) {
    params['$referrer'] = document.referrer;
    try {
      params['$referring_domain'] = new URL(document.referrer).hostname;
    } catch {
      // Malformed referrer URL — skip the domain extraction
    }
  }

  if (Object.keys(params).length > 0) {
    client.register(params);
  }
}
