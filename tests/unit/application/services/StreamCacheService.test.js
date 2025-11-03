/**
 * @fileoverview Tests unitarios para StreamCacheService
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamCacheService } from '@/application/services/StreamCacheService.js';
import { MockLogger } from '@/tests/mocks/MockLogger.js';
import { MockConfigurationManager } from '@/tests/mocks/MockConfigurationManager.js';

describe('Application Service: StreamCacheService', () => {
  let service;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockConfig = MockConfigurationManager.create();
    mockLogger = MockLogger.create();

    service = new StreamCacheService(mockConfig, mockLogger);
  });

  describe('Constructor', () => {
    it('should create service with all dependencies', () => {
      expect(service).toBeInstanceOf(StreamCacheService);
    });

    it('should use console as default logger', () => {
      const serviceWithoutLogger = new StreamCacheService(mockConfig);
      expect(serviceWithoutLogger).toBeInstanceOf(StreamCacheService);
    });
  });

  describe('getCacheTTLByType', () => {
    beforeEach(() => {
      mockConfig.get.mockImplementation((key) => {
        const config = {
          'cache.streams.movie.ttl': 3600,
          'cache.streams.series.ttl': 1800,
          'cache.streams.anime.ttl': 2400,
          'cache.streams.tv.ttl': 900,
          'cache.streams.default.ttl': 1200
        };
        return config[key] || 1200;
      });
    });

    it('should return correct TTL for movie content', () => {
      const ttl = service.getCacheTTLByType('imdb', 5);
      expect(ttl).toBe(3600);
    });

    it('should return correct TTL for series content', () => {
      const ttl = service.getCacheTTLByType('imdb', 3);
      expect(ttl).toBe(1800);
    });

    it('should return correct TTL for anime content', () => {
      const ttl = service.getCacheTTLByType('kitsu', 8);
      expect(ttl).toBe(2400);
    });

    it('should return correct TTL for TV content', () => {
      const ttl = service.getCacheTTLByType('tv', 2);
      expect(ttl).toBe(900);
    });

    it('should return default TTL for unknown types', () => {
      const ttl = service.getCacheTTLByType('unknown', 5);
      expect(ttl).toBe(1200);
    });

    it('should handle high stream count with extended TTL', () => {
      const ttl = service.getCacheTTLByType('imdb', 25);
      expect(ttl).toBe(7200); // 3600 * 2 for high stream count
    });

    it('should handle zero stream count', () => {
      const ttl = service.getCacheTTLByType('imdb', 0);
      expect(ttl).toBe(1800); // Half of movie TTL for empty results
    });

    it('should handle negative stream count', () => {
      const ttl = service.getCacheTTLByType('imdb', -1);
      expect(ttl).toBe(1800); // Treated as zero
    });
  });

  describe('createSuccessResponse', () => {
    const sampleStreams = [
      {
        title: 'Test Movie 1080p',
        infoHash: '1234567890abcdef',
        sources: ['tracker:1234567890abcdef']
      },
      {
        title: 'Test Movie 720p',
        infoHash: 'abcdef1234567890',
        sources: ['tracker:abcdef1234567890']
      }
    ];

    beforeEach(() => {
      mockConfig.get.mockImplementation((key) => {
        const config = {
          'cache.streams.movie.ttl': 3600,
          'cache.streams.default.ttl': 1200
        };
        return config[key] || 1200;
      });
    });

    it('should create success response with correct structure', () => {
      const response = service.createSuccessResponse(sampleStreams, 'movie', 'imdb');

      expect(response.streams).toEqual(sampleStreams);
      expect(response.cacheMaxAge).toBe(3600);
      expect(response.staleWhileRevalidate).toBe(1800); // Half of TTL
      expect(response.success).toBe(true);
      expect(response.source).toBe('repository');
      expect(response.streamCount).toBe(2);
      expect(response.timestamp).toBeTypeOf('number');
    });

    it('should handle empty streams array', () => {
      const response = service.createSuccessResponse([], 'movie', 'imdb');

      expect(response.streams).toEqual([]);
      expect(response.streamCount).toBe(0);
      expect(response.cacheMaxAge).toBe(1800); // Reduced TTL for empty results
    });

    it('should handle large stream count with extended cache', () => {
      const largeStreamSet = Array.from({ length: 25 }, (_, i) => ({
        title: `Stream ${i}`,
        infoHash: `hash${i}`,
        sources: [`tracker:hash${i}`]
      }));

      const response = service.createSuccessResponse(largeStreamSet, 'movie', 'imdb');

      expect(response.streamCount).toBe(25);
      expect(response.cacheMaxAge).toBe(7200); // Extended TTL for many streams
    });

    it('should set correct source metadata', () => {
      const response = service.createSuccessResponse(sampleStreams, 'series', 'imdb');

      expect(response.source).toBe('repository');
      expect(response.success).toBe(true);
    });
  });

  describe('createEmptyResponse', () => {
    beforeEach(() => {
      mockConfig.get.mockImplementation((key) => {
        const config = {
          'cache.streams.movie.ttl': 3600,
          'cache.streams.empty.ttl': 300
        };
        return config[key] || 300;
      });
    });

    it('should create empty response with correct structure', () => {
      const response = service.createEmptyResponse('movie', 'imdb', 'No magnets found');

      expect(response.streams).toEqual([]);
      expect(response.success).toBe(true);
      expect(response.message).toBe('No magnets found');
      expect(response.cacheMaxAge).toBe(300);
      expect(response.staleWhileRevalidate).toBe(150);
      expect(response.source).toBe('empty');
      expect(response.streamCount).toBe(0);
    });

    it('should use default message when none provided', () => {
      const response = service.createEmptyResponse('movie', 'imdb');

      expect(response.message).toBe('No se encontraron streams para este contenido');
    });

    it('should handle different content types', () => {
      const response1 = service.createEmptyResponse('anime', 'kitsu');
      const response2 = service.createEmptyResponse('series', 'imdb');

      expect(response1.streams).toEqual([]);
      expect(response2.streams).toEqual([]);
      expect(response1.cacheMaxAge).toBe(300);
      expect(response2.cacheMaxAge).toBe(300);
    });
  });

  describe('createErrorResponse', () => {
    beforeEach(() => {
      mockConfig.get.mockImplementation((key) => {
        const config = {
          'cache.streams.error.ttl': 60
        };
        return config[key] || 60;
      });
    });

    it('should create error response with correct structure', () => {
      const error = new Error('Repository connection failed');
      const response = service.createErrorResponse(error, 'movie', 'imdb');

      expect(response.streams).toEqual([]);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Repository connection failed');
      expect(response.cacheMaxAge).toBe(60);
      expect(response.staleWhileRevalidate).toBe(30);
      expect(response.source).toBe('error');
      expect(response.streamCount).toBe(0);
    });

    it('should handle different error types', () => {
      const networkError = new Error('Network timeout');
      const validationError = new TypeError('Invalid argument');

      const response1 = service.createErrorResponse(networkError, 'movie', 'imdb');
      const response2 = service.createErrorResponse(validationError, 'series', 'imdb');

      expect(response1.error).toBe('Network timeout');
      expect(response2.error).toBe('Invalid argument');
      expect(response1.success).toBe(false);
      expect(response2.success).toBe(false);
    });

    it('should handle errors without message', () => {
      const errorWithoutMessage = { name: 'CustomError' };
      const response = service.createErrorResponse(errorWithoutMessage, 'movie', 'imdb');

      expect(response.error).toBe('Error desconocido');
    });
  });

  describe('determineCacheStrategy', () => {
    it('should return error strategy for error context', () => {
      const context = {
        type: 'movie',
        idType: 'imdb',
        streamCount: 5,
        hasError: true
      };

      const strategy = service.determineCacheStrategy(context);

      expect(strategy.strategy).toBe('error');
      expect(strategy.reason).toBe('Error occurred, short cache for retry');
      expect(strategy.ttl).toBeTypeOf('number');
    });

    it('should return empty strategy for zero streams', () => {
      const context = {
        type: 'movie',
        idType: 'imdb',
        streamCount: 0,
        hasError: false
      };

      const strategy = service.determineCacheStrategy(context);

      expect(strategy.strategy).toBe('empty');
      expect(strategy.reason).toBe('No streams found, short cache for retry');
    });

    it('should return long strategy for many streams', () => {
      const context = {
        type: 'movie',
        idType: 'imdb',
        streamCount: 15,
        hasError: false
      };

      const strategy = service.determineCacheStrategy(context);

      expect(strategy.strategy).toBe('long');
      expect(strategy.reason).toBe('Many streams found, long cache for performance');
    });

    it('should return standard strategy for normal cases', () => {
      const context = {
        type: 'movie',
        idType: 'imdb',
        streamCount: 5,
        hasError: false
      };

      const strategy = service.determineCacheStrategy(context);

      expect(strategy.strategy).toBe('standard');
      expect(strategy.reason).toBe('Standard cache for normal response');
    });

    it('should handle edge case with exactly 10 streams', () => {
      const context = {
        type: 'movie',
        idType: 'imdb',
        streamCount: 10,
        hasError: false
      };

      const strategy = service.determineCacheStrategy(context);

      expect(strategy.strategy).toBe('standard');
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration changes', () => {
      // Cambiar configuración
      mockConfig.get.mockImplementation((key) => {
        const config = {
          'cache.streams.movie.ttl': 7200, // Doubled
          'cache.streams.default.ttl': 2400
        };
        return config[key] || 2400;
      });

      const ttl = service.getCacheTTLByType('imdb', 5);
      expect(ttl).toBe(7200);
    });

    it('should handle missing configuration gracefully', () => {
      mockConfig.get.mockReturnValue(undefined);

      const ttl = service.getCacheTTLByType('imdb', 5);
      expect(ttl).toBeTypeOf('number');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should handle configuration errors', () => {
      mockConfig.get.mockImplementation(() => {
        throw new Error('Configuration service unavailable');
      });

      expect(() => {
        service.getCacheTTLByType('imdb', 5);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs', () => {
      expect(() => {
        service.createSuccessResponse(null, 'movie', 'imdb');
      }).not.toThrow();

      expect(() => {
        service.createEmptyResponse(null, null);
      }).not.toThrow();

      expect(() => {
        service.createErrorResponse(null, null, null);
      }).not.toThrow();
    });

    it('should handle very large stream counts', () => {
      const ttl = service.getCacheTTLByType('imdb', 10000);
      expect(ttl).toBeTypeOf('number');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should handle invalid content types', () => {
      const response = service.createSuccessResponse([], 'invalid-type', 'unknown-id');
      expect(response.success).toBe(true);
      expect(response.streams).toEqual([]);
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid successive calls efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        service.getCacheTTLByType('imdb', i % 20);
      }
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should handle large response creation efficiently', () => {
      const largeStreamSet = Array.from({ length: 1000 }, (_, i) => ({
        title: `Stream ${i}`,
        infoHash: `hash${i}`,
        sources: [`tracker:hash${i}`]
      }));

      const startTime = Date.now();
      const response = service.createSuccessResponse(largeStreamSet, 'movie', 'imdb');
      const endTime = Date.now();

      expect(response.streamCount).toBe(1000);
      expect(endTime - startTime).toBeLessThan(50);
    });
  });
});