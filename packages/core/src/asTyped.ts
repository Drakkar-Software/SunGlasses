import type { EventMap, ISunglassesClient, ISunglassesTypedClient } from './types.js';

/**
 * Zero-cost cast that adds compile-time event typing to any ISunglassesClient.
 *
 * Define your event map once, then use it everywhere for type-safe `capture()` calls:
 *
 * ```typescript
 * type MyEvents = {
 *   button_clicked: { buttonId: string; screen: string };
 *   purchase_completed: { itemId: string; amount: number };
 *   page_viewed: undefined; // no required properties
 * };
 *
 * const typed = asTyped<MyEvents>(client);
 *
 * // Compile-time checked:
 * typed.capture('button_clicked', { buttonId: 'cta', screen: 'home' }); // ✓
 * typed.capture('button_clicked', { wrong: 'key' });                    // ✗ type error
 * typed.capture('unknown_event', {});                                   // ✗ type error
 * ```
 *
 * This is a pure type-level operation — there is no runtime overhead.
 * All other client methods (`screen`, `identify`, `flush`, etc.) remain unchanged.
 */
export function asTyped<T extends EventMap>(
  client: ISunglassesClient
): ISunglassesTypedClient<T> {
  return client as ISunglassesTypedClient<T>;
}
