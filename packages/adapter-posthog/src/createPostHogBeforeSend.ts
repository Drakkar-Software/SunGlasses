import type { CaptureEvent, BeforeSendFn } from '@posthog/core';
import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';
import {
  mapPostHogPageview,
  mapPostHogException,
  type MapPostHogExceptionOptions,
} from './mapPostHogEvent.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opt-in routing for PostHog autocaptured system events (`$`-prefixed).
 *
 * By default the bridge drops all system events to keep the SunGlasses event
 * stream clean. Use this block to map specific system events into the
 * SunGlasses taxonomy instead.
 */
export interface PostHogSystemEventConfig extends MapPostHogExceptionOptions {
  /**
   * Route PostHog `$pageview` (web) / `$screen` (React Native) events to
   * `client.screen()`, mapping props to `{ $path, $url, $title?, $referrer? }`.
   *
   * Equivalent to wiring `useScreenTracking` (web) or
   * `useExpoRouterScreenTracking` (RN), but driven by PostHog autocapture.
   *
   * Default: `false`.
   */
  pageview?: boolean;

  /**
   * Route PostHog `$exception` events to `client.capture('$error', props)`,
   * mapping to `ErrorEventProperties` — the same shape as `createSentryBeforeSend`.
   *
   * Requires enabling PostHog exception autocapture:
   * ```ts
   * posthog.init(key, {
   *   capture_exceptions: true,
   *   before_send: createPostHogBeforeSend(client, { systemEvents: { exception: true } }),
   * });
   * ```
   *
   * Default: `false`.
   */
  exception?: boolean;

  /**
   * Other `$`-prefixed PostHog system event names to forward verbatim via
   * `client.capture()`. Useful for events like `'$web_vitals'`,
   * `'$autocapture'`, or `'$pageleave'`.
   *
   * ⚠️ `$autocapture` events capture DOM element content — review PiiSanitizer
   * configuration before enabling in production.
   *
   * Default: `[]`.
   *
   * @example
   * forward: ['$web_vitals', '$pageleave']
   */
  forward?: string[];
}

/**
 * Configuration for the PostHog → SunGlasses bridge.
 */
export interface PostHogBridgeConfig {
  /**
   * Return `null` from `before_send`, preventing PostHog from transmitting the
   * event to its servers. Useful when you want PostHog purely as a local event
   * capture layer with SunGlasses as the sole destination.
   *
   * Default: `false`.
   */
  suppressPostHogSend?: boolean;

  /**
   * Include PostHog auto-captured system events (`$pageview`, `$pageleave`,
   * `$autocapture`, `$identify`, etc.). Default: `false` — only forward
   * user-defined events. Use `client.identify()` directly for identity data.
   *
   * @deprecated Prefer `systemEvents.forward` for explicit opt-in, or
   * `systemEvents.pageview` / `systemEvents.exception` for mapped routing.
   * This option remains for backwards compatibility.
   */
  includeSystemEvents?: boolean;

  /**
   * Opt-in routing for PostHog autocaptured system events (`$`-prefixed).
   * Each field selects a specific behaviour; absent fields default to `false`/`[]`.
   *
   * These options are evaluated **before** `includeSystemEvents`, so
   * `$pageview` and `$exception` are always handled by their dedicated mappers
   * when the relevant flag is set, regardless of `includeSystemEvents`.
   *
   * @example
   * // Use posthog-js as a local-only capture shim — HttpStorageAdapter is the sole sink
   * posthog.init('phc_xxx', {
   *   persistence: 'memory',
   *   capture_exceptions: true,
   *   before_send: createPostHogBeforeSend(client, {
   *     suppressPostHogSend: true,
   *     systemEvents: { pageview: true, exception: true },
   *   }),
   * });
   */
  systemEvents?: PostHogSystemEventConfig;

  /**
   * Explicit list of event names to skip.
   * Applied before `ignorePatterns`.
   * Example: `['survey_shown']`
   */
  ignoreEventTypes?: string[];

  /**
   * Skip events whose name matches any of these patterns.
   */
  ignorePatterns?: RegExp[];

  /**
   * Optional transform applied before `client.capture()`.
   * Return the (possibly modified) props object to capture, or `null` to skip
   * SunGlasses capture (PostHog still receives the event unless
   * `suppressPostHogSend` is also `true`).
   */
  beforeCapture?: (
    eventName: string,
    props: Record<string, unknown>
  ) => Record<string, unknown> | null;

