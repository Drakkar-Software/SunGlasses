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
} from '@drakkar.software/sunglasses-core';
export { SunglassesCore, captureException, patchConsole } from '@drakkar.software/sunglasses-core';
