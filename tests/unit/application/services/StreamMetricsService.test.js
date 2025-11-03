/**
 * @fileoverview Unit tests for StreamMetricsService
 * Tests metrics tracking, logging operations, and performance monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamMetricsService } from '@/application/services/StreamMetricsService.js';
import { MockLogger } from '@tests/mocks/MockLogger.js';

describe('StreamMetricsService', () => {
  let service;
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
    service = new StreamMetricsService(mockLogger, mockConfig);
  });

  describe('Constructor', () => {
    it('should initialize with provided logger and config', () => {
      expect(service).toBeInstanceOf(StreamMetricsService);
    });

    it('should initialize with default logger when not provided', () => {
      const serviceWithDefaults = new StreamMetricsService();
      expect(serviceWithDefaults).toBeInstanceOf(StreamMetricsService);
    });

    it('should initialize with empty config when not provided', () => {
      const serviceWithDefaults = new StreamMetricsService(mockLogger);
      expect(serviceWithDefaults).toBeInstanceOf(StreamMetricsService);
    });
  });

  describe('logStreamRequestStart', () => {
    it('should log request start and return context', () => {
      const requestInfo = {
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb'
      };

      const context = service.logStreamRequestStart(requestInfo);

      expect(context).toMatchObject({
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb'
      });
      expect(context.startTime).toBeTypeOf('number');
      expect(context.requestId).toMatch(/^movie-tt1234567-\d+$/);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[StreamHandler] Procesando petición: movie/tt1234567 (imdb)'
      );
    });

    it('should increment request metrics', () => {
      const requestInfo = {
        type: 'series',
        id: 'tt7654321',
        idType: 'imdb'
      };

      service.logStreamRequestStart(requestInfo);
      const metrics = service.getMetrics();

      expect(metrics.requests).toBe(1);
      expect(metrics.requestsByType.series).toBe(1);
      expect(metrics.requestsByIdType.imdb).toBe(1);
    });

    it('should handle multiple requests of same type', () => {
      service.logStreamRequestStart({ type: 'movie', id: 'tt1', idType: 'imdb' });
      service.logStreamRequestStart({ type: 'movie', id: 'tt2', idType: 'imdb' });

      const metrics = service.getMetrics();
      expect(metrics.requests).toBe(2);
      expect(metrics.requestsByType.movie).toBe(2);
      expect(metrics.requestsByIdType.imdb).toBe(2);
    });
  });

  describe('logStreamRequestSuccess', () => {
    it('should log successful request with streams', () => {
      const context = {
        startTime: Date.now() - 100,
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb',
        requestId: 'movie-tt1234567-123456789'
      };
      const result = {
        streams: [
          { title: 'Movie Stream 1' },
          { title: 'Movie Stream 2' }
        ],
        metadata: { title: 'Test Movie' }
      };

      service.logStreamRequestSuccess(context, result);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[StreamHandler] Petición completada: movie/tt1234567 (imdb) - 2 streams')
      );

      const metrics = service.getMetrics();
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.totalStreamsServed).toBe(2);
      expect(metrics.averageStreamsPerRequest).toBe(2);
    });

    it('should log empty response', () => {
      const context = {
        startTime: Date.now() - 50,
        type: 'series',
        id: 'tt9999999',
        idType: 'imdb'
      };
      const result = {
        streams: [],
        metadata: null
      };

      service.logStreamRequestSuccess(context, result);

      const metrics = service.getMetrics();
      expect(metrics.emptyResponses).toBe(1);
      expect(metrics.totalStreamsServed).toBe(0);
    });

    it('should log detailed debug info in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const context = {
        startTime: Date.now() - 75,
        type: 'anime',
        id: 'kitsu123',
        idType: 'kitsu',
        requestId: 'anime-kitsu123-123456789'
      };
      const result = {
        streams: [{ title: 'Anime Stream' }],
        metadata: { title: 'Test Anime' }
      };

      service.logStreamRequestSuccess(context, result);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StreamHandler] Detalles de respuesta:',
        expect.objectContaining({
          requestId: 'anime-kitsu123-123456789',
          streamCount: 1,
          responseTime: expect.any(Number),
          metadata: { title: 'Test Anime' },
          firstStreamTitle: 'Anime Stream'
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should calculate average streams per request correctly', () => {
      const context1 = { startTime: Date.now() - 100, type: 'movie', id: 'tt1', idType: 'imdb' };
      const context2 = { startTime: Date.now() - 100, type: 'movie', id: 'tt2', idType: 'imdb' };

      service.logStreamRequestSuccess(context1, { streams: [1, 2, 3], metadata: {} });
      service.logStreamRequestSuccess(context2, { streams: [1], metadata: {} });

      const metrics = service.getMetrics();
      expect(metrics.averageStreamsPerRequest).toBe(2); // (3 + 1) / 2
    });
  });

  describe('logStreamRequestError', () => {
    it('should log request error', () => {
      const context = {
        startTime: Date.now() - 200,
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb',
        requestId: 'movie-tt1234567-123456789'
      };
      const error = new Error('Test error');
      error.type = 'VALIDATION_ERROR';

      service.logStreamRequestError(context, error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[StreamHandler] Error en petición: movie/tt1234567 (imdb) - Test error')
      );

      const metrics = service.getMetrics();
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.errorsByType.VALIDATION_ERROR).toBe(1);
    });

    it('should handle error without type', () => {
      const context = {
        startTime: Date.now() - 150,
        type: 'series',
        id: 'tt7654321',
        idType: 'imdb'
      };
      const error = new Error('Unknown error');

      service.logStreamRequestError(context, error);

      const metrics = service.getMetrics();
      expect(metrics.errorsByType.UNKNOWN).toBe(1);
    });

    it('should log detailed error info in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const context = {
        startTime: Date.now() - 100,
        type: 'anime',
        id: 'kitsu123',
        idType: 'kitsu',
        requestId: 'anime-kitsu123-123456789'
      };
      const error = new Error('Test error');
      error.type = 'NETWORK_ERROR';

      service.logStreamRequestError(context, error);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StreamHandler] Detalles del error:',
        expect.objectContaining({
          requestId: 'anime-kitsu123-123456789',
          errorType: 'NETWORK_ERROR',
          errorMessage: 'Test error',
          stack: expect.any(String),
          responseTime: expect.any(Number)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logValidation', () => {
    it('should log successful validation', () => {
      const validationInfo = {
        type: 'REQUEST_VALIDATION',
        success: true,
        details: 'All fields valid'
      };

      service.logValidation(validationInfo);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Validation] REQUEST_VALIDATION - Exitosa: All fields valid'
      );
    });

    it('should log failed validation', () => {
      const validationInfo = {
        type: 'ID_VALIDATION',
        success: false,
        details: 'Invalid ID format'
      };

      service.logValidation(validationInfo);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Validation] ID_VALIDATION - Falló: Invalid ID format'
      );
    });
  });

  describe('logMagnetSearch', () => {
    it('should log magnet search results', () => {
      const searchInfo = {
        id: 'tt1234567',
        idType: 'imdb',
        resultCount: 15,
        searchTime: 250
      };

      service.logMagnetSearch(searchInfo);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[MagnetSearch] imdb/tt1234567 - 15 magnets en 250ms'
      );
    });

    it('should log detailed search info in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const searchInfo = {
        id: 'kitsu123',
        idType: 'kitsu',
        resultCount: 5,
        searchTime: 100
      };

      service.logMagnetSearch(searchInfo);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[MagnetSearch] Detalles:',
        expect.objectContaining({
          searchId: 'kitsu123',
          searchIdType: 'kitsu',
          magnetCount: 5,
          searchDuration: 100,
          timestamp: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logIdConversion', () => {
    it('should log successful ID conversion', () => {
      const conversionInfo = {
        fromId: 'tt1234567',
        fromType: 'imdb',
        toId: 'kitsu123',
        toType: 'kitsu',
        success: true
      };

      service.logIdConversion(conversionInfo);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[IDConversion] imdb/tt1234567 → kitsu/kitsu123'
      );
    });

    it('should log failed ID conversion', () => {
      const conversionInfo = {
        fromId: 'tt9999999',
        fromType: 'imdb',
        toId: null,
        toType: 'kitsu',
        success: false
      };

      service.logIdConversion(conversionInfo);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[IDConversion] Falló: imdb/tt9999999 → kitsu'
      );
    });
  });

  describe('logCacheOperation', () => {
    it('should log cache hit and update metrics', () => {
      const cacheInfo = {
        operation: 'hit',
        key: 'movie:tt1234567',
        ttl: 3600
      };

      service.logCacheOperation(cacheInfo);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Cache] HIT - movie:tt1234567 (TTL: 3600s)'
      );

      const metrics = service.getMetrics();
      expect(metrics.cacheHits).toBe(1);
    });

    it('should log cache miss and update metrics', () => {
      const cacheInfo = {
        operation: 'miss',
        key: 'series:tt7654321',
        ttl: 1800
      };

      service.logCacheOperation(cacheInfo);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Cache] MISS - series:tt7654321 (TTL: 1800s)'
      );

      const metrics = service.getMetrics();
      expect(metrics.cacheMisses).toBe(1);
    });

    it('should log cache set operation', () => {
      const cacheInfo = {
        operation: 'set',
        key: 'anime:kitsu123',
        ttl: 2400
      };

      service.logCacheOperation(cacheInfo);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Cache] SET - anime:kitsu123 (TTL: 2400s)'
      );
    });
  });

  describe('getMetrics', () => {
    it('should return initial metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toMatchObject({
        requests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        emptyResponses: 0,
        totalStreamsServed: 0,
        averageStreamsPerRequest: 0,
        responseTimeSum: 0,
        requestsByType: {},
        requestsByIdType: {},
        errorsByType: {},
        cacheHits: 0,
        cacheMisses: 0,
        averageResponseTime: 0,
        successRate: 0,
        cacheHitRate: 0,
        timestamp: expect.any(String)
      });
    });

    it('should calculate metrics correctly after operations', () => {
      // Simulate some operations
      const context1 = service.logStreamRequestStart({ type: 'movie', id: 'tt1', idType: 'imdb' });
      const context2 = service.logStreamRequestStart({ type: 'series', id: 'tt2', idType: 'imdb' });
      
      service.logStreamRequestSuccess(context1, { streams: [1, 2], metadata: {} });
      service.logStreamRequestError(context2, new Error('Test error'));
      
      service.logCacheOperation({ operation: 'hit', key: 'test1', ttl: 3600 });
      service.logCacheOperation({ operation: 'miss', key: 'test2', ttl: 1800 });

      const metrics = service.getMetrics();

      expect(metrics.requests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.successRate).toBe(50);
      expect(metrics.cacheHitRate).toBe(50);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should handle division by zero gracefully', () => {
      const metrics = service.getMetrics();

      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });
  });

  describe('generateMetricsReport', () => {
    it('should generate formatted metrics report', () => {
      // Add some test data
      const context = service.logStreamRequestStart({ type: 'movie', id: 'tt1', idType: 'imdb' });
      service.logStreamRequestSuccess(context, { streams: [1, 2, 3], metadata: {} });

      const report = service.generateMetricsReport();

      expect(report).toContain('STREAM HANDLER METRICS REPORT');
      expect(report).toContain('Total Requests: 1');
      expect(report).toContain('Successful: 1');
      expect(report).toContain('Total Streams Served: 3');
      expect(report).toContain('movie: 1');
      expect(report).toContain('imdb: 1');
    });

    it('should handle empty metrics in report', () => {
      const report = service.generateMetricsReport();

      expect(report).toContain('Total Requests: 0');
      expect(report).toContain('Successful: 0 (0%)');
      expect(report).toContain('Cache Hit Rate: 0%');
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      // Add some test data
      const context = service.logStreamRequestStart({ type: 'movie', id: 'tt1', idType: 'imdb' });
      service.logStreamRequestSuccess(context, { streams: [1, 2], metadata: {} });
      service.logCacheOperation({ operation: 'hit', key: 'test', ttl: 3600 });

      // Verify metrics have data
      let metrics = service.getMetrics();
      expect(metrics.requests).toBe(1);
      expect(metrics.cacheHits).toBe(1);

      // Reset metrics
      service.resetMetrics();

      // Verify metrics are reset
      metrics = service.getMetrics();
      expect(metrics.requests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.requestsByType).toEqual({});
      expect(metrics.errorsByType).toEqual({});

      expect(mockLogger.info).toHaveBeenCalledWith('[StreamMetrics] Métricas reseteadas');
    });
  });

  describe('logIdDetection', () => {
    it('should log ID detection with full information', () => {
      const contentId = 'tt1234567';
      const idDetection = {
        type: 'imdb',
        confidence: 0.95,
        source: 'pattern_match'
      };

      service.logIdDetection(contentId, idDetection);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[StreamHandler] ID detectado: tt1234567 -> Tipo: imdb (Confianza: 0.95, Fuente: pattern_match)'
      );
    });

    it('should handle missing detection information', () => {
      const contentId = 'unknown123';
      const idDetection = null;

      service.logIdDetection(contentId, idDetection);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[StreamHandler] ID detectado: unknown123 -> Tipo: unknown (Confianza: N/A, Fuente: N/A)'
      );
    });

    it('should log detailed detection info in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const contentId = 'kitsu123';
      const idDetection = {
        type: 'kitsu',
        confidence: 0.88,
        source: 'api_lookup'
      };

      service.logIdDetection(contentId, idDetection);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StreamHandler] Detalles de detección ID:',
        expect.objectContaining({
          contentId: 'kitsu123',
          detectedType: 'kitsu',
          confidence: 0.88,
          source: 'api_lookup',
          timestamp: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logValidationError', () => {
    it('should log validation error and update metrics', () => {
      const validationError = new Error('Invalid request format');

      service.logValidationError(validationError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StreamHandler] Error de validación: Invalid request format'
      );

      const metrics = service.getMetrics();
      expect(metrics.errorsByType.VALIDATION_ERROR).toBe(1);
    });

    it('should log detailed validation error in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const validationError = new Error('Missing required field');

      service.logValidationError(validationError);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StreamHandler] Detalles del error de validación:',
        expect.objectContaining({
          errorMessage: 'Missing required field',
          errorType: 'VALIDATION_ERROR',
          stack: expect.any(String),
          timestamp: expect.any(String)
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logDebug', () => {
    it('should log debug information in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const operation = 'magnet_processing';
      const data = { magnetCount: 5, processingTime: 150 };

      service.logDebug(operation, data);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[StreamHandler:magnet_processing]',
        { magnetCount: 5, processingTime: 150 }
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not log debug information in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const operation = 'test_operation';
      const data = { test: 'data' };

      service.logDebug(operation, data);

      expect(mockLogger.debug).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('logWarning', () => {
    it('should log warning message', () => {
      const message = 'Low magnet count detected';
      const context = { magnetCount: 2, threshold: 5 };

      service.logWarning(message, context);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[StreamHandler] Low magnet count detected',
        { magnetCount: 2, threshold: 5 }
      );
    });

    it('should log warning without context', () => {
      const message = 'Cache service unavailable';

      service.logWarning(message);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[StreamHandler] Cache service unavailable',
        {}
      );
    });
  });

  describe('logInfo', () => {
    it('should log info message', () => {
      const message = 'Service initialized successfully';
      const context = { version: '1.3.0', environment: 'production' };

      service.logInfo(message, context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[StreamHandler] Service initialized successfully',
        { version: '1.3.0', environment: 'production' }
      );
    });

    it('should log info without context', () => {
      const message = 'Processing request';

      service.logInfo(message);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[StreamHandler] Processing request',
        {}
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive operations', () => {
      // Simulate rapid requests
      for (let i = 0; i < 100; i++) {
        const context = service.logStreamRequestStart({
          type: 'movie',
          id: `tt${i}`,
          idType: 'imdb'
        });
        
        if (i % 2 === 0) {
          service.logStreamRequestSuccess(context, { streams: [1, 2], metadata: {} });
        } else {
          service.logStreamRequestError(context, new Error('Test error'));
        }
      }

      const metrics = service.getMetrics();
      expect(metrics.requests).toBe(100);
      expect(metrics.successfulRequests).toBe(50);
      expect(metrics.failedRequests).toBe(50);
      expect(metrics.successRate).toBe(50);
    });

    it('should handle very large numbers in metrics', () => {
      // Simulate large stream counts
      const context = service.logStreamRequestStart({
        type: 'movie',
        id: 'tt1234567',
        idType: 'imdb'
      });

      const largeStreamArray = new Array(10000).fill({ title: 'Stream' });
      service.logStreamRequestSuccess(context, {
        streams: largeStreamArray,
        metadata: {}
      });

      const metrics = service.getMetrics();
      expect(metrics.totalStreamsServed).toBe(10000);
      expect(metrics.averageStreamsPerRequest).toBe(10000);
    });

    it('should handle null/undefined values gracefully', () => {
      expect(() => {
        service.logIdDetection(null, null);
        service.logValidation({ type: null, success: null, details: null });
        service.logMagnetSearch({ id: null, idType: null, resultCount: null, searchTime: null });
      }).not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle metrics calculation efficiently', () => {
      const startTime = Date.now();
      
      // Generate many operations
      for (let i = 0; i < 1000; i++) {
        service.logStreamRequestStart({ type: 'movie', id: `tt${i}`, idType: 'imdb' });
      }
      
      const metricsTime = Date.now();
      service.getMetrics();
      const endTime = Date.now();
      
      // Metrics calculation should be fast
      expect(endTime - metricsTime).toBeLessThan(100);
    });

    it('should handle report generation efficiently', () => {
      // Add some test data
      for (let i = 0; i < 50; i++) {
        const context = service.logStreamRequestStart({
          type: i % 2 === 0 ? 'movie' : 'series',
          id: `tt${i}`,
          idType: 'imdb'
        });
        service.logStreamRequestSuccess(context, { streams: [1, 2], metadata: {} });
      }

      const startTime = Date.now();
      const report = service.generateMetricsReport();
      const endTime = Date.now();

      expect(report).toContain('STREAM HANDLER METRICS REPORT');
      expect(endTime - startTime).toBeLessThan(50);
    });
  });
});