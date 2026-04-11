// Core engine
export { SunglassesCore } from './SunglassesCore.js';

// Middleware
export { PiiSanitizer } from './PiiSanitizer.js';
export { MiddlewarePipeline } from './MiddlewarePipeline.js';

// Internal subsystems (exported for advanced use / adapter authoring)
export { ConsentManager } from './ConsentManager.js';
export { IdentityManager } from './IdentityManager.js';
export { EventQueue } from './EventQueue.js';

// All public types & interfaces
export type {
  IStorageAdapter,
  IAnalyticsAdapter,
  IMiddleware,
  MiddlewareNext,
  ISunglassesClient,
  SunglassesConfig,
  SunglassesEvent,
  EventType,
  EventContext,
  IdentityState,
  ConsentStatus,
  ConsentState,
  HttpAdapterConfig,
  StarfishAdapterConfig,
  ScreenTrackingOptions,
} from './types.js';

// Utilities (exported for adapter authors)
export { generateUUID, sha256Hex } from './utils/uuid.js';
export { nowISO } from './utils/timestamp.js';
export { createLogger } from './utils/logger.js';
export type { Logger } from './utils/logger.js';
