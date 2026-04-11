export { SunglassesProvider } from './SunglassesProvider.js';
export type { SunglassesProviderProps } from './SunglassesProvider.js';
export { useSunglasses } from './context.js';
export { useExpoRouterScreenTracking } from './useExpoRouterScreenTracking.js';
export { useNavigationScreenTracking } from './useNavigationScreenTracking.js';

// Re-export core types for convenience
export type {
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
  ConsentStatus,
  ScreenTrackingOptions,
} from '@sunglasses/core';
export { SunglassesCore } from '@sunglasses/core';
