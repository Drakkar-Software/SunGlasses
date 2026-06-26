import type { ISunglassesClient, ErrorEventProperties } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for {@link captureException}. Mirrors the privacy-safe defaults used
 * by the error-capturing adapters so behaviour is consistent everywhere.
 */
export interface CaptureExceptionOptions {
  /**
   * Whether the error was handled (caught by an error boundary / try-catch) or
   * unhandled (surfaced by a global error handler). Default: `true`.
   */
  handled?: boolean;
  /** Sentry-compatible severity level. Default: `'error'`. */
  level?: string;
  /**
   * Include the stack trace in `$error_stack`. Default: `false` (privacy-safe).
   * Stack traces may expose internal file paths and function names.
   */
  includeStack?: boolean;
  /**
   * Maximum number of stack frames to include when `includeStack` is `true`.
   * Default: `5`.
   */
  maxStackFrames?: number;
  /**
   * Truncate error messages to this many characters. Default: `200`.
   * Error messages sometimes contain user data ("User foo@bar.com not found").
   */
  maxMessageLength?: number;
  /**
   * Skip errors whose message matches any of these patterns.
   * Pattern is tested against the raw (pre-truncation) message.
   */
  ignorePatterns?: RegExp[];
  /**
   * Extra properties merged into the captured `$error` event. Lower precedence
   * than the computed `$error_*` properties.
   */
  properties?: Record<string, unknown>;
  /**
   * Optional transform applied before `client.capture()`.
   * Receives typed `ErrorEventProperties`; return a (possibly extended) props
   * object to capture, or `null` to skip capture entirely.
   */
  beforeCapture?: (props: ErrorEventProperties) => Record<string, unknown> | null;
}

interface NormalizedError {
  message: string;
  name: string;
  stack?: string;
}

/**
 * Coerce an unknown thrown value into a `{ message, name, stack }` shape.
 * Non-`Error` throws (strings, plain objects, etc.) are stringified.
 */
function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name || 'Error', stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error, name: 'Error' };
  }
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; name?: unknown; stack?: unknown };
    return {
      message: typeof maybe.message === 'string' ? maybe.message : String(error),
      name: typeof maybe.name === 'string' && maybe.name ? maybe.name : 'Error',
      stack: typeof maybe.stack === 'string' ? maybe.stack : undefined,
    };
  }
  return { message: String(error), name: 'Error' };
}

/**
 * Extract up to `maxFrames` of the most relevant frames from a raw stack
 * string. Handles both V8/web (`    at fn (file:line)`) and React Native
 * (`fn@file:line`) stack formats. Returns `undefined` when nothing usable is
 * found.
 */
function extractStack(stack: string | undefined, maxFrames: number): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n').map((l) => l.trim());
  // V8 / web: frames start with "at ".
  const v8Frames = lines.filter((l) => l.startsWith('at '));
  if (v8Frames.length > 0) {
    return v8Frames.slice(0, maxFrames).join('\n');
  }
  // React Native / Hermes: "fn@file:line:col". Drop the leading message line.
  const rnFrames = lines.filter((l) => l.includes('@') && !l.includes(' '));
  if (rnFrames.length > 0) {
    return rnFrames.slice(0, maxFrames).join('\n');
  }
  return undefined;
}

/**
 * Normalize any thrown value into a SunGlasses `$error` event and capture it
 * via `client.capture()`.
 *
 * This is the single source of error-event construction shared by the built-in
 * error boundaries and the provider global error handlers. It never throws and
 * respects consent automatically (capture is consent-gated in the core).
 *
 * @param client - SunGlasses client instance.
 * @param error - The thrown value (an `Error`, string, or arbitrary object).
 * @param options - Optional capture configuration.
 *
 * @example
 * ```ts
 * try {
 *   doRiskyThing();
 * } catch (err) {
 *   captureException(client, err); // $error_handled: true
 * }
 * ```
 */
export function captureException(
  client: ISunglassesClient,
  error: unknown,
  options: CaptureExceptionOptions = {},
): void {
  const {
    handled = true,
    level = 'error',
    includeStack = false,
    maxStackFrames = 5,
    maxMessageLength = 200,
    ignorePatterns = [],
    properties,
    beforeCapture,
  } = options;

  const normalized = normalizeError(error);
  const rawMessage = normalized.message;

  if (ignorePatterns.some((p) => p.test(rawMessage))) return;

  let props: ErrorEventProperties = {
    ...properties,
    $error_message: rawMessage.slice(0, maxMessageLength),
    $error_type: normalized.name,
    $error_handled: handled,
    $error_level: level,
  };

  if (includeStack) {
    const frames = extractStack(normalized.stack, maxStackFrames);
    if (frames) props = { ...props, $error_stack: frames };
  }

  if (beforeCapture) {
    const transformed = beforeCapture(props);
    if (!transformed) return;
    client.capture('$error', transformed);
  } else {
    client.capture('$error', props);
  }
}
