/**
 * @fileoverview Unit tests for IStreamServices interfaces
 * Tests the interface contracts and their proper definition
 */

import { describe, it, expect } from 'vitest';
import {
  IStreamValidationService,
  IStreamProcessingService,
  IStreamCacheService,
  IStreamMetricsService,
  IStreamHandler,
  SERVICE_DEPENDENCIES,
  SERVICE_EVENTS,
  SERVICE_ERROR_TYPES
} from '../../../../src/application/interfaces/IStreamServices.js';

describe('IStreamServices Interfaces', () => {
  describe('IStreamValidationService', () => {
    it('should be instantiable', () => {
      const service = new IStreamValidationService();
      expect(service).toBeInstanceOf(IStreamValidationService);
    });

    it('should throw error for unimplemented validateStreamRequest', async () => {
      const service = new IStreamValidationService();
      await expect(service.validateStreamRequest({})).rejects.toThrow(
        'Method validateStreamRequest must be implemented'
      );
    });

    it('should throw error for unimplemented isSupportedType', () => {
      const service = new IStreamValidationService();
      expect(() => service.isSupportedType('movie')).toThrow(
        'Method isSupportedType must be implemented'
      );
    });

    it('should throw error for unimplemented detectContentIdType', () => {
      const service = new IStreamValidationService();
      expect(() => service.detectContentIdType('tt1234567')).toThrow(
        'Method detectContentIdType must be implemented'
      );
    });

    it('should throw error for unimplemented extractSeasonEpisode', () => {
      const service = new IStreamValidationService();
      expect(() => service.extractSeasonEpisode('tt1234567:1:5')).toThrow(
        'Method extractSeasonEpisode must be implemented'
      );
    });

    it('should have all required methods defined', () => {
      const service = new IStreamValidationService();
      expect(typeof service.validateStreamRequest).toBe('function');
      expect(typeof service.isSupportedType).toBe('function');
      expect(typeof service.detectContentIdType).toBe('function');
      expect(typeof service.extractSeasonEpisode).toBe('function');
    });
  });

  describe('IStreamProcessingService', () => {
    it('should be instantiable', () => {
      const service = new IStreamProcessingService();
      expect(service).toBeInstanceOf(IStreamProcessingService);
    });

    it('should throw error for unimplemented getMagnets', async () => {
      const service = new IStreamProcessingService();
      await expect(service.getMagnets('tt1234567', 'movie')).rejects.toThrow(
        'Method getMagnets must be implemented'
      );
    });

    it('should throw error for unimplemented createStreamsFromMagnets', () => {
      const service = new IStreamProcessingService();
      expect(() => service.createStreamsFromMagnets([], 'movie')).toThrow(
        'Method createStreamsFromMagnets must be implemented'
      );
    });

    it('should throw error for unimplemented formatStreamTitle', () => {
      const service = new IStreamProcessingService();
      expect(() => service.formatStreamTitle({}, 'movie')).toThrow(
        'Method formatStreamTitle must be implemented'
      );
    });

    it('should throw error for unimplemented formatStreamDescription', () => {
      const service = new IStreamProcessingService();
      expect(() => service.formatStreamDescription({}, 'movie')).toThrow(
        'Method formatStreamDescription must be implemented'
      );
    });

    it('should throw error for unimplemented convertSizeToBytes', () => {
      const service = new IStreamProcessingService();
      expect(() => service.convertSizeToBytes('1024 MB')).toThrow(
        'Method convertSizeToBytes must be implemented'
      );
    });

    it('should have all required methods defined', () => {
      const service = new IStreamProcessingService();
      expect(typeof service.getMagnets).toBe('function');
      expect(typeof service.createStreamsFromMagnets).toBe('function');
      expect(typeof service.formatStreamTitle).toBe('function');
      expect(typeof service.formatStreamDescription).toBe('function');
      expect(typeof service.convertSizeToBytes).toBe('function');
    });
  });

  describe('IStreamCacheService', () => {
    it('should be instantiable', () => {
      const service = new IStreamCacheService();
      expect(service).toBeInstanceOf(IStreamCacheService);
    });

    it('should throw error for unimplemented getCacheTTLByType', () => {
      const service = new IStreamCacheService();
      expect(() => service.getCacheTTLByType('movie', 5)).toThrow(
        'Method getCacheTTLByType must be implemented'
      );
    });

    it('should throw error for unimplemented createStreamResponse', () => {
      const service = new IStreamCacheService();
      expect(() => service.createStreamResponse([], {})).toThrow(
        'Method createStreamResponse must be implemented'
      );
    });

    it('should throw error for unimplemented createEmptyResponse', () => {
      const service = new IStreamCacheService();
      expect(() => service.createEmptyResponse('movie')).toThrow(
        'Method createEmptyResponse must be implemented'
      );
    });

    it('should throw error for unimplemented createErrorResponse', () => {
      const service = new IStreamCacheService();
      expect(() => service.createErrorResponse('Error message')).toThrow(
        'Method createErrorResponse must be implemented'
      );
    });

    it('should throw error for unimplemented determineCacheStrategy', () => {
      const service = new IStreamCacheService();
      expect(() => service.determineCacheStrategy({})).toThrow(
        'Method determineCacheStrategy must be implemented'
      );
    });

    it('should have all required methods defined', () => {
      const service = new IStreamCacheService();
      expect(typeof service.getCacheTTLByType).toBe('function');
      expect(typeof service.createStreamResponse).toBe('function');
      expect(typeof service.createEmptyResponse).toBe('function');
      expect(typeof service.createErrorResponse).toBe('function');
      expect(typeof service.determineCacheStrategy).toBe('function');
    });
  });

  describe('IStreamMetricsService', () => {
    it('should be instantiable', () => {
      const service = new IStreamMetricsService();
      expect(service).toBeInstanceOf(IStreamMetricsService);
    });

    it('should throw error for unimplemented logStreamRequestStart', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logStreamRequestStart({})).toThrow(
        'Method logStreamRequestStart must be implemented'
      );
    });

    it('should throw error for unimplemented logStreamRequestSuccess', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logStreamRequestSuccess({}, {})).toThrow(
        'Method logStreamRequestSuccess must be implemented'
      );
    });

    it('should throw error for unimplemented logStreamRequestError', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logStreamRequestError({}, new Error())).toThrow(
        'Method logStreamRequestError must be implemented'
      );
    });

    it('should throw error for unimplemented logValidation', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logValidation({})).toThrow(
        'Method logValidation must be implemented'
      );
    });

    it('should throw error for unimplemented logMagnetSearch', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logMagnetSearch({})).toThrow(
        'Method logMagnetSearch must be implemented'
      );
    });

    it('should throw error for unimplemented logIdConversion', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logIdConversion({})).toThrow(
        'Method logIdConversion must be implemented'
      );
    });

    it('should throw error for unimplemented logCacheOperation', () => {
      const service = new IStreamMetricsService();
      expect(() => service.logCacheOperation({})).toThrow(
        'Method logCacheOperation must be implemented'
      );
    });

    it('should throw error for unimplemented getMetrics', () => {
      const service = new IStreamMetricsService();
      expect(() => service.getMetrics()).toThrow(
        'Method getMetrics must be implemented'
      );
    });

    it('should throw error for unimplemented generateMetricsReport', () => {
      const service = new IStreamMetricsService();
      expect(() => service.generateMetricsReport()).toThrow(
        'Method generateMetricsReport must be implemented'
      );
    });

    it('should throw error for unimplemented resetMetrics', () => {
      const service = new IStreamMetricsService();
      expect(() => service.resetMetrics()).toThrow(
        'Method resetMetrics must be implemented'
      );
    });

    it('should have all required methods defined', () => {
      const service = new IStreamMetricsService();
      expect(typeof service.logStreamRequestStart).toBe('function');
      expect(typeof service.logStreamRequestSuccess).toBe('function');
      expect(typeof service.logStreamRequestError).toBe('function');
      expect(typeof service.logValidation).toBe('function');
      expect(typeof service.logMagnetSearch).toBe('function');
      expect(typeof service.logIdConversion).toBe('function');
      expect(typeof service.logCacheOperation).toBe('function');
      expect(typeof service.getMetrics).toBe('function');
      expect(typeof service.generateMetricsReport).toBe('function');
      expect(typeof service.resetMetrics).toBe('function');
    });
  });

  describe('IStreamHandler', () => {
    it('should be instantiable', () => {
      const handler = new IStreamHandler();
      expect(handler).toBeInstanceOf(IStreamHandler);
    });

    it('should throw error for unimplemented createAddonHandler', () => {
      const handler = new IStreamHandler();
      expect(() => handler.createAddonHandler()).toThrow(
        'Method createAddonHandler must be implemented'
      );
    });

    it('should have all required methods defined', () => {
      const handler = new IStreamHandler();
      expect(typeof handler.createAddonHandler).toBe('function');
    });
  });

  describe('SERVICE_DEPENDENCIES', () => {
    it('should define dependencies for all services', () => {
      expect(SERVICE_DEPENDENCIES).toBeDefined();
      expect(typeof SERVICE_DEPENDENCIES).toBe('object');
    });

    it('should have StreamValidationService dependencies', () => {
      expect(SERVICE_DEPENDENCIES.StreamValidationService).toEqual([
        'validationService',
        'idDetectorService', 
        'logger'
      ]);
    });

    it('should have StreamProcessingService dependencies', () => {
      expect(SERVICE_DEPENDENCIES.StreamProcessingService).toEqual([
        'magnetRepository',
        'unifiedIdService',
        'logger'
      ]);
    });

    it('should have StreamCacheService dependencies', () => {
      expect(SERVICE_DEPENDENCIES.StreamCacheService).toEqual([
        'config',
        'logger'
      ]);
    });

    it('should have StreamMetricsService dependencies', () => {
      expect(SERVICE_DEPENDENCIES.StreamMetricsService).toEqual([
        'logger',
        'config'
      ]);
    });

    it('should have StreamHandler dependencies', () => {
      expect(SERVICE_DEPENDENCIES.StreamHandler).toEqual([
        'streamValidationService',
        'streamProcessingService',
        'streamCacheService',
        'streamMetricsService',
        'logger',
        'config'
      ]);
    });

    it('should have all required service dependencies defined', () => {
      const requiredServices = [
        'StreamValidationService',
        'StreamProcessingService',
        'StreamCacheService',
        'StreamMetricsService',
        'StreamHandler'
      ];

      requiredServices.forEach(service => {
        expect(SERVICE_DEPENDENCIES[service]).toBeDefined();
        expect(Array.isArray(SERVICE_DEPENDENCIES[service])).toBe(true);
        expect(SERVICE_DEPENDENCIES[service].length).toBeGreaterThan(0);
      });
    });
  });

  describe('SERVICE_EVENTS', () => {
    it('should define all required events', () => {
      expect(SERVICE_EVENTS).toBeDefined();
      expect(typeof SERVICE_EVENTS).toBe('object');
    });

    it('should have validation events', () => {
      expect(SERVICE_EVENTS.VALIDATION_STARTED).toBe('validation:started');
      expect(SERVICE_EVENTS.VALIDATION_COMPLETED).toBe('validation:completed');
      expect(SERVICE_EVENTS.VALIDATION_FAILED).toBe('validation:failed');
    });

    it('should have processing events', () => {
      expect(SERVICE_EVENTS.PROCESSING_STARTED).toBe('processing:started');
      expect(SERVICE_EVENTS.PROCESSING_COMPLETED).toBe('processing:completed');
      expect(SERVICE_EVENTS.PROCESSING_FAILED).toBe('processing:failed');
    });

    it('should have cache events', () => {
      expect(SERVICE_EVENTS.CACHE_HIT).toBe('cache:hit');
      expect(SERVICE_EVENTS.CACHE_MISS).toBe('cache:miss');
      expect(SERVICE_EVENTS.CACHE_SET).toBe('cache:set');
    });

    it('should have metrics events', () => {
      expect(SERVICE_EVENTS.METRICS_UPDATED).toBe('metrics:updated');
      expect(SERVICE_EVENTS.METRICS_RESET).toBe('metrics:reset');
    });

    it('should have consistent event naming pattern', () => {
      const events = Object.values(SERVICE_EVENTS);
      events.forEach(event => {
        expect(event).toMatch(/^[a-z]+:[a-z_]+$/);
      });
    });
  });

  describe('SERVICE_ERROR_TYPES', () => {
    it('should define all required error types', () => {
      expect(SERVICE_ERROR_TYPES).toBeDefined();
      expect(typeof SERVICE_ERROR_TYPES).toBe('object');
    });

    it('should have validation error type', () => {
      expect(SERVICE_ERROR_TYPES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    });

    it('should have processing error type', () => {
      expect(SERVICE_ERROR_TYPES.PROCESSING_ERROR).toBe('PROCESSING_ERROR');
    });

    it('should have cache error type', () => {
      expect(SERVICE_ERROR_TYPES.CACHE_ERROR).toBe('CACHE_ERROR');
    });

    it('should have metrics error type', () => {
      expect(SERVICE_ERROR_TYPES.METRICS_ERROR).toBe('METRICS_ERROR');
    });

    it('should have dependency error type', () => {
      expect(SERVICE_ERROR_TYPES.DEPENDENCY_ERROR).toBe('DEPENDENCY_ERROR');
    });

    it('should have consistent error type naming pattern', () => {
      const errorTypes = Object.values(SERVICE_ERROR_TYPES);
      errorTypes.forEach(errorType => {
        expect(errorType).toMatch(/^[A-Z_]+_ERROR$/);
      });
    });

    it('should have all error types as uppercase constants', () => {
      const errorTypes = Object.values(SERVICE_ERROR_TYPES);
      errorTypes.forEach(errorType => {
        expect(errorType).toBe(errorType.toUpperCase());
      });
    });
  });

  describe('Interface Contract Validation', () => {
    it('should ensure all interfaces follow the same pattern', () => {
      const interfaces = [
        IStreamValidationService,
        IStreamProcessingService,
        IStreamCacheService,
        IStreamMetricsService,
        IStreamHandler
      ];

      interfaces.forEach(InterfaceClass => {
        expect(typeof InterfaceClass).toBe('function');
        expect(InterfaceClass.prototype).toBeDefined();
        
        // Should be instantiable
        const instance = new InterfaceClass();
        expect(instance).toBeInstanceOf(InterfaceClass);
      });
    });

    it('should ensure method signatures are consistent', () => {
      // Test that all abstract methods throw appropriate errors
      const validationService = new IStreamValidationService();
      const processingService = new IStreamProcessingService();
      const cacheService = new IStreamCacheService();
      const metricsService = new IStreamMetricsService();
      const handler = new IStreamHandler();

      // All methods should throw "must be implemented" errors
      expect(() => validationService.isSupportedType('movie')).toThrow(/must be implemented/);
      expect(() => processingService.convertSizeToBytes(1024)).toThrow(/must be implemented/);
      expect(() => cacheService.getCacheTTLByType('movie', 5)).toThrow(/must be implemented/);
      expect(() => metricsService.getMetrics()).toThrow(/must be implemented/);
      expect(() => handler.createAddonHandler()).toThrow(/must be implemented/);
    });

    it('should ensure async methods return promises that reject', async () => {
      const validationService = new IStreamValidationService();
      const processingService = new IStreamProcessingService();
      const handler = new IStreamHandler();

      // Test actual async methods (those marked with async in interface)
      await expect(validationService.validateStreamRequest({})).rejects.toThrow();
      await expect(processingService.getMagnets('tt1234567', 'movie')).rejects.toThrow();
      await expect(handler.handleStreamRequest({})).rejects.toThrow();
    });
  });

  describe('Type Definitions and JSDoc', () => {
    it('should have proper typedef structures available', () => {
      // These are compile-time checks, but we can verify the interfaces exist
      expect(IStreamValidationService).toBeDefined();
      expect(IStreamProcessingService).toBeDefined();
      expect(IStreamCacheService).toBeDefined();
      expect(IStreamMetricsService).toBeDefined();
      expect(IStreamHandler).toBeDefined();
    });

    it('should export all required constants and interfaces', () => {
      expect(SERVICE_DEPENDENCIES).toBeDefined();
      expect(SERVICE_EVENTS).toBeDefined();
      expect(SERVICE_ERROR_TYPES).toBeDefined();
    });
  });

  describe('Dependency Injection Contracts', () => {
    it('should define proper dependency injection contracts', () => {
      // Verify that each service has its dependencies properly defined
      Object.keys(SERVICE_DEPENDENCIES).forEach(serviceName => {
        const dependencies = SERVICE_DEPENDENCIES[serviceName];
        expect(Array.isArray(dependencies)).toBe(true);
        expect(dependencies.length).toBeGreaterThan(0);
        
        // Each dependency should be a string
        dependencies.forEach(dep => {
          expect(typeof dep).toBe('string');
          expect(dep.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have consistent dependency naming', () => {
      const allDependencies = Object.values(SERVICE_DEPENDENCIES).flat();
      const uniqueDependencies = [...new Set(allDependencies)];
      
      // Common dependencies should follow naming conventions
      const commonDeps = ['logger', 'config'];
      commonDeps.forEach(dep => {
        if (allDependencies.includes(dep)) {
          expect(dep).toMatch(/^[a-z][a-zA-Z]*$/);
        }
      });
    });
  });
});