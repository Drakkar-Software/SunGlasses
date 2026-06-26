import type { ISunglassesClient } from './types.js';
import { captureException } from './captureException.js';
import type { CaptureExceptionOptions } from './captureException.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Console methods that can be captured. */
export type ConsoleLevel = 'error' | 'warn';

/**
 * Options for {@link patchConsole}.
 */
export interface ConsoleCaptureOptions {
  /** Console methods to capture. Default: `['error']`. */
  levels?: ConsoleLevel[];
  /**
   * Skip console output whose composed message matches any of these patterns.
   * Pattern is tested against the raw (pre-truncation) message.
   */
  ignorePatterns?: RegExp[];
  /** Truncate the composed message to this many characters. Default: `200`. */
  maxMessageLength?: number;
  /** Include a stack trace in `$error_stack`. Default: `false` (privacy-safe). */
  includeStack?: boolean;
  /** Extra properties merged into every captured `$error` event. */
  properties?: Record<string, unknown>;
}

/**
 * Configuration for the providers' `autoCaptureErrors` option. Extends
 * {@link CaptureExceptionOptions} (applied to unhandled global errors) with
 * toggles for the global handlers and console capture.
 */
export interface AutoCaptureErrorsOptions extends CaptureExceptionOptions {
  /**
   * Install the platform uncaught-error handlers (web `window` `'error'`,
   * React Native `ErrorUtils`). Default: `true`.
   */
  globalHandlers?: boolean;
  /**
   * Capture unhandled promise rejections (web `window` `'unhandledrejection'`,
   * React Native engine-specific rejection tracking). Default: `true`.
   */
  unhandledRejections?: boolean;
  /**
   * Also capture console output as `$error` events. `true` captures
   * `console.error`; pass {@link ConsoleCaptureOptions} to configure levels.
   * Default: off.
   */
  console?: boolean | ConsoleCaptureOptions;
}

const SELF_LOG_PREFIX = '[SunGlasses]';

/** Sentry-compatible severity level for each console method. */
const LEVEL_TO_SEVERITY: Record<ConsoleLevel, string> = {
  error: 'error',
  warn: 'warning',
};

/**
 * Compose a human-readable message from console arguments. Non-string args are
 * stringified; objects fall back to a safe `[object]` token when not
 * JSON-serializable.
 */
function composeMessage(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
      } catch {
        return '[object]';
      }
    })
    .join(' ');
}

/**
 * Patch the global `console` so that `console.error` / `console.warn` (per
 * `levels`) are also captured as SunGlasses `$error` events
 * (`$error_handled: false`, `$error_source: 'console'`).
 *
 * Works identically on web and React Native — both expose a global `console`.
 * The original method is always called first, so logs still appear in the
 * console. Returns an unpatch function that restores the original methods.
 *
 * Guards against infinite recursion: SunGlasses' own logger writes to
 * `console.error`/`console.warn` (prefixed with `[SunGlasses]`), and
 * `client.capture()` may log on failure. A re-entrancy flag plus a prefix skip
 * prevent a capture -> log -> capture loop.
 *
 * @param client - SunGlasses client instance.
 * @param options - Optional capture configuration.
 * @returns A function that restores the original console methods.
 *
 * @example
 * ```ts
 * const unpatch = patchConsole(client, { levels: ['error', 'warn'] });
 * // ... later
 * unpatch();
 * ```
 */
export function patchConsole(
  client: ISunglassesClient,
  options: ConsoleCaptureOptions = {},
): () => void {
  const {
    levels = ['error'],
    ignorePatterns = [],
    maxMessageLength = 200,
    includeStack = false,
    properties,
  } = options;

  const uniqueLevels = Array.from(new Set(levels));
  const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();
  let isCapturing = false;

  for (const level of uniqueLevels) {
    const original = console[level] as (...args: unknown[]) => void;
    originals.set(level, original);

    console[level] = (...args: unknown[]): void => {
      // Always emit the original log first so behaviour is unchanged.
      original.apply(console, args);

      // Re-entrancy guard: bail if we are already inside a capture.
      if (isCapturing) return;

      // Skip our own logs to avoid recursion and self-reporting.
      if (typeof args[0] === 'string' && args[0].startsWith(SELF_LOG_PREFIX)) return;

      const rawMessage = composeMessage(args);
      if (ignorePatterns.some((p) => p.test(rawMessage))) return;

      const errorArg = args.find((a): a is Error => a instanceof Error);

      isCapturing = true;
      try {
        captureException(client, errorArg ?? rawMessage, {
          handled: false,
          level: LEVEL_TO_SEVERITY[level],
          includeStack,
          maxMessageLength,
          properties: { ...properties, $error_source: 'console' },
        });
      } finally {
        isCapturing = false;
      }
    };
  }

  return (): void => {
    for (const [level, original] of originals) {
      console[level] = original as typeof console[typeof level];
    }
  };
}
