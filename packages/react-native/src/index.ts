export { SunglassesProvider } from './SunglassesProvider.js';
export type { SunglassesProviderProps } from './SunglassesProvider.js';
export { useSunglasses } from './context.js';
export { useExpoRouterScreenTracking } from './useExpoRouterScreenTracking.js';
export { useNavigationScreenTracking } from './useNavigationScreenTracking.js';
export { captureDeepLinkUtmParams } from './captureDeepLinkUtmParams.js';
export { useLinkingUtmCapture } from './useLinkingUtmCapture.js';
export { useExpoRouterUtmCapture } from './useExpoRouterUtmCapture.js';
export { SunglassesErrorBoundary } from './SunglassesErrorBoundary.js';
export type { SunglassesErrorBoundaryProps } from './SunglassesErrorBoundary.js';
export { SunglassesGlobalErrorBoundary } from './SunglassesGlobalErrorBoundary.js';
export type { SunglassesGlobalErrorBoundaryProps } from './SunglassesGlobalErrorBoundary.js';
export { wrapExpoRouterErrorBoundary } from './wrapExpoRouterErrorBoundary.js';
export type {
  ExpoRouterErrorBoundaryProps,
  WrapExpoRouterErrorBoundaryOptions,
} from './wrapExpoRouterErrorBoundary.js';
export { attachUnhandledRejectionHandler } from './unhandledRejections.js';

// Re-export core types for convenience
export type {
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
  ConsentStatus,
  ScreenTrackingOptions,
  CaptureExceptionOptions,
  ConsoleCaptureOptions,
  AutoCaptureErrorsOptions,
  GlobalErrorInfo,
  GlobalErrorListener,
} from '@drakkar.software/sunglasses-core';
export {
  SunglassesCore,
  captureException,
  patchConsole,
  publishGlobalError,
  subscribeGlobalError,
} from '@drakkar.software/sunglasses-core';
