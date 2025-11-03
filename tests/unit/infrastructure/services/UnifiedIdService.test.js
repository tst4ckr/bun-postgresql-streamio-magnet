/**
 * @fileoverview Tests unitarios para UnifiedIdService
 * Valida conversión de IDs, caché y mapeo de servicios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnifiedIdService } from '../../../../src/infrastructure/services/UnifiedIdService.js';

describe('UnifiedIdService', () => {
  let unifiedIdService;
  let mockIdDetectorService;
  let mockLogger;
  let mockCacheService;
  let mockConfig;

  beforeEach(() => {
    // Mock dependencies
    mockIdDetectorService = {
      detectIdType: vi.fn(),
      getServiceFromId: vi.fn(),
      normalizeId: vi.fn(),
      validateId: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn()
    };

    mockConfig = {
      cache: {
        conversionTtl: 86400
      }
    };

    // Create service instance with mocked dependencies
    unifiedIdService = new UnifiedIdService({
      idDetectorService: mockIdDetectorService,
      logger: mockLogger,
      cacheService: mockCacheService,
      config: mockConfig
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(unifiedIdService.idDetectorService).toBe(mockIdDetectorService);
      expect(unifiedIdService.logger).toBe(mockLogger);
      expect(unifiedIdService.cacheService).toBe(mockCacheService);
      expect(unifiedIdService.config).toBe(mockConfig);
    });

    it('should initialize with default configuration', () => {
      const service = new UnifiedIdService();
      
      expect(service.CONVERSION_CACHE_TTL).toBe(86400);
      expect(service.SUPPORTED_SERVICES).toEqual(['imdb', 'kitsu', 'mal', 'anilist', 'anidb']);
      expect(service.SERVICE_PRIORITIES).toEqual({
        imdb: 1,
        kitsu: 2,
        mal: 3,
        anilist: 4,
        anidb: 5
      });
    });

    it('should use custom cache TTL from config', () => {
      const customConfig = {
        cache: {
          conversionTtl: 3600
        }
      };
      
      const service = new UnifiedIdService({ config: customConfig });
      
      expect(service.CONVERSION_CACHE_TTL).toBe(3600);
    });
  });

  describe('ID Detection and Validation', () => {
    describe('detectAndValidateId()', () => {
      it('should detect and validate IMDb ID', () => {
        mockIdDetectorService.detectIdType.mockReturnValue({
          type: 'imdb',
          isValid: true,
          normalizedId: 'tt1234567',
          service: 'imdb',
          contentType: 'movie'
        });

        const result = unifiedIdService.detectAndValidateId('tt1234567');

        expect(result).toEqual({
          type: 'imdb',
          isValid: true,
          normalizedId: 'tt1234567',
          service: 'imdb',
          contentType: 'movie'
        });
        expect(mockIdDetectorService.detectIdType).toHaveBeenCalledWith('tt1234567');
      });

      it('should handle invalid ID format', () => {
        mockIdDetectorService.detectIdType.mockReturnValue({
          type: 'unknown',
          isValid: false,
          normalizedId: null,
          service: null,
          contentType: null
        });

        const result = unifiedIdService.detectAndValidateId('invalid-id');

        expect(result.isValid).toBe(false);
        expect(result.type).toBe('unknown');
      });

      it('should handle null input', () => {
        mockIdDetectorService.detectIdType.mockReturnValue({
          type: 'unknown',
          isValid: false,
          normalizedId: null,
          service: null,
          contentType: null
        });

        const result = unifiedIdService.detectAndValidateId(null);

        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('ID Conversion', () => {
    describe('convertId()', () => {
      it('should convert IMDb ID to anime service ID', async () => {
        const cacheKey = 'conversion:tt1234567:imdb:mal';
        mockCacheService.get.mockReturnValue(null);
        mockCacheService.set.mockReturnValue(true);

        // Mock successful conversion
        const mockConversionResult = {
          success: true,
          targetId: 'mal:12345',
          sourceService: 'imdb',
          targetService: 'mal',
          confidence: 0.95
        };

        // Mock the internal conversion method
        vi.spyOn(unifiedIdService, '_performConversion').mockResolvedValue(mockConversionResult);

        const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'mal');

        expect(result).toEqual(mockConversionResult);
        expect(mockCacheService.get).toHaveBeenCalledWith(cacheKey);
        expect(mockCacheService.set).toHaveBeenCalledWith(
          cacheKey,
          mockConversionResult,
          86400
        );
      });

      it('should return cached conversion result', async () => {
        const cacheKey = 'conversion:tt1234567:imdb:mal';
        const cachedResult = {
          success: true,
          targetId: 'mal:12345',
          sourceService: 'imdb',
          targetService: 'mal',
          confidence: 0.95,
          cached: true
        };

        mockCacheService.get.mockReturnValue(cachedResult);

        const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'mal');

        expect(result).toEqual(cachedResult);
        expect(mockCacheService.set).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Conversión encontrada en caché',
          expect.any(Object)
        );
      });

      it('should handle conversion failure', async () => {
        mockCacheService.get.mockReturnValue(null);
        
        const mockFailureResult = {
          success: false,
          error: 'No mapping found',
          sourceService: 'imdb',
          targetService: 'unknown-service'
        };

        vi.spyOn(unifiedIdService, '_performConversion').mockResolvedValue(mockFailureResult);

        const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'unknown-service');

        expect(result.success).toBe(false);
        expect(result.error).toBe('No mapping found');
      });

      it('should handle same source and target service', async () => {
        const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'imdb');

        expect(result).toEqual({
          success: true,
          targetId: 'tt1234567',
          sourceService: 'imdb',
          targetService: 'imdb',
          confidence: 1.0,
          note: 'Same service, no conversion needed'
        });
      });
    });
  });

  describe('Batch Operations', () => {
    describe('convertMultipleIds()', () => {
      it('should convert multiple IDs efficiently', async () => {
        const ids = ['tt1234567', 'tt7654321'];
        const targetService = 'mal';

        // Mock conversions
        vi.spyOn(unifiedIdService, 'convertId')
          .mockResolvedValueOnce({
            success: true,
            targetId: 'mal:12345',
            sourceService: 'imdb',
            targetService: 'mal'
          })
          .mockResolvedValueOnce({
            success: true,
            targetId: 'mal:67890',
            sourceService: 'imdb',
            targetService: 'mal'
          });

        const results = await unifiedIdService.convertMultipleIds(ids, 'imdb', targetService);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        expect(unifiedIdService.convertId).toHaveBeenCalledTimes(2);
      });

      it('should handle mixed success and failure results', async () => {
        const ids = ['tt1234567', 'invalid-id'];
        const targetService = 'mal';

        vi.spyOn(unifiedIdService, 'convertId')
          .mockResolvedValueOnce({
            success: true,
            targetId: 'mal:12345'
          })
          .mockResolvedValueOnce({
            success: false,
            error: 'Invalid ID format'
          });

        const results = await unifiedIdService.convertMultipleIds(ids, 'imdb', targetService);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
      });

      it('should handle empty input array', async () => {
        const results = await unifiedIdService.convertMultipleIds([], 'imdb', 'mal');

        expect(results).toEqual([]);
      });
    });
  });

  describe('Service Priority and Selection', () => {
    describe('selectBestService()', () => {
      it('should select service with highest priority', () => {
        const availableServices = ['anidb', 'imdb', 'mal'];
        
        const result = unifiedIdService.selectBestService(availableServices);

        expect(result).toBe('imdb'); // Highest priority
      });

      it('should return null for empty services array', () => {
        const result = unifiedIdService.selectBestService([]);

        expect(result).toBe(null);
      });

      it('should return null for unsupported services', () => {
        const result = unifiedIdService.selectBestService(['unknown-service']);

        expect(result).toBe(null);
      });

      it('should filter out unsupported services', () => {
        const availableServices = ['unknown-service', 'mal', 'invalid-service'];
        
        const result = unifiedIdService.selectBestService(availableServices);

        expect(result).toBe('mal');
      });
    });
  });

  describe('ID Mapping and Relationships', () => {
    describe('findRelatedIds()', () => {
      it('should find related IDs across services', async () => {
        const sourceId = 'tt1234567';
        const sourceService = 'imdb';

        // Mock conversions to different services
        vi.spyOn(unifiedIdService, 'convertId')
          .mockResolvedValueOnce({
            success: true,
            targetId: 'mal:12345',
            targetService: 'mal'
          })
          .mockResolvedValueOnce({
            success: true,
            targetId: 'anilist:67890',
            targetService: 'anilist'
          })
          .mockResolvedValueOnce({
            success: false,
            targetService: 'kitsu'
          });

        const results = await unifiedIdService.findRelatedIds(sourceId, sourceService);

        expect(results).toEqual({
          sourceId: 'tt1234567',
          sourceService: 'imdb',
          relatedIds: {
            mal: 'mal:12345',
            anilist: 'anilist:67890'
          },
          failedConversions: ['kitsu']
        });
      });

      it('should handle no successful conversions', async () => {
        vi.spyOn(unifiedIdService, 'convertId')
          .mockResolvedValue({ success: false });

        const results = await unifiedIdService.findRelatedIds('tt1234567', 'imdb');

        expect(results.relatedIds).toEqual({});
        expect(results.failedConversions).toHaveLength(4); // All other services failed
      });
    });
  });

  describe('Cache Management', () => {
    describe('clearConversionCache()', () => {
      it('should clear conversion cache for specific ID', () => {
        mockCacheService.delete.mockReturnValue(true);

        unifiedIdService.clearConversionCache('tt1234567', 'imdb');

        expect(mockCacheService.delete).toHaveBeenCalledWith('conversion:tt1234567:imdb:kitsu');
        expect(mockCacheService.delete).toHaveBeenCalledWith('conversion:tt1234567:imdb:mal');
        expect(mockCacheService.delete).toHaveBeenCalledWith('conversion:tt1234567:imdb:anilist');
        expect(mockCacheService.delete).toHaveBeenCalledWith('conversion:tt1234567:imdb:anidb');
      });

      it('should clear cache for specific target service', () => {
        mockCacheService.delete.mockReturnValue(true);

        unifiedIdService.clearConversionCache('tt1234567', 'imdb', 'mal');

        expect(mockCacheService.delete).toHaveBeenCalledWith('conversion:tt1234567:imdb:mal');
        expect(mockCacheService.delete).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    describe('getConversionStats()', () => {
      it('should return conversion statistics', () => {
        // Simulate some conversions
        unifiedIdService._stats = {
          totalConversions: 100,
          successfulConversions: 85,
          failedConversions: 15,
          cacheHits: 60,
          cacheMisses: 40,
          serviceStats: {
            imdb: { conversions: 50, successes: 45 },
            mal: { conversions: 30, successes: 25 },
            anilist: { conversions: 20, successes: 15 }
          }
        };

        const stats = unifiedIdService.getConversionStats();

        expect(stats).toEqual({
          totalConversions: 100,
          successfulConversions: 85,
          failedConversions: 15,
          successRate: '85.00%',
          cacheHits: 60,
          cacheMisses: 40,
          cacheHitRate: '60.00%',
          serviceStats: {
            imdb: { conversions: 50, successes: 45, successRate: '90.00%' },
            mal: { conversions: 30, successes: 25, successRate: '83.33%' },
            anilist: { conversions: 20, successes: 15, successRate: '75.00%' }
          }
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle cache service errors gracefully', async () => {
      mockCacheService.get.mockImplementation(() => {
        throw new Error('Cache error');
      });

      vi.spyOn(unifiedIdService, '_performConversion').mockResolvedValue({
        success: true,
        targetId: 'mal:12345'
      });

      const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'mal');

      expect(result.success).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error accediendo al caché de conversión',
        expect.any(Object)
      );
    });

    it('should handle conversion service errors', async () => {
      mockCacheService.get.mockReturnValue(null);
      
      vi.spyOn(unifiedIdService, '_performConversion').mockRejectedValue(
        new Error('Conversion service unavailable')
      );

      const result = await unifiedIdService.convertId('tt1234567', 'imdb', 'mal');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Conversion service unavailable');
    });
  });

  describe('Configuration', () => {
    describe('updateConfig()', () => {
      it('should update service configuration', () => {
        const newConfig = {
          cache: {
            conversionTtl: 7200
          }
        };

        unifiedIdService.updateConfig(newConfig);

        expect(unifiedIdService.CONVERSION_CACHE_TTL).toBe(7200);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Configuración de UnifiedIdService actualizada',
          newConfig
        );
      });
    });

    describe('getSupportedServices()', () => {
      it('should return list of supported services', () => {
        const services = unifiedIdService.getSupportedServices();

        expect(services).toEqual(['imdb', 'kitsu', 'mal', 'anilist', 'anidb']);
      });
    });

    describe('getServicePriorities()', () => {
      it('should return service priorities', () => {
        const priorities = unifiedIdService.getServicePriorities();

        expect(priorities).toEqual({
          imdb: 1,
          kitsu: 2,
          mal: 3,
          anilist: 4,
          anidb: 5
        });
      });
    });
  });
});