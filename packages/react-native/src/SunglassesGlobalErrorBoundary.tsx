import React, { useContext } from 'react';
import type {
  ISunglassesClient,
  CaptureExceptionOptions,
  GlobalErrorInfo,
} from '@drakkar.software/sunglasses-core';
import { captureException, subscribeGlobalError } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';

export interface SunglassesGlobalErrorBoundaryProps {
  /**
   * SunGlasses client. Optional — defaults to the client provided by the
   * nearest `<SunglassesProvider>`.
   */
  client?: ISunglassesClient;
  /** Rendered when an error is caught. Defaults to rendering nothing. */
  fallback?: React.ReactNode;
  /** Error capture configuration forwarded to `captureException`. */
  config?: CaptureExceptionOptions;
  /**
   * Also render the fallback for non-fatal global errors (e.g. `ErrorUtils`
   * errors reported as non-fatal). Default: `false`.
   */
  includeNonFatalGlobalErrors?: boolean;
  /**
   * Also render the fallback for unhandled promise rejections. Off by default
   * because many apps prefer to surface rejections as toasts or inline errors
   * rather than as a full-screen fallback. Default: `false`.
   */
  includeUnhandledRejections?: boolean;
  children: React.ReactNode;
}

interface InnerProps extends SunglassesGlobalErrorBoundaryProps {
  client: ISunglassesClient;
}

interface State {
  hasError: boolean;
}

class GlobalErrorBoundaryInner extends React.Component<InnerProps, State> {
  state: State = { hasError: false };
  private unsubscribe?: () => void;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidMount(): void {
    this.unsubscribe = subscribeGlobalError((info) => this.handleGlobalError(info));
  }

  componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  componentDidCatch(error: Error): void {
    // Render-phase error: capture it ourselves (handled).
    const { client, config } = this.props;
    captureException(client, error, { handled: true, ...config });
  }

  /**
   * React to a global error published by the provider's auto-capture handlers.
   * The provider already captured it, so we only decide whether to show the
   * fallback — we never re-capture here.
   */
  private handleGlobalError(info: GlobalErrorInfo): void {
    if (this.state.hasError) return;
    const { includeNonFatalGlobalErrors, includeUnhandledRejections } = this.props;

    const shouldShow =
      info.kind === 'rejection'
        ? includeUnhandledRejections === true
        : info.fatal || includeNonFatalGlobalErrors === true;

    if (shouldShow) this.setState({ hasError: true });
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * A superset of `SunglassesErrorBoundary` that renders a fallback UI for fatal
 * non-render errors (uncaught `ErrorUtils` errors and, optionally, unhandled
 * rejections) in addition to the render-phase errors a normal error boundary
 * catches.
 *
 * Render-phase errors are captured here as `$error` events
 * (`$error_handled: true`). Global errors are captured by the provider's
 * `autoCaptureErrors` handlers and merely surfaced here as a fallback — so the
 * global fallback requires `autoCaptureErrors` to be enabled on the
 * `<SunglassesProvider>`. No event is captured twice.
 *
 * @example
 * ```tsx
 * <SunglassesProvider client={client} autoCaptureErrors>
 *   <SunglassesGlobalErrorBoundary fallback={<ErrorScreen />}>
 *     <App />
 *   </SunglassesGlobalErrorBoundary>
 * </SunglassesProvider>
 * ```
 */
export function SunglassesGlobalErrorBoundary(
  props: SunglassesGlobalErrorBoundaryProps,
): React.ReactElement {
  const contextClient = useContext(SunglassesContext);
  const client = props.client ?? contextClient;
  if (client === null) {
    throw new Error(
      '[SunGlasses] <SunglassesGlobalErrorBoundary> must be inside a <SunglassesProvider> or receive a `client` prop.'
    );
  }
  return <GlobalErrorBoundaryInner {...props} client={client} />;
}
