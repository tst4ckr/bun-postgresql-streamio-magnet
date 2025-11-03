/**
 * @fileoverview Tests unitarios para CacheService
 * Valida funcionalidad de caché, TTL, limpieza automática y estadísticas
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService } from '../../../../src/infrastructure/services/CacheService.js';

describe('CacheService', () => {
  let cacheService;
  let mockLogger;

  beforeEach(() => {
    // Mock del logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    // Mock de EnhancedLogger
    vi.doMock('@/infrastructure/utils/EnhancedLogger.js', () => ({
      EnhancedLogger: vi.fn(() => mockLogger)
    }));

    // Mock de configuraciones
    vi.doMock('@/config/addonConfig.js', () => ({
      addonConfig: {
        cache: {
          defaultTTL: 3600000,
          maxSize: 1000,
          cleanupInterval: 300000,
          enableStats: true
        }
      }
    }));

    vi.doMock('@/config/constants.js', () => ({
      CONSTANTS: {
        CACHE: {
          MAX_CACHE_SIZE: 1000
        }
      }
    }));

    cacheService = new CacheService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(cacheService.config).toEqual({
        defaultTTL: 3600000,
        maxSize: 1000,
        cleanupInterval: 300000,
        enableStats: true
      });
      expect(cacheService.cache).toBeInstanceOf(Map);
      expect(cacheService.stats).toEqual({
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        clears: 0
      });
    });
  });

  describe('Basic Cache Operations', () => {
    describe('set()', () => {
      it('should store value with default TTL', () => {
        const result = cacheService.set('test-key', 'test-value');
        
        expect(result).toBe(true);
        expect(cacheService.cache.has('test-key')).toBe(true);
        expect(cacheService.stats.sets).toBe(1);
      });

      it('should store value with custom TTL', () => {
        const customTTL = 5000;
        const result = cacheService.set('test-key', 'test-value', customTTL);
        
        expect(result).toBe(true);
        const entry = cacheService.cache.get('test-key');
        expect(entry.ttl).toBe(customTTL);
      });

      it('should store value with options', () => {
        const options = {
          contentType: 'movie',
          metadata: { quality: '1080p' }
        };
        
        cacheService.set('test-key', 'test-value', null, options);
        
        const entry = cacheService.cache.get('test-key');
        expect(entry.contentType).toBe('movie');
        expect(entry.metadata).toEqual({ quality: '1080p' });
      });

      it('should handle errors gracefully', () => {
        // Simular error en el set
        vi.spyOn(cacheService.cache, 'set').mockImplementation(() => {
          throw new Error('Storage error');
        });

        const result = cacheService.set('test-key', 'test-value');
        
        expect(result).toBe(false);
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('get()', () => {
      it('should retrieve existing value', () => {
        cacheService.set('test-key', 'test-value');
        
        const result = cacheService.get('test-key');
        
        expect(result).toBe('test-value');
        expect(cacheService.stats.hits).toBe(1);
        expect(cacheService.stats.misses).toBe(0);
      });

      it('should return null for non-existent key', () => {
        const result = cacheService.get('non-existent');
        
        expect(result).toBe(null);
        expect(cacheService.stats.hits).toBe(0);
        expect(cacheService.stats.misses).toBe(1);
      });

      it('should return null for expired entry', () => {
        // Set with very short TTL
        cacheService.set('test-key', 'test-value', 1);
        
        // Wait for expiration
        return new Promise(resolve => {
          setTimeout(() => {
            const result = cacheService.get('test-key');
            expect(result).toBe(null);
            expect(cacheService.stats.misses).toBe(1);
            expect(cacheService.cache.has('test-key')).toBe(false);
            resolve();
          }, 10);
        });
      });

      it('should update access statistics on hit', () => {
        cacheService.set('test-key', 'test-value');
        
        cacheService.get('test-key');
        
        const entry = cacheService.cache.get('test-key');
        expect(entry.accessCount).toBe(1);
        expect(entry.lastAccessed).toBeGreaterThan(entry.createdAt);
      });
    });

    describe('delete()', () => {
      it('should delete existing entry', () => {
        cacheService.set('test-key', 'test-value');
        
        const result = cacheService.delete('test-key');
        
        expect(result).toBe(true);
        expect(cacheService.cache.has('test-key')).toBe(false);
        expect(cacheService.stats.deletes).toBe(1);
      });

      it('should return false for non-existent key', () => {
        const result = cacheService.delete('non-existent');
        
        expect(result).toBe(false);
        expect(cacheService.stats.deletes).toBe(0);
      });
    });

    describe('clear()', () => {
      it('should clear all entries', () => {
        cacheService.set('key1', 'value1');
        cacheService.set('key2', 'value2');
        
        cacheService.clear();
        
        expect(cacheService.cache.size).toBe(0);
        expect(cacheService.stats.clears).toBe(1);
      });
    });

    describe('has()', () => {
      it('should return true for existing valid entry', () => {
        cacheService.set('test-key', 'test-value');
        
        const result = cacheService.has('test-key');
        
        expect(result).toBe(true);
      });

      it('should return false for non-existent key', () => {
        const result = cacheService.has('non-existent');
        
        expect(result).toBe(false);
      });

      it('should return false and clean expired entry', () => {
        cacheService.set('test-key', 'test-value', 1);
        
        return new Promise(resolve => {
          setTimeout(() => {
            const result = cacheService.has('test-key');
            expect(result).toBe(false);
            expect(cacheService.cache.has('test-key')).toBe(false);
            resolve();
          }, 10);
        });
      });
    });
  });

  describe('Statistics', () => {
    describe('getStats()', () => {
      it('should return comprehensive statistics', () => {
        cacheService.set('key1', 'value1');
        cacheService.get('key1'); // hit
        cacheService.get('non-existent'); // miss
        cacheService.delete('key1');
        cacheService.clear();
        
        const stats = cacheService.getStats();
        
        expect(stats).toEqual({
          hits: 1,
          misses: 1,
          sets: 1,
          deletes: 1,
          clears: 1,
          totalRequests: 2,
          hitRate: '50.00%',
          currentSize: 0,
          maxSize: 1000,
          memoryUsage: expect.any(String)
        });
      });

      it('should calculate hit rate correctly with no requests', () => {
        const stats = cacheService.getStats();
        
        expect(stats.hitRate).toBe('0%');
        expect(stats.totalRequests).toBe(0);
      });
    });
  });

  describe('Cleanup Operations', () => {
    describe('cleanup()', () => {
      it('should remove expired entries', () => {
        cacheService.set('valid-key', 'valid-value', 10000);
        cacheService.set('expired-key', 'expired-value', 1);
        
        return new Promise(resolve => {
          setTimeout(() => {
            const cleaned = cacheService.cleanup();
            
            expect(cleaned).toBe(1);
            expect(cacheService.has('valid-key')).toBe(true);
            expect(cacheService.has('expired-key')).toBe(false);
            resolve();
          }, 10);
        });
      });

      it('should return 0 when no entries to clean', () => {
        cacheService.set('valid-key', 'valid-value', 10000);
        
        const cleaned = cacheService.cleanup();
        
        expect(cleaned).toBe(0);
      });
    });
  });

  describe('Cache Key Generation', () => {
    describe('generateMagnetCacheKey()', () => {
      it('should generate basic cache key', () => {
        const key = cacheService.generateMagnetCacheKey('tt1234567', 'movie');
        
        expect(key).toBe('magnets:movie:tt1234567');
      });

      it('should include options in cache key', () => {
        const options = { quality: '1080p', language: 'es' };
        const key = cacheService.generateMagnetCacheKey('tt1234567', 'movie', options);
        
        expect(key).toBe('magnets:movie:tt1234567:language:es|quality:1080p');
      });

      it('should sort options consistently', () => {
        const options1 = { quality: '1080p', language: 'es' };
        const options2 = { language: 'es', quality: '1080p' };
        
        const key1 = cacheService.generateMagnetCacheKey('tt1234567', 'movie', options1);
        const key2 = cacheService.generateMagnetCacheKey('tt1234567', 'movie', options2);
        
        expect(key1).toBe(key2);
      });
    });

    describe('generateMetadataCacheKey()', () => {
      it('should generate metadata cache key', () => {
        const key = cacheService.generateMetadataCacheKey('tt1234567', 'movie');
        
        expect(key).toBe('metadata:movie:tt1234567');
      });
    });

    describe('generateStreamCacheKey()', () => {
      it('should generate basic stream cache key', () => {
        const key = cacheService.generateStreamCacheKey('tt1234567', 'movie');
        
        expect(key).toBe('stream:movie:tt1234567:all:es');
      });

      it('should include season and episode for series', () => {
        const options = { season: 1, episode: 5, quality: '720p' };
        const key = cacheService.generateStreamCacheKey('tt1234567', 'series', options);
        
        expect(key).toBe('stream:series:tt1234567:720p:es:s1:e5');
      });
    });
  });

  describe('Pattern Invalidation', () => {
    describe('invalidatePattern()', () => {
      it('should invalidate entries matching pattern', () => {
        cacheService.set('magnets:movie:tt1234567', 'data1');
        cacheService.set('magnets:movie:tt7654321', 'data2');
        cacheService.set('magnets:series:tt1111111', 'data3');
        cacheService.set('metadata:movie:tt1234567', 'data4');
        
        const invalidated = cacheService.invalidatePattern('magnets:movie:*');
        
        expect(invalidated).toBe(2);
        expect(cacheService.has('magnets:movie:tt1234567')).toBe(false);
        expect(cacheService.has('magnets:movie:tt7654321')).toBe(false);
        expect(cacheService.has('magnets:series:tt1111111')).toBe(true);
        expect(cacheService.has('metadata:movie:tt1234567')).toBe(true);
      });

      it('should return 0 when no matches found', () => {
        cacheService.set('test:key', 'value');
        
        const invalidated = cacheService.invalidatePattern('nomatch:*');
        
        expect(invalidated).toBe(0);
      });
    });
  });

  describe('Adaptive TTL', () => {
    describe('calculateAdaptiveTTL()', () => {
      it('should return base TTL for movie content', () => {
        const ttl = cacheService.calculateAdaptiveTTL('movie', 5);
        
        expect(ttl).toBe(2700000); // 45 minutes
      });

      it('should return base TTL for series content', () => {
        const ttl = cacheService.calculateAdaptiveTTL('series', 5);
        
        expect(ttl).toBe(1800000); // 30 minutes
      });

      it('should return base TTL for anime content', () => {
        const ttl = cacheService.calculateAdaptiveTTL('anime', 5);
        
        expect(ttl).toBe(3600000); // 1 hour
      });

      it('should increase TTL for high result count', () => {
        const baseTTL = cacheService.calculateAdaptiveTTL('movie', 5);
        const highResultTTL = cacheService.calculateAdaptiveTTL('movie', 15);
        
        expect(highResultTTL).toBeGreaterThan(baseTTL);
      });

      it('should decrease TTL for low result count', () => {
        const baseTTL = cacheService.calculateAdaptiveTTL('movie', 5);
        const lowResultTTL = cacheService.calculateAdaptiveTTL('movie', 2);
        
        expect(lowResultTTL).toBeLessThan(baseTTL);
      });

      it('should respect minimum and maximum TTL bounds', () => {
        const minTTL = cacheService.calculateAdaptiveTTL('movie', 0);
        const maxTTL = cacheService.calculateAdaptiveTTL('movie', 1000);
        
        expect(minTTL).toBeGreaterThanOrEqual(300000); // 5 minutes minimum
        expect(maxTTL).toBeLessThanOrEqual(86400000); // 24 hours maximum
      });
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      // Set maxSize to 2 for testing
      cacheService.config.maxSize = 2;
      
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      
      // Access key1 to make it more recently used
      cacheService.get('key1');
      
      // Add third entry, should evict key2
      cacheService.set('key3', 'value3');
      
      expect(cacheService.has('key1')).toBe(true);
      expect(cacheService.has('key2')).toBe(false);
      expect(cacheService.has('key3')).toBe(true);
    });
  });

  describe('Access History', () => {
    it('should record access history for adaptive TTL', () => {
      const contentId = 'tt1234567';
      
      // Simulate multiple accesses
      cacheService.set(contentId, 'data');
      cacheService.get(contentId);
      cacheService.get(contentId);
      cacheService.get(contentId);
      
      expect(cacheService.accessHistory.has(contentId)).toBe(true);
      expect(cacheService.accessHistory.get(contentId)).toBeGreaterThan(1);
    });

    it('should clean access history when it grows too large', () => {
      // Fill access history beyond limit
      for (let i = 0; i < 1100; i++) {
        cacheService.accessHistory.set(`key${i}`, i);
      }
      
      // Trigger cleanup by recording new access
      cacheService.set('trigger-key', 'value');
      cacheService.get('trigger-key');
      
      expect(cacheService.accessHistory.size).toBeLessThanOrEqual(500);
    });
  });
});