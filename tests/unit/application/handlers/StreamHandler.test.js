/**
 * @fileoverview Unit tests for StreamHandler
 * Tests the orchestration of specialized services for stream processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamHandler } from '@/application/handlers/StreamHandler.js';
import { MockLogger } from '@tests/mocks/MockLogger.js';
import { mockData } from '../../../mocks/mockData.js';

describe('StreamHandler', () => {
  let handler;
  let mockStreamValidationService;
  let mockStreamProcessingService;
  let mockStreamCacheService;
  let mockStreamMetricsService;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    mockLogger = MockLogger.create();
    
    mockConfig = {
      cache: {
        ttl: {
          movie: 3600,
          series: 1800,
          anime: 2400
        }
      }
    };

    // Mock StreamValidationService
    mockStreamValidationService = {
      validateStreamRequest: vi.fn().mockResolvedValue({
        isValid: true,
        error: null
      }),
      detectContentIdType: vi.fn().mockResolvedValue({
        type: 'imdb',
        confidence: 0.95,
        source: 'pattern_match'
      })
    };

    // Mock StreamProcessingService
    mockStreamProcessingService = {
      getMagnets: vi.fn().mockResolvedValue([
        mockData.magnets.movie[0],
        mockData.magnets.movie[1]
      ]),
      createStreamsFromMagnets: vi.fn().mockResolvedValue([
        mockData.streams.movie[0],
        mockData.streams.movie[1]
      ])
    };

    // Mock StreamCacheService
    mockStreamCacheService = {
      createStreamResponse: vi.fn().mockResolvedValue({
        streams: [mockData.streams.movie[0], mockData.streams.movie[1]],
        cacheMaxAge: 3600
      }),
      createEmptyResponse: vi.fn().mockReturnValue({
        streams: [],
        cacheMaxAge: 300
      }),
      createErrorResponse: vi.fn().mockReturnValue({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      })
    };

    // Mock StreamMetricsService
    mockStreamMetricsService = {
      logStreamRequestStart: vi.fn().mockReturnValue({
        startTime: Date.now(),
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb',
        requestId: 'movie-tt1234567-123456789'
      }),
      logStreamRequestSuccess: vi.fn().mockResolvedValue(),
      logStreamRequestError: vi.fn().mockResolvedValue(),
      logValidationError: vi.fn().mockResolvedValue(),
      logIdDetection: vi.fn().mockResolvedValue(),
      logMagnetSearch: vi.fn().mockResolvedValue()
    };

    handler = new StreamHandler(
      mockStreamValidationService,
      mockStreamProcessingService,
      mockStreamCacheService,
      mockStreamMetricsService,
      mockLogger,
      mockConfig
    );
  });

  describe('Constructor', () => {
    it('should initialize with all required services', () => {
      expect(handler).toBeInstanceOf(StreamHandler);
    });

    it('should initialize with default logger and config when not provided', () => {
      const handlerWithDefaults = new StreamHandler(
        mockStreamValidationService,
        mockStreamProcessingService,
        mockStreamCacheService,
        mockStreamMetricsService
      );
      expect(handlerWithDefaults).toBeInstanceOf(StreamHandler);
    });
  });

  describe('createAddonHandler', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should return a function', () => {
      expect(typeof addonHandler).toBe('function');
    });

    it('should handle successful stream request', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [mockData.streams.movie[0], mockData.streams.movie[1]],
        cacheMaxAge: 3600
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Stream request recibida: ${JSON.stringify(args)}`
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Stream response: 2 streams encontrados'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid request format');
      mockStreamValidationService.validateStreamRequest.mockResolvedValue({
        isValid: false,
        error: validationError
      });

      const args = { type: 'invalid', id: '' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });

      expect(mockStreamMetricsService.logValidationError).toHaveBeenCalledWith(validationError);
      expect(mockStreamCacheService.createErrorResponse).toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      const processingError = new Error('Magnet processing failed');
      mockStreamProcessingService.getMagnets.mockRejectedValue(processingError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });

      expect(mockStreamMetricsService.logStreamRequestError).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error procesando stream request para movie/tt1234567')
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockStreamValidationService.validateStreamRequest.mockRejectedValue(unexpectedError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error en createAddonHandler')
      );
    });
  });

  describe('#handleStreamRequest (via createAddonHandler)', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should orchestrate all services for successful request', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      // Verify service orchestration
      expect(mockStreamMetricsService.logStreamRequestStart).toHaveBeenCalledWith(args);
      expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalledWith(args);
      expect(mockStreamValidationService.detectContentIdType).toHaveBeenCalledWith('tt1234567');
      expect(mockStreamMetricsService.logIdDetection).toHaveBeenCalled();
      expect(mockStreamProcessingService.getMagnets).toHaveBeenCalled();
      expect(mockStreamMetricsService.logMagnetSearch).toHaveBeenCalled();
      expect(mockStreamProcessingService.createStreamsFromMagnets).toHaveBeenCalled();
      expect(mockStreamCacheService.createStreamResponse).toHaveBeenCalled();
      expect(mockStreamMetricsService.logStreamRequestSuccess).toHaveBeenCalled();

      expect(result.streams).toHaveLength(2);
    });

    it('should handle empty magnet results', async () => {
      mockStreamProcessingService.getMagnets.mockResolvedValue([]);

      const args = { type: 'movie', id: 'tt9999999' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });

      expect(mockStreamCacheService.createEmptyResponse).toHaveBeenCalledWith('movie');
      expect(mockStreamMetricsService.logStreamRequestSuccess).toHaveBeenCalledWith(
        expect.any(Object),
        { streams: [], metadata: null }
      );
    });

    it('should handle null magnet results', async () => {
      mockStreamProcessingService.getMagnets.mockResolvedValue(null);

      const args = { type: 'series', id: 'tt8888888' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });

      expect(mockStreamCacheService.createEmptyResponse).toHaveBeenCalledWith('series');
    });

    it('should handle empty stream creation results', async () => {
      mockStreamProcessingService.createStreamsFromMagnets.mockResolvedValue([]);

      const args = { type: 'anime', id: 'kitsu123' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });

      expect(mockStreamCacheService.createEmptyResponse).toHaveBeenCalledWith('anime');
    });

    it('should log magnet search metrics correctly', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockStreamMetricsService.logMagnetSearch).toHaveBeenCalledWith({
        id: 'tt1234567',
        idType: 'imdb',
        resultCount: 2,
        searchTime: expect.any(Number)
      });
    });

    it('should log ID detection correctly', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockStreamMetricsService.logIdDetection).toHaveBeenCalledWith(
        'tt1234567',
        {
          type: 'imdb',
          confidence: 0.95,
          source: 'pattern_match'
        }
      );
    });

    it('should handle validation service errors', async () => {
      const validationError = new Error('Validation service unavailable');
      mockStreamValidationService.validateStreamRequest.mockRejectedValue(validationError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });

      expect(mockStreamMetricsService.logStreamRequestError).toHaveBeenCalled();
    });

    it('should handle ID detection service errors', async () => {
      const idDetectionError = new Error('ID detection failed');
      mockStreamValidationService.detectContentIdType.mockRejectedValue(idDetectionError);

      const args = { type: 'movie', id: 'invalid_id' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle magnet processing service errors', async () => {
      const magnetError = new Error('Magnet repository unavailable');
      mockStreamProcessingService.getMagnets.mockRejectedValue(magnetError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle stream creation service errors', async () => {
      const streamError = new Error('Stream creation failed');
      mockStreamProcessingService.createStreamsFromMagnets.mockRejectedValue(streamError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle cache service errors', async () => {
      const cacheError = new Error('Cache service unavailable');
      mockStreamCacheService.createStreamResponse.mockRejectedValue(cacheError);

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should log performance metrics', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Encontrados 2 streams para movie\/tt1234567 en \d+ms/)
      );
    });
  });

  describe('Service Integration', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should pass correct parameters between services', async () => {
      const args = { type: 'series', id: 'tt7654321' };
      await addonHandler(args);

      // Verify parameter passing
      expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalledWith(args);
      expect(mockStreamValidationService.detectContentIdType).toHaveBeenCalledWith('tt7654321');
      
      expect(mockStreamProcessingService.getMagnets).toHaveBeenCalledWith(
        'tt7654321',
        'series',
        { type: 'imdb', confidence: 0.95, source: 'pattern_match' }
      );

      expect(mockStreamProcessingService.createStreamsFromMagnets).toHaveBeenCalledWith(
        [mockData.magnets.movie[0], mockData.magnets.movie[1]],
        'series',
        null,
        { type: 'imdb', confidence: 0.95, source: 'pattern_match' }
      );

      expect(mockStreamCacheService.createStreamResponse).toHaveBeenCalledWith(
        [mockData.streams.movie[0], mockData.streams.movie[1]],
        { 
          type: 'series', 
          idDetection: { type: 'imdb', confidence: 0.95, source: 'pattern_match' }
        }
      );
    });

    it('should handle different content types correctly', async () => {
      const testCases = [
        { type: 'movie', id: 'tt1111111' },
        { type: 'series', id: 'tt2222222' },
        { type: 'anime', id: 'kitsu333' }
      ];

      for (const testCase of testCases) {
        await addonHandler(testCase);
        
        expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalledWith(testCase);
        expect(mockStreamProcessingService.getMagnets).toHaveBeenCalledWith(
          testCase.id,
          testCase.type,
          expect.any(Object)
        );
      }
    });

    it('should maintain metrics context throughout request lifecycle', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      const metricsContext = mockStreamMetricsService.logStreamRequestStart.mock.results[0].value;
      
      expect(mockStreamMetricsService.logStreamRequestSuccess).toHaveBeenCalledWith(
        metricsContext,
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should handle service unavailability gracefully', async () => {
      // Simulate all services failing
      mockStreamValidationService.validateStreamRequest.mockRejectedValue(new Error('Service down'));
      mockStreamProcessingService.getMagnets.mockRejectedValue(new Error('Service down'));
      mockStreamCacheService.createStreamResponse.mockRejectedValue(new Error('Service down'));

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle partial service failures', async () => {
      // Validation succeeds, but processing fails
      mockStreamProcessingService.getMagnets.mockRejectedValue(new Error('Processing failed'));

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalled();
      expect(result.streams).toEqual([]);
    });

    it('should handle metrics service failures gracefully', async () => {
      mockStreamMetricsService.logStreamRequestStart.mockRejectedValue(new Error('Metrics failed'));

      const args = { type: 'movie', id: 'tt1234567' };
      const result = await addonHandler(args);

      // Should still return error response
      expect(result.streams).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should handle undefined args', async () => {
      const result = await addonHandler(undefined);
      
      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle null args', async () => {
      const result = await addonHandler(null);
      
      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 60,
        error: 'Internal error'
      });
    });

    it('should handle empty args object', async () => {
      const result = await addonHandler({});
      
      expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalledWith({});
    });

    it('should handle malformed args', async () => {
      const malformedArgs = { type: null, id: undefined };
      const result = await addonHandler(malformedArgs);
      
      expect(mockStreamValidationService.validateStreamRequest).toHaveBeenCalledWith(malformedArgs);
    });

    it('should handle very long IDs', async () => {
      const longId = 'tt' + '1'.repeat(1000);
      const args = { type: 'movie', id: longId };
      
      const result = await addonHandler(args);
      
      expect(mockStreamValidationService.detectContentIdType).toHaveBeenCalledWith(longId);
    });

    it('should handle special characters in IDs', async () => {
      const specialId = 'tt123-456_789@test.com';
      const args = { type: 'movie', id: specialId };
      
      const result = await addonHandler(args);
      
      expect(mockStreamValidationService.detectContentIdType).toHaveBeenCalledWith(specialId);
    });
  });

  describe('Performance Tests', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        type: 'movie',
        id: `tt${i.toString().padStart(7, '0')}`
      }));

      const promises = requests.map(args => addonHandler(args));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.streams).toHaveLength(2);
      });
    });

    it('should complete requests within reasonable time', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      
      const startTime = Date.now();
      await addonHandler(args);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle rapid successive requests', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(addonHandler(args));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      expect(mockStreamMetricsService.logStreamRequestStart).toHaveBeenCalledTimes(50);
    });
  });

  describe('Logging and Debugging', () => {
    let addonHandler;

    beforeEach(() => {
      addonHandler = handler.createAddonHandler();
    });

    it('should log request and response details', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Stream request recibida: ${JSON.stringify(args)}`
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Stream response: 2 streams encontrados'
      );
    });

    it('should log performance information', async () => {
      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Encontrados 2 streams para movie\/tt1234567 en \d+ms/)
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Test error');
      mockStreamProcessingService.getMagnets.mockRejectedValue(error);

      const args = { type: 'movie', id: 'tt1234567' };
      await addonHandler(args);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error procesando stream request para movie/tt1234567: Test error')
      );
    });
  });
});