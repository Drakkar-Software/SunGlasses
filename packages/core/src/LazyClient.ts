import type {
  EventMap,
  ISunglassesClient,
  ISunglassesTypedClient,
  ConsentStatus,
  ConsentHistoryEntry,
  IEventCounter,
  EventCountPeriod,
  CleanupConfig,
  UserDataExport,
} from './types.js';

/**
 * A typed analytics stub that is safe to use before the SDK initialises.
 *
 * All calls are silent no-ops (or safe defaults) until `init()` is called
 * with the real `SunglassesCore` instance. After `init()`, every method
 * delegates to the real client transparently.
 *
 * This is the recommended pattern for module-level analytics singletons:
 *
 * ```typescript
 * // analytics.ts
 * import { createLazyClient, SunglassesCore } from '@drakkar.software/sunglasses-core';
 *
 * type MyEvents = {
 *   button_clicked: { buttonId: string };
 *   page_viewed: undefined;
 * };
 *
 * export const analytics = createLazyClient<MyEvents>();
 *
 * export async function initAnalytics() {
 *   const client = await SunglassesCore.create({ ... });
 *   analytics.init(client);
 *   return client;
 * }
 * ```
 *
 * ```typescript
 * // anywhere else
 * import { analytics } from './analytics';
 *
 * // Safe at import time — noop if called before init(), real event after:
 * analytics.capture('button_clicked', { buttonId: 'cta' }); // ✓ typed
 * analytics.capture('unknown_event', {});                   // ✗ TS error
 * ```
 *
 * ### Why not `Object.assign(stub, asTyped(client))`?
 *
 * `asTyped` returns the client itself. `Object.assign` only copies own
 * enumerable properties — class prototype methods like `capture()` are
 * **not** own properties and are silently skipped. Using `createLazyClient`
 * avoids this footgun entirely.
 */
export function createLazyClient<T extends EventMap>(): ISunglassesTypedClient<T> & {
  /**
   * Wire up the real SDK client.
   * Safe to call multiple times — last call wins.
   * After calling, all subsequent analytics calls delegate to `client`.
   */
  init(client: ISunglassesClient): void;
} {
  let _inner: ISunglassesClient | null = null;

  const lazy: ISunglassesClient & { init(client: ISunglassesClient): void } = {
    init(client) {
      _inner = client;
    },

    // ── Event tracking ────────────────────────────────────────────────────────
    capture(eventName, properties?, options?) {
      _inner?.capture(eventName, properties, options);
    },
    screen(screenName, properties?) {
      _inner?.screen(screenName, properties);
    },
    identify(userId, traits?) {
      _inner?.identify(userId, traits);
    },
    alias(newId, existingId) {
      _inner?.alias(newId, existingId);
    },
    group(groupId, groupTraits?) {
      _inner?.group(groupId, groupTraits);
    },
    async reset() {
      await _inner?.reset();
    },

    // ── Super properties ──────────────────────────────────────────────────────
    register(properties) {
      _inner?.register(properties);
    },
    unregister(...keys) {
      _inner?.unregister(...keys);
    },
    getRegisteredProperties() {
      return _inner?.getRegisteredProperties() ?? {};
    },

    // ── Consent ───────────────────────────────────────────────────────────────
    async optIn() {
      await _inner?.optIn();
    },
    async optOut() {
      await _inner?.optOut();
    },
    hasOptedIn() {
      return _inner?.hasOptedIn() ?? false;
    },
    hasOptedOut() {
      return _inner?.hasOptedOut() ?? false;
    },
    getConsentStatus(): ConsentStatus {
      return _inner?.getConsentStatus() ?? 'unknown';
    },
    getConsentHistory(): ConsentHistoryEntry[] {
      return _inner?.getConsentHistory() ?? [];
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async flush() {
      await _inner?.flush();
    },
    async shutdown() {
      await _inner?.shutdown();
    },

    // ── Event counting ────────────────────────────────────────────────────────
    async getEventCount(eventName: string, period: EventCountPeriod, date?: Date): Promise<number> {
      return _inner?.getEventCount(eventName, period, date) ?? Promise.resolve(0);
    },
    async resetEventCount(eventName?: string) {
      await _inner?.resetEventCount(eventName);
    },
    get eventCounter(): IEventCounter | null {
      return _inner?.eventCounter ?? null;
    },
    getQueuedEventCount() {
      return _inner?.getQueuedEventCount() ?? 0;
    },

    // ── Local archive / data portability ─────────────────────────────────────
    async clearLocalArchive(config?: CleanupConfig) {
      await _inner?.clearLocalArchive(config);
    },
    async exportUserData(): Promise<UserDataExport> {
      return _inner?.exportUserData() ?? {
        exportedAt: new Date().toISOString(),
        anonymousId: '',
        distinctId: null,
        traits: {},
        consentStatus: 'unknown',
        consentHistory: [],
        queuedEvents: [],
        archivedEvents: [],
        eventCountSummary: {},
      };
    },
    async deleteUserData(options?) {
      await _inner?.deleteUserData(options);
    },
  };

  return lazy as ISunglassesTypedClient<T> & { init(client: ISunglassesClient): void };
}
