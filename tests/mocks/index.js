/**
 * @fileoverview Mocks centralizados para testing
 * Siguiendo principios de Clean Architecture y DDD
 */

export { default as MockLogger } from './MockLogger.js';
export { default as MockConfigurationManager } from './MockConfigurationManager.js';
export { default as MockCacheService } from './MockCacheService.js';
export { default as MockStreamService } from './MockStreamService.js';
export { default as MockMetadataService } from './MockMetadataService.js';
export { default as MockErrorHandler } from './MockErrorHandler.js';
export { default as MockTorrentioClient } from './MockTorrentioClient.js';
export { default as MockDatabase } from './MockDatabase.js';

// Re-exportar utilidades comunes
export * from './mockFactories.js';
export * from './mockData.js';