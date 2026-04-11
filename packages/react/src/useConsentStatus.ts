import type { ConsentStatus } from '@sunglasses/core';
import { useSunglasses } from './context.js';

/**
 * Returns the current consent status as a snapshot.
 *
 * This is a convenience hook over `useSunglasses().getConsentStatus()`.
 *
 * **Important:** this hook returns a snapshot at render time and does not
 * subscribe to future changes. Re-renders are not triggered automatically
 * when `optIn()` or `optOut()` are called. If you need the UI to react to
 * consent changes, lift the consent call into a parent component that also
 * manages re-render state, or call `useSunglasses()` directly.
 *
 * @example
 * ```tsx
 * function ConsentBanner() {
 *   const status = useConsentStatus();
 *   if (status !== 'unknown') return null;
 *   return <Banner />;
 * }
 * ```
 */
export function useConsentStatus(): ConsentStatus {
  const client = useSunglasses();
  return client.getConsentStatus();
}
