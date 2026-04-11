export { SunglassesProvider } from './SunglassesProvider.js';
export { captureUtmParams } from './captureUtmParams.js';
export type { SunglassesProviderProps } from './SunglassesProvider.js';
export { useSunglasses } from './context.js';
export { useScreenTracking } from './useScreenTracking.js';
export { useCapture } from './useCapture.js';
export { useConsentStatus } from './useConsentStatus.js';

// Re-export core types for convenience
export type {
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
  ConsentStatus,
  ScreenTrackingOptions,
} from '@sunglasses/core';
export { SunglassesCore } from '@sunglasses/core';
