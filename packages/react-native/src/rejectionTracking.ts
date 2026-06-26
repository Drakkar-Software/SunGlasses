/**
 * Thin compatibility shim for React Native's bundled promise rejection tracker
 * (`promise/setimmediate/rejection-tracking`).
 *
 * Isolates the optional `require()` call behind a static import boundary so
 * tests can replace this entire module via vi.mock without intercepting dynamic
 * require() calls. Exports `null` when the tracker is unavailable — callers must
 * check before use and fall back to a global handler.
 */

export interface RejectionTracking {
  enable: (options: {
    allRejections?: boolean;
    onUnhandled?: (id: unknown, error: unknown) => void;
    onHandled?: (id: unknown) => void;
  }) => void;
  disable?: () => void;
}

let _tracking: RejectionTracking | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const required = require('promise/setimmediate/rejection-tracking') as
    | RejectionTracking
    | { default: RejectionTracking };
  const resolved = (required as { default?: RejectionTracking }).default ?? (required as RejectionTracking);
  if (resolved && typeof resolved.enable === 'function') {
    _tracking = resolved;
  }
} catch {
  // Tracker not available — callers fall back to a global handler.
}

export const rejectionTracking: RejectionTracking | null = _tracking;
