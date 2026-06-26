export { SunglassesProvider } from './SunglassesProvider.js';
export { captureUtmParams } from './captureUtmParams.js';
export type { SunglassesProviderProps } from './SunglassesProvider.js';
export { useSunglasses } from './context.js';
export { useScreenTracking } from './useScreenTracking.js';
export { useCapture } from './useCapture.js';
export { useConsentStatus } from './useConsentStatus.js';
export { SunglassesErrorBoundary } from './SunglassesErrorBoundary.js';
export type { SunglassesErrorBoundaryProps } from './SunglassesErrorBoundary.js';
export { SunglassesGlobalErrorBoundary } from './SunglassesGlobalErrorBoundary.js';
export type { SunglassesGlobalErrorBoundaryProps } from './SunglassesGlobalErrorBoundary.js';

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
