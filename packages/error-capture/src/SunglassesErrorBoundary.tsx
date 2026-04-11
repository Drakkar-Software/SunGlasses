import React from 'react';
import type { ISunglassesClient } from '@sunglasses/core';
import type { SentryBridgeConfig } from './createSentryBeforeSend.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  /** SunGlasses client instance that will receive `$error` capture events. */
  client: ISunglassesClient;
  /** Rendered when an error is caught. Defaults to rendering nothing. */
  fallback?: React.ReactNode;
  /**
   * Error capture configuration. Shares the same shape as `SentryBridgeConfig`
   * (minus `suppressSentrySend`, which is not applicable here).
   */
  config?: Pick<
    SentryBridgeConfig,
    'includeStack' | 'maxStackFrames' | 'maxMessageLength' | 'ignorePatterns' | 'beforeCapture'
  >;
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

    let props: Record<string, unknown> = {
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
      props.$error_stack = frames;
    }

    if (beforeCapture) {
      const transformed = beforeCapture(props);
      if (!transformed) return;
      props = transformed;
    }

    client.capture('$error', props);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
