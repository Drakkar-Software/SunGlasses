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
   * Include the stack trace in `$error_stack`. Default: `true`.
   * Stack traces may expose internal file paths and function names; set to
   * `false` to disable if your privacy policy requires it.
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
  /**
   * Drop errors with the same fingerprint (name + message + first stack frame)
   * captured within {@link dedupeWindowMs}. This collapses the common
   * double-capture cases — e.g. an error boundary plus `console.error` capture
   * reporting the same render error, or a global handler firing repeatedly for
   * the same throw. The fingerprint deliberately ignores the `handled` flag and
   * `$error_source`, so the first capture wins. Default: `true`.
   */
  dedupe?: boolean;
  /**
   * Time window (ms) used by {@link dedupe}. Identical errors within this window
   * are dropped. Default: `1000`.
   */
  dedupeWindowMs?: number;
  /**
   * React component stack from `errorInfo.componentStack`, set by error
   * boundaries. Emitted as `$error_component_stack`. Framework-set — takes
   * precedence over any value in `properties`.
   */
  componentStack?: string;
  /**
   * Whether the error was fatal (React Native `ErrorUtils` `isFatal`).
   * Emitted as `$error_fatal`. Framework-set — takes precedence over `properties`.
   */
  fatal?: boolean;
  /**
   * Origin of the capture: `'boundary'`, `'global'`, `'rejection'`, or
   * `'console'`. Emitted as `$error_source`. Framework-set — takes precedence
   * over any value in `properties`.
   */
  source?: string;
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
 * Standard Error property keys excluded from `$error_extra` serialization.
 */
const STANDARD_ERROR_KEYS = new Set(['message', 'name', 'stack', 'cause']);

/**
 * Maximum number of custom Error properties collected into `$error_extra`.
 */
const MAX_EXTRA_PROPS = 20;

/**
 * Collect custom enumerable properties off an `Error` instance into a plain
 * object. Only scalar values (string / number / boolean) are included to avoid
 * circular-reference issues and keep the payload small. Returns `undefined`
 * when the error has no relevant custom props.
 */
function extractErrorExtras(
  error: Error,
  maxMessageLength: number,
): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {};
  let count = 0;
  for (const key of Object.getOwnPropertyNames(error)) {
    if (STANDARD_ERROR_KEYS.has(key)) continue;
    if (count >= MAX_EXTRA_PROPS) break;
    const val = (error as unknown as Record<string, unknown>)[key];
    const t = typeof val;
    if (t === 'string') {
      extras[key] = (val as string).slice(0, maxMessageLength);
      count++;
    } else if (t === 'number' || t === 'boolean') {
      extras[key] = val;
      count++;
    }
    // Skip functions, objects, symbols — avoids circular references and noise.
  }
  return count > 0 ? extras : undefined;
}

/**
 * Walk `error.cause` up to `maxDepth` levels and serialize each link as
 * `"Name: message"`, joined by `"\ncaused by: "`. Returns `undefined` when
 * there is no cause chain.
 */
function serializeCauseChain(
  error: unknown,
  maxDepth: number,
  maxMessageLength: number,
): string | undefined {
  if (!(error instanceof Error) || !('cause' in error)) return undefined;
  const parts: string[] = [];
  let current: unknown = (error as { cause: unknown }).cause;
  for (let depth = 0; depth < maxDepth && current != null; depth++) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message.slice(0, maxMessageLength)}`);
      current = 'cause' in current ? (current as { cause: unknown }).cause : undefined;
    } else if (typeof current === 'string') {
      parts.push(current.slice(0, maxMessageLength));
      break;
    } else if (current && typeof current === 'object' && 'message' in current) {
      parts.push(String((current as { message: unknown }).message).slice(0, maxMessageLength));
      break;
    } else {
      parts.push(String(current).slice(0, maxMessageLength));
      break;
    }
  }
  return parts.length > 0 ? parts.join('\ncaused by: ') : undefined;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Per-client store of recently captured error fingerprints to their capture
 * timestamp. A `WeakMap` keyed by the client lets the entries be garbage
 * collected automatically when a client is discarded, and keeps state isolated
 * between clients.
 */
const dedupeStore = new WeakMap<object, Map<string, number>>();

/**
 * Returns `true` when an identical error (same fingerprint) was captured within
 * the window and should be dropped. Otherwise records the fingerprint and
 * returns `false`. Expired entries are pruned on each call.
 */
function isDuplicate(client: object, fingerprint: string, windowMs: number): boolean {
  const now = Date.now();
  let seen = dedupeStore.get(client);
  if (!seen) {
    seen = new Map<string, number>();
    dedupeStore.set(client, seen);
  }
  for (const [fp, ts] of seen) {
    if (now - ts > windowMs) seen.delete(fp);
  }
  const last = seen.get(fingerprint);
  if (last !== undefined && now - last <= windowMs) return true;
  seen.set(fingerprint, now);
  return false;
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
    includeStack = true,
    maxStackFrames = 5,
    maxMessageLength = 200,
    ignorePatterns = [],
    properties,
    beforeCapture,
    dedupe = true,
    dedupeWindowMs = 1000,
    componentStack,
    fatal,
    source,
  } = options;

  const normalized = normalizeError(error);
  const rawMessage = normalized.message;

  if (ignorePatterns.some((p) => p.test(rawMessage))) return;

  if (dedupe) {
    const firstFrame = extractStack(normalized.stack, 1) ?? '';
    const fingerprint = `${normalized.name}|${rawMessage}|${firstFrame}`;
    if (isDuplicate(client, fingerprint, dedupeWindowMs)) return;
  }

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

  // Cause chain — walk error.cause up to 3 levels.
  const cause = serializeCauseChain(error, 3, maxMessageLength);
  if (cause) props = { ...props, $error_cause: cause };

  // Custom enumerable Error props (code, statusCode, etc.).
  if (error instanceof Error) {
    const extra = extractErrorExtras(error, maxMessageLength);
    if (extra) props = { ...props, $error_extra: extra };
  }

  // Framework-set fields — always applied last so they cannot be clobbered
  // by user-provided `properties`.
  if (componentStack) props = { ...props, $error_component_stack: componentStack };
  if (fatal !== undefined) props = { ...props, $error_fatal: fatal };
  if (source) props = { ...props, $error_source: source };

  if (beforeCapture) {
    const transformed = beforeCapture(props);
    if (!transformed) return;
    client.capture('$error', transformed);
  } else {
    client.capture('$error', props);
  }
}
