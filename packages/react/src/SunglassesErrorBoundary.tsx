import React, { useContext } from 'react';
import type { ISunglassesClient, CaptureExceptionOptions } from '@drakkar.software/sunglasses-core';
import { captureException } from '@drakkar.software/sunglasses-core';
import { SunglassesContext } from './context.js';

export interface SunglassesErrorBoundaryProps {
  /**
   * SunGlasses client. Optional — defaults to the client provided by the
   * nearest `<SunglassesProvider>`.
   */
  client?: ISunglassesClient;
  /** Rendered when an error is caught. Defaults to rendering nothing. */
  fallback?: React.ReactNode;
  /** Error capture configuration forwarded to `captureException`. */
  config?: CaptureExceptionOptions;
  children: React.ReactNode;
}

interface InnerProps extends SunglassesErrorBoundaryProps {
  client: ISunglassesClient;
}

interface State {
  hasError: boolean;
}

class ErrorBoundaryInner extends React.Component<InnerProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { client, config } = this.props;
    captureException(client, error, {
      handled: true,
      ...config,
      componentStack: errorInfo.componentStack ?? undefined,
      source: 'boundary',
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * React error boundary that captures render-phase errors as SunGlasses
 * `$error` events (`$error_handled: true`).
 *
 * The client is read from the nearest `<SunglassesProvider>` by default; pass
 * an explicit `client` prop to override (e.g. when used outside the provider).
 *
 * @example
 * ```tsx
 * <SunglassesProvider client={client}>
 *   <SunglassesErrorBoundary fallback={<ErrorPage />}>
 *     <App />
 *   </SunglassesErrorBoundary>
 * </SunglassesProvider>
 * ```
 */
export function SunglassesErrorBoundary(props: SunglassesErrorBoundaryProps): React.ReactElement {
  const contextClient = useContext(SunglassesContext);
  const client = props.client ?? contextClient;
  if (client === null) {
    throw new Error(
      '[SunGlasses] <SunglassesErrorBoundary> must be inside a <SunglassesProvider> or receive a `client` prop.'
    );
  }
  return <ErrorBoundaryInner {...props} client={client} />;
}
