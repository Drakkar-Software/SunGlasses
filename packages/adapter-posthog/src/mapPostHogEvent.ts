import type { CaptureEvent, PostHogEventProperties } from '@posthog/core';
import type { ErrorEventProperties } from '@drakkar.software/sunglasses-core';

// ---------------------------------------------------------------------------
// Internal PostHog exception types (not exported from @posthog/core main entry)
// These shapes match the $exception_list items that posthog-js emits.
// ---------------------------------------------------------------------------

interface PostHogExceptionFrame {
  filename?: string;
  lineno?: number;
  colno?: number;
  function?: string;
}

interface PostHogExceptionItem {
  type?: string;
  value?: string;
  mechanism?: { handled?: boolean };
  stacktrace?: { frames?: PostHogExceptionFrame[] };
}

// Convenience alias for the real PostHog properties map
type PostHogProps = NonNullable<CaptureEvent['properties']> & PostHogEventProperties;

// ---------------------------------------------------------------------------
// Mapper options
// ---------------------------------------------------------------------------

/**
 * Options for `mapPostHogException`.
 */
export interface MapPostHogExceptionOptions {
  /** Include stack frames as `$error_stack`. Default: `false` (privacy). */
  includeStack?: boolean;
  /** Maximum number of stack frames to include. Default: `5`. */
  maxStackFrames?: number;
}

// ---------------------------------------------------------------------------
// Pageview mapper
// ---------------------------------------------------------------------------

/**
 * Maps a PostHog `$pageview` (web) or `$screen` (React Native) event's
 * properties to the `client.screen()` arguments that SunGlasses expects.
 *
 * The returned `screenProps` contains the same keys that `useScreenTracking`
 * (web) and `useExpoRouterScreenTracking` / `useNavigationScreenTracking` (RN)
 * already produce, so downstream storage and adapters see an identical shape.
 *
 * Returns `null` if a screen name cannot be derived.
 *
 * @param props - The `properties` field of the PostHog `$pageview` / `$screen` event.
 */
export function mapPostHogPageview(
  props: PostHogProps,
): { name: string; screenProps: Record<string, unknown> } | null {
  // Priority: RN $screen_name > web $pathname > full $current_url
  const name =
    (props.$screen_name as string | undefined) ??
    (props.$pathname as string | undefined) ??
    (props.$current_url as string | undefined);

  if (!name) return null;

  const screenProps: Record<string, unknown> = {};

  // $path — prefer the explicit pathname; fall back to extracting it from the full URL
  if (typeof props.$pathname === 'string') {
    screenProps.$path = props.$pathname;
  } else if (typeof props.$current_url === 'string') {
    try {
      screenProps.$path = new URL(props.$current_url as string).pathname;
    } catch {
      screenProps.$path = props.$current_url;
    }
  }

  if (typeof props.$current_url === 'string') screenProps.$url = props.$current_url;
  if (typeof props.$title === 'string') screenProps.$title = props.$title;
  if (typeof props.$referrer === 'string') screenProps.$referrer = props.$referrer;

  return { name, screenProps };
}

// ---------------------------------------------------------------------------
// Exception mapper
// ---------------------------------------------------------------------------

/**
 * Maps a PostHog `$exception` event's properties to SunGlasses'
 * `ErrorEventProperties` shape — the same schema emitted by
 * `createSentryBeforeSend` and `SunglassesErrorBoundary`.
 *
 * PostHog exception events carry exception data in `$exception_list`
 * (array of `{ type, value, mechanism, stacktrace }`). The first item is used.
 *
 * Returns `null` if no exception data can be extracted from the properties.
 *
 * @param props - The `properties` field of the PostHog `$exception` event.
 * @param options - Optional stack-capture settings.
 */
export function mapPostHogException(
  props: PostHogProps,
  options: MapPostHogExceptionOptions = {},
): ErrorEventProperties | null {
  const { includeStack = false, maxStackFrames = 5 } = options;

  const list = props.$exception_list as PostHogExceptionItem[] | undefined;
  const first = Array.isArray(list) && list.length > 0 ? list[0] : undefined;

  if (!first) return null;

  const message = (first.value ?? 'Unknown error').slice(0, 500);
  const type = first.type ?? 'Error';
  const level = (props.$exception_level as string | undefined) ?? 'error';
  // mechanism.handled: false (or undefined) = unhandled (window.onerror / unhandledrejection)
  // This mirrors createSentryBeforeSend's behaviour which also defaults to false.
  const handled = first.mechanism?.handled === true;

  const result: ErrorEventProperties = {
    $error_message: message,
    $error_type: type,
    $error_handled: handled,
    $error_level: level,
  };

  if (includeStack && first.stacktrace?.frames) {
    // PostHog stores frames oldest-first; take the last N (most recent / innermost)
    const frames = first.stacktrace.frames.slice(-maxStackFrames);
    result.$error_stack = frames
      .map(
        (f) =>
          `at ${f.function ?? '<anonymous>'} (${f.filename ?? '?'}:${f.lineno ?? 0}:${f.colno ?? 0})`,
      )
      .join('\n');
  }

  return result;
}
