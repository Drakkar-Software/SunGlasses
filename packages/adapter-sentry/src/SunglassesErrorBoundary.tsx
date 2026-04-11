import React from 'react';
import type { ISunglassesClient, ErrorEventProperties } from '@drakkar.software/sunglasses-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for `SunglassesErrorBoundary`.
 */
export interface ErrorBoundaryConfig {
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
   * Error messages sometimes contain user data.
   */
  maxMessageLength?: number;
  /**
   * Skip errors whose message matches any of these patterns.
   * Pattern is tested against the raw (pre-truncation) message.
   */
  ignorePatterns?: RegExp[];
  /**
   * Optional transform applied before `client.capture()`.
   * Receives typed `ErrorEventProperties`; return a (possibly extended) props
   * object to capture, or `null` to skip capture entirely.
   */
  beforeCapture?: (props: ErrorEventProperties) => Record<string, unknown> | null;
}

interface Props {
  /** SunGlasses client instance that will receive `$error` capture events. */
  client: ISunglassesClient;
  /** Rendered when an error is caught. Defaults to rendering nothing. */
  fallback?: React.ReactNode;
  /** Error capture configuration. */
  config?: ErrorBoundaryConfig;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React error boundary that captures render-phase errors as SunGlasses events.
 *
 * Fires `client.capture('$error', { ..., $error_handled: true })` when a
 * descendant component throws during rendering. Complements the Sentry bridge
 * (which covers unhandled global errors) by catching errors at component
 * boundaries before they propagate to the global handler.
 *
 * @example
 * ```tsx
 * <SunglassesErrorBoundary client={client} fallback={<ErrorPage />}>
 *   <App />
 * </SunglassesErrorBoundary>
 * ```
 */
export class SunglassesErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    const { client, config = {} } = this.props;
    const {
      maxMessageLength = 200,
      maxStackFrames = 5,
      includeStack = false,
      ignorePatterns = [],
      beforeCapture,
    } = config;

    const rawMessage = error.message;
    const message = rawMessage.slice(0, maxMessageLength);

    if (ignorePatterns.some((p) => p.test(rawMessage))) return;

    let props: ErrorEventProperties = {
      $error_message: message,
      $error_type: error.name,
      $error_handled: true,
      $error_level: 'error',
    };

    if (includeStack && error.stack) {
      const frames = error.stack
        .split('\n')
        .filter((line) => line.trim().startsWith('at '))
        .slice(0, maxStackFrames)
        .join('\n');
      props = { ...props, $error_stack: frames };
    }

    if (beforeCapture) {
      const transformed = beforeCapture(props);
      if (!transformed) return;
      client.capture('$error', transformed);
    } else {
      client.capture('$error', props);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
