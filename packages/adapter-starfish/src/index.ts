export { StarfishAnalyticsAdapter } from './StarfishAnalyticsAdapter.js';
export {
  createEmptyDocument,
  mergeEvents,
  pruneDocument,
  resolveStoragePath,
} from './StarfishEventMapper.js';
export type { StarfishEventDocument } from './StarfishEventMapper.js';

// Re-export config type for convenience
export type { StarfishAdapterConfig, CleanupConfig } from '@drakkar.software/sunglasses-core';
