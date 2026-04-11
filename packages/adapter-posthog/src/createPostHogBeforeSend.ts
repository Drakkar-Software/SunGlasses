import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

// ---------------------------------------------------------------------------
// Minimal PostHog-compatible type definitions
// We define only the fields we need — no posthog-js runtime dependency required.
// These shapes match posthog-js v1.187+ and posthog-react-native (posthog-js monorepo).
// ---------------------------------------------------------------------------

/** Minimal mirror of the PostHog `CaptureResult` passed to `before_send`. */
interface PostHogLikeEvent {
  event_type: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

type PostHogBeforeSendResult = PostHogLikeEvent | null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
   */
  includeSystemEvents?: boolean;

  /**
   * Explicit list of `event_type` values to skip.
   * Applied before `ignorePatterns`.
   * Example: `['$pageview', '$pageleave']`
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
 * // Mode B — SunGlasses only, PostHog as local capture layer
 * posthog.init(key, {
 *   before_send: createPostHogBeforeSend(sunglassesClient, { suppressPostHogSend: true }),
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
): (event: PostHogLikeEvent) => PostHogBeforeSendResult {
  const {
    suppressPostHogSend = false,
    includeSystemEvents = false,
    ignoreEventTypes = [],
    ignorePatterns = [],
    beforeCapture,
    transformEventName,
  } = config;

  return (event: PostHogLikeEvent): PostHogBeforeSendResult => {
    const result: PostHogBeforeSendResult = suppressPostHogSend ? null : event;

    const name = event.event_type;

    // Filter: system events (start with $) unless opted in
    if (!includeSystemEvents && name.startsWith('$')) return result;
    // Filter: explicit ignore list
    if (ignoreEventTypes.includes(name)) return result;
    // Filter: pattern match
    if (ignorePatterns.some((p) => p.test(name))) return result;

    let props: Record<string, unknown> = { ...event.properties };

    if (beforeCapture) {
      const transformed = beforeCapture(name, props);
      if (transformed === null) return result;
      props = transformed;
    }

    const targetName = transformEventName ? transformEventName(name) : name;
    client.capture(targetName, props);

    return result;
  };
}
