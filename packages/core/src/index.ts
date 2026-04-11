// Core engine
export { SunglassesCore } from './SunglassesCore.js';

// Middleware
export { PiiSanitizer } from './PiiSanitizer.js';
export { MiddlewarePipeline } from './MiddlewarePipeline.js';

// Built-in optional middleware
export { FrequencyMiddleware } from './middleware/FrequencyMiddleware.js';
export type { FrequencyMiddlewareOptions } from './middleware/FrequencyMiddleware.js';
export { SamplingMiddleware } from './middleware/SamplingMiddleware.js';
export type { SamplingMiddlewareOptions } from './middleware/SamplingMiddleware.js';

// Internal subsystems (exported for advanced use / adapter authoring)
export { ConsentManager } from './ConsentManager.js';
export { IdentityManager } from './IdentityManager.js';
export { EventQueue } from './EventQueue.js';
export { EventCounter } from './EventCounter.js';
export { SessionManager } from './SessionManager.js';
export { TraitManager } from './TraitManager.js';
export { LocalEventArchive } from './LocalEventArchive.js';

// Type-safe event catalog utility
export { asTyped } from './asTyped.js';

// All public types & interfaces
export type {
  IStorageAdapter,
  IAnalyticsAdapter,
  IMiddleware,
  MiddlewareNext,
  ISunglassesClient,
  ISunglassesTypedClient,
  SunglassesConfig,
  SunglassesEvent,
  EventType,
  EventContext,
  IdentityState,
  ConsentStatus,
  ConsentState,
  ConsentHistoryEntry,
  CleanupConfig,
  HttpAdapterConfig,
  StarfishAdapterConfig,
  ScreenTrackingOptions,
  EventCountPeriod,
  IEventCounter,
  SessionState,
  UserDataExport,
  EventMap,
  ErrorEventProperties,
} from './types.js';

// Utilities (exported for adapter authors)
export { generateUUID, sha256Hex } from './utils/uuid.js';
export { nowISO } from './utils/timestamp.js';
export { createLogger } from './utils/logger.js';
export type { Logger } from './utils/logger.js';
