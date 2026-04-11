import type { ISunglassesClient } from '@drakkar.software/sunglasses-core';

// ---------------------------------------------------------------------------
// Minimal Sentry-compatible type definitions
// We define only the fields we need — no @sentry/* runtime dependency required.
// These shapes match @sentry/types v7+ and @sentry/react-native v5+.
// ---------------------------------------------------------------------------

/** Minimal mirror of the Sentry `Event` shape we care about. */
interface SentryLikeEvent {
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
          lineno?: number;
          function?: string;
        }>;
      };
    }>;
  };
  level?: string;
  tags?: Record<string, string | number | boolean>;
}

type SentryBeforeSendResult = SentryLikeEvent | null | Promise<SentryLikeEvent | null>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Configuration for the Sentry → SunGlasses bridge.
 */
export interface SentryBridgeConfig {
  /**
   * Include stack frames in `$error_stack`. Default: `false` (privacy-safe).
   * Stack frames may expose internal file paths and function names.
   */
  includeStack?: boolean;
  /**
   * Maximum number of stack frames to include when `includeStack` is `true`.
   * Default: `5`. Sentry stores frames innermost-last; we take the last N.
   */
  maxStackFrames?: number;
  /**
   * Truncate error messages to this many characters. Default: `200`.
   * Error messages sometimes contain user data ("User foo@bar.com not found").
   */
  maxMessageLength?: number;
  /**
   * Skip errors whose message matches any of these patterns.
   * Matched errors are not captured by SunGlasses (Sentry still receives them).
   */
  ignorePatterns?: RegExp[];
  /**
   * Optional transform applied before `client.capture()`.
   * Return the (possibly modified) props to capture, or `null` to skip.
   */
  beforeCapture?: (props: Record<string, unknown>) => Record<string, unknown> | null;
  /**
   * When `true`, the bridge returns `null` from `beforeSend`, instructing Sentry
   * not to transmit the event to its servers. Useful when you want Sentry purely
   * as a local error capture/parsing engine with no data leaving the device.
   *
   * Compatible with omitting the DSN entirely — Sentry initialises fine without
   * one, still attaches global error handlers, and still fires `beforeSend`.
   *
   * Default: `false`.
   */
  suppressSentrySend?: boolean;
}

/**
 * Creates a Sentry `beforeSend` callback that captures errors as SunGlasses
 * `$error` events. Works with `@sentry/browser`, `@sentry/react`, and
 * `@sentry/react-native` — any Sentry SDK that supports `beforeSend`.
 *
 * @param client - SunGlasses client instance.
 * @param config - Optional bridge configuration.
 * @param originalBeforeSend - Existing `beforeSend` callback to chain after this one.
 *
 * @example
 * ```ts
 * // Mode A — both Sentry and SunGlasses receive errors
 * Sentry.init({
 *   dsn: 'https://...',
 *   beforeSend: createSentryBeforeSend(client),
 * });
 *
 * // Mode B — SunGlasses only, nothing sent to Sentry servers
 * Sentry.init({
 *   beforeSend: createSentryBeforeSend(client, { suppressSentrySend: true }),
 * });
 * ```
 */
export function createSentryBeforeSend(
  client: ISunglassesClient,
  config: SentryBridgeConfig = {},
  originalBeforeSend?: (event: SentryLikeEvent, hint: unknown) => SentryBeforeSendResult,
): (event: SentryLikeEvent, hint: unknown) => SentryBeforeSendResult {
  const {
    includeStack = false,
    maxStackFrames = 5,
    maxMessageLength = 200,
    ignorePatterns = [],
    beforeCapture,
    suppressSentrySend = false,
  } = config;

  return (event: SentryLikeEvent, hint: unknown): SentryBeforeSendResult => {
    // Run the original beforeSend first so Sentry's own processing is unaffected.
    const sentryResult = originalBeforeSend ? originalBeforeSend(event, hint) : event;
    // suppressSentrySend: return null so Sentry does not transmit the event.
    const result = suppressSentrySend ? null : sentryResult;

    const exc = event.exception?.values?.[0];
    const rawMessage = exc?.value ?? '';
    const message = rawMessage.slice(0, maxMessageLength);

    if (!ignorePatterns.some((p) => p.test(rawMessage))) {
      let props: Record<string, unknown> = {
        $error_message: message,
        $error_type: exc?.type ?? 'Error',
        $error_handled: false,
        $error_level: event.level ?? 'error',
      };

      if (includeStack && exc?.stacktrace?.frames) {
        // Sentry stores frames bottom-to-top (outermost first); take the last N
        // to get the innermost (most relevant) frames.
        const frames = exc.stacktrace.frames
          .slice(-maxStackFrames)
          .map((f) => `${f.function ?? '?'} (${f.filename ?? '?'}:${f.lineno ?? '?'})`)
          .join('\n');
        props.$error_stack = frames;
      }

      if (beforeCapture) {
        const transformed = beforeCapture(props);
        if (!transformed) return result;
        props = transformed;
      }

      client.capture('$error', props);
    }

    return result;
  };
}
