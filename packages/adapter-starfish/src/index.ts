export { StarfishAnalyticsAdapter } from './StarfishAnalyticsAdapter.js';
export {
  createEmptyDocument,
  mergeEvents,
  resolveStoragePath,
} from './StarfishEventMapper.js';
export type { StarfishEventDocument } from './StarfishEventMapper.js';

// Re-export config type for convenience
export type { StarfishAdapterConfig } from '@sunglasses/core';
