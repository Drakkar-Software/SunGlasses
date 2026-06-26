// ---------------------------------------------------------------------------
// Global error bus
// ---------------------------------------------------------------------------

/**
 * Describes a global (non-render) error surfaced by a platform global handler.
 * Published by the providers' auto-capture handlers and consumed by
 * `SunglassesGlobalErrorBoundary` to decide whether to render its fallback UI.
 *
 * The raw `error` reference is forwarded only to in-process subscribers; nothing
 * is persisted, logged, or sent anywhere by the bus itself.
 */
export interface GlobalErrorInfo {
  /** The thrown value (an `Error`, string, or arbitrary object). */
  error: unknown;
  /**
   * Whether the runtime considered the error fatal. Uncaught errors are fatal
   * unless the platform reports otherwise; unhandled promise rejections are
   * non-fatal.
   */
  fatal: boolean;
  /** Whether the error came from an uncaught error or an unhandled rejection. */
  kind: 'error' | 'rejection';
}

/** A subscriber notified for every published {@link GlobalErrorInfo}. */
export type GlobalErrorListener = (info: GlobalErrorInfo) => void;

const listeners = new Set<GlobalErrorListener>();

/**
 * Publish a global error to all current subscribers. Subscriber errors are
 * swallowed so one faulty listener cannot break others or the caller.
 *
 * @param info - The global error descriptor.
 */
export function publishGlobalError(info: GlobalErrorInfo): void {
  for (const listener of listeners) {
    try {
      listener(info);
    } catch {
      // A subscriber must never break the publisher or other subscribers.
    }
  }
}

/**
 * Subscribe to global errors published via {@link publishGlobalError}.
 *
 * @param listener - Called for each published error.
 * @returns An unsubscribe function.
 */
export function subscribeGlobalError(listener: GlobalErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