  /**
   * Rename PostHog event names before they reach SunGlasses.
   * Useful when PostHog names differ from your SunGlasses event taxonomy.
   *
   * @example
   * transformEventName: (n) => n.replace(/_/g, ' ')  // 'button_clicked' → 'button clicked'
   */
  transformEventName?: (eventName: string) => string;
}

/**
 * Creates a PostHog `before_send` callback that forwards events to SunGlasses.
 * Works with `posthog-js` (web) and `posthog-react-native` — any PostHog SDK
 * that supports `before_send` (available since posthog-js v1.187.0).
 *
 * @param client - SunGlasses client instance.
 * @param config - Optional bridge configuration.
 *
 * @example
 * ```ts
 * // Mode A — both PostHog and SunGlasses receive events
 * posthog.init(key, {
 *   before_send: createPostHogBeforeSend(sunglassesClient),
 * });
 *
 * // Mode B — SunGlasses only, PostHog as local capture layer, nothing sent to PostHog
 * posthog.init(key, {
 *   persistence: 'memory',
 *   capture_exceptions: true,
 *   before_send: createPostHogBeforeSend(sunglassesClient, {
 *     suppressPostHogSend: true,
 *     systemEvents: { pageview: true, exception: true },
 *   }),
 * });
 * ```
 *
 * @remarks
 * PostHog's `before_send` fires for all event types including `$identify` and
 * `$groupidentify` on web/RN. With `includeSystemEvents: false` (default), these
 * are suppressed. Use `client.identify()` directly for identity data instead.
 */
export function createPostHogBeforeSend(
  client: ISunglassesClient,
  config: PostHogBridgeConfig = {},
): BeforeSendFn {
  const {
    suppressPostHogSend = false,
    includeSystemEvents = false,
    systemEvents,
    ignoreEventTypes = [],
    ignorePatterns = [],
    beforeCapture,
    transformEventName,
  } = config;

  return (event: CaptureEvent | null): CaptureEvent | null => {
    if (!event) return null;

    // Compute the PostHog-side return value upfront — it never changes.
    const result: CaptureEvent | null = suppressPostHogSend ? null : event;

    // The event name is `event.event` in the real PostHog SDK type.
    const name = event.event;
    const props = event.properties ?? {};

    // ------------------------------------------------------------------
    // Mapped system-event routing (evaluated before the generic $ filter)
    // ------------------------------------------------------------------

    // $pageview (web) / $screen (RN) → client.screen()
    if (name === '$pageview' || name === '$screen') {
      if (systemEvents?.pageview) {
        const mapped = mapPostHogPageview(props);
        if (mapped) client.screen(mapped.name, mapped.screenProps);
        return result; // consumed by screen() — don't also forward as generic capture
      }
      // No screen() handler — fall through to generic capture only when opted in.
      if (!includeSystemEvents) return result;
    }

    // $exception → client.capture('$error', ErrorEventProperties)
    if (name === '$exception') {
      if (systemEvents?.exception) {
        const mapped = mapPostHogException(props, {
          includeStack: systemEvents.includeStack,
          maxStackFrames: systemEvents.maxStackFrames,
        });
        if (mapped) client.capture('$error', mapped);
        return result; // consumed by $error capture — don't also forward as generic capture
      }
      // No exception handler — fall through to generic capture only when opted in.
      if (!includeSystemEvents) return result;
    }

    // Other $-prefixed system events: forward verbatim only if explicitly listed
    // or legacy includeSystemEvents is true — then fall through to generic capture.
    if (name.startsWith('$')) {
      if (!systemEvents?.forward?.includes(name) && !includeSystemEvents) return result;
    }

    // ------------------------------------------------------------------
    // Generic user-event (and opted-in system-event) capture path
    // ------------------------------------------------------------------

    // Filter: explicit ignore list
    if (ignoreEventTypes.includes(name)) return result;
    // Filter: pattern match
    if (ignorePatterns.some((p) => p.test(name))) return result;

    let captureProps: Record<string, unknown> = { ...props };

    if (beforeCapture) {
      const transformed = beforeCapture(name, captureProps);
      if (transformed === null) return result;
      captureProps = transformed;
    }

    const targetName = transformEventName ? transformEventName(name) : name;
    client.capture(targetName, captureProps);

    return result;
  };
}
