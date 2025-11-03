/**
 * @fileoverview Tests unitarios para IdDetectorService
 * Valida detección de patrones de ID, validación y tipos soportados
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IdDetectorService, idDetectorService } from '@/infrastructure/services/IdDetectorService.js';

describe('IdDetectorService', () => {
  let service;

  beforeEach(() => {
    service = new IdDetectorService();
  });

  describe('Constructor', () => {
    it('should initialize detection patterns', () => {
      expect(service.detectionPatterns).toBeInstanceOf(Map);
      expect(service.urlPatterns).toBeInstanceOf(Map);
      expect(service.detectionPatterns.size).toBeGreaterThan(0);
    });

    it('should have patterns for all major ID types', () => {
      const expectedTypes = [
        'imdb', 'imdb_series',
        'kitsu', 'kitsu_series',
        'mal', 'mal_series',
        'anilist', 'anilist_series',
        'anidb', 'anidb_series'
      ];

      expectedTypes.forEach(type => {
        expect(service.detectionPatterns.has(type)).toBe(true);
      });
    });
  });

  describe('IMDb ID Detection', () => {
    describe('detectIdType()', () => {
      it('should detect basic IMDb movie ID', () => {
        const result = service.detectIdType('tt1234567');
        
        expect(result).toEqual({
          type: 'imdb',
          isValid: true,
          normalizedId: 'tt1234567',
          service: 'imdb',
          contentType: 'movie'
        });
      });

      it('should detect IMDb series ID with season and episode', () => {
        const result = service.detectIdType('tt1234567:1:5');
        
        expect(result).toEqual({
          type: 'imdb_series',
          isValid: true,
          normalizedId: 'tt1234567:1:5',
          service: 'imdb',
          contentType: 'series',
          season: 1,
          episode: 5
        });
      });

      it('should reject invalid IMDb format', () => {
        const result = service.detectIdType('tt123');
        
        expect(result.isValid).toBe(false);
        expect(result.type).toBe('unknown');
      });

      it('should reject IMDb ID without tt prefix', () => {
        const result = service.detectIdType('1234567');
        
        expect(result.type).not.toBe('imdb');
      });
    });
  });

  describe('Kitsu ID Detection', () => {
    describe('detectIdType()', () => {
      it('should detect Kitsu ID with prefix', () => {
        const result = service.detectIdType('kitsu:12345');
        
        expect(result).toEqual({
          type: 'kitsu',
          isValid: true,
          normalizedId: 'kitsu:12345',
          service: 'kitsu',
          contentType: 'anime'
        });
      });

      it('should detect Kitsu series ID', () => {
        const result = service.detectIdType('kitsu:12345:1');
        
        expect(result).toEqual({
          type: 'kitsu_series',
          isValid: true,
          normalizedId: 'kitsu:12345:1',
          service: 'kitsu',
          contentType: 'anime',
          season: 1
        });
      });

      it('should handle Kitsu ID without prefix', () => {
        const result = service.detectIdType('12345');
        
        // Should not be detected as kitsu without explicit prefix
        expect(result.service).not.toBe('kitsu');
      });
    });
  });

  describe('Anime Service ID Detection', () => {
    const animeServices = ['mal', 'anilist', 'anidb'];

    animeServices.forEach(serviceName => {
      describe(`${serviceName.toUpperCase()} ID Detection`, () => {
        it(`should detect ${serviceName} ID with prefix`, () => {
          const result = service.detectIdType(`${serviceName}:12345`);
          
          expect(result.service).toBe(serviceName);
          expect(result.contentType).toBe('anime');
          expect(result.isValid).toBe(true);
        });

        it(`should detect ${serviceName} ID without prefix`, () => {
          const result = service.detectIdType('12345');
          
          // Without prefix, it might be detected as numeric but not specifically as this service
          expect(result.isValid).toBe(true);
        });

        it(`should detect ${serviceName} series ID`, () => {
          const result = service.detectIdType(`${serviceName}:12345:1:5`);
          
          expect(result.type).toBe(`${serviceName}_series`);
          expect(result.service).toBe(serviceName);
          expect(result.contentType).toBe('anime');
          expect(result.season).toBe(1);
          expect(result.episode).toBe(5);
        });

        it(`should reject invalid ${serviceName} format`, () => {
          const result = service.detectIdType(`${serviceName}:invalid`);
          
          expect(result.isValid).toBe(false);
        });
      });
    });
  });

  describe('URL Pattern Detection', () => {
    describe('detectFromUrl()', () => {
      it('should detect IMDb URL', () => {
        const url = 'https://www.imdb.com/title/tt1234567/';
        const result = service.detectFromUrl(url);
        
        expect(result.service).toBe('imdb');
        expect(result.id).toBe('tt1234567');
        expect(result.isValid).toBe(true);
      });

      it('should detect MyAnimeList URL', () => {
        const url = 'https://myanimelist.net/anime/12345/title';
        const result = service.detectFromUrl(url);
        
        expect(result.service).toBe('mal');
        expect(result.id).toBe('12345');
        expect(result.isValid).toBe(true);
      });

      it('should detect AniList URL', () => {
        const url = 'https://anilist.co/anime/12345/title';
        const result = service.detectFromUrl(url);
        
        expect(result.service).toBe('anilist');
        expect(result.id).toBe('12345');
        expect(result.isValid).toBe(true);
      });

      it('should detect Kitsu URL', () => {
        const url = 'https://kitsu.io/anime/12345';
        const result = service.detectFromUrl(url);
        
        expect(result.service).toBe('kitsu');
        expect(result.id).toBe('12345');
        expect(result.isValid).toBe(true);
      });

      it('should return null for unrecognized URL', () => {
        const url = 'https://example.com/unknown';
        const result = service.detectFromUrl(url);
        
        expect(result).toBe(null);
      });

      it('should handle malformed URLs gracefully', () => {
        const url = 'not-a-url';
        const result = service.detectFromUrl(url);
        
        expect(result).toBe(null);
      });
    });
  });

  describe('ID Validation', () => {
    describe('validateId()', () => {
      it('should validate correct IMDb ID', () => {
        const result = service.validateId('tt1234567', 'imdb');
        
        expect(result).toBe(true);
      });

      it('should reject incorrect IMDb ID', () => {
        const result = service.validateId('tt123', 'imdb');
        
        expect(result).toBe(false);
      });

      it('should validate numeric anime service IDs', () => {
        const services = ['mal', 'anilist', 'anidb'];
        
        services.forEach(service => {
          expect(service.validateId('12345', service)).toBe(true);
          expect(service.validateId('invalid', service)).toBe(false);
        });
      });

      it('should validate Kitsu IDs', () => {
        expect(service.validateId('kitsu:12345', 'kitsu')).toBe(true);
        expect(service.validateId('12345', 'kitsu')).toBe(false);
      });

      it('should return false for unknown service', () => {
        const result = service.validateId('12345', 'unknown-service');
        
        expect(result).toBe(false);
      });
    });
  });

  describe('ID Normalization', () => {
    describe('normalizeId()', () => {
      it('should normalize IMDb ID', () => {
        const result = service.normalizeId('tt1234567', 'imdb');
        
        expect(result).toBe('tt1234567');
      });

      it('should normalize anime service IDs with prefix', () => {
        const result = service.normalizeId('12345', 'mal');
        
        expect(result).toBe('mal:12345');
      });

      it('should preserve existing prefix in anime service IDs', () => {
        const result = service.normalizeId('mal:12345', 'mal');
        
        expect(result).toBe('mal:12345');
      });

      it('should normalize Kitsu ID', () => {
        const result = service.normalizeId('12345', 'kitsu');
        
        expect(result).toBe('kitsu:12345');
      });

      it('should return original ID for unknown service', () => {
        const result = service.normalizeId('12345', 'unknown');
        
        expect(result).toBe('12345');
      });
    });
  });

  describe('Service Detection', () => {
    describe('getServiceFromId()', () => {
      it('should detect service from IMDb ID', () => {
        const result = service.getServiceFromId('tt1234567');
        
        expect(result).toBe('imdb');
      });

      it('should detect service from prefixed anime ID', () => {
        const result = service.getServiceFromId('mal:12345');
        
        expect(result).toBe('mal');
      });

      it('should return null for ambiguous numeric ID', () => {
        const result = service.getServiceFromId('12345');
        
        // Numeric IDs without prefix are ambiguous
        expect(result).toBe(null);
      });

      it('should return null for invalid ID format', () => {
        const result = service.getServiceFromId('invalid-format');
        
        expect(result).toBe(null);
      });
    });
  });

  describe('Content Type Detection', () => {
    describe('getContentTypeFromId()', () => {
      it('should detect movie from basic IMDb ID', () => {
        const result = service.getContentTypeFromId('tt1234567');
        
        expect(result).toBe('movie');
      });

      it('should detect series from IMDb series ID', () => {
        const result = service.getContentTypeFromId('tt1234567:1:5');
        
        expect(result).toBe('series');
      });

      it('should detect anime from anime service IDs', () => {
        const animeIds = ['mal:12345', 'anilist:12345', 'kitsu:12345'];
        
        animeIds.forEach(id => {
          const result = service.getContentTypeFromId(id);
          expect(result).toBe('anime');
        });
      });

      it('should return null for unknown ID format', () => {
        const result = service.getContentTypeFromId('unknown-format');
        
        expect(result).toBe(null);
      });
    });
  });

  describe('Supported Types', () => {
    describe('getSupportedTypes()', () => {
      it('should return all supported ID types', () => {
        const types = service.getSupportedTypes();
        
        expect(types).toBeInstanceOf(Object);
        expect(Object.keys(types).length).toBeGreaterThan(0);
        
        // Check that each type has required properties
        Object.values(types).forEach(typeConfig => {
          expect(typeConfig).toHaveProperty('description');
          expect(typeConfig).toHaveProperty('pattern');
          expect(typeConfig).toHaveProperty('prefix');
        });
      });

      it('should include all major services', () => {
        const types = service.getSupportedTypes();
        const expectedServices = ['imdb', 'kitsu', 'mal', 'anilist', 'anidb'];
        
        expectedServices.forEach(serviceName => {
          const hasService = Object.keys(types).some(key => 
            key.includes(serviceName)
          );
          expect(hasService).toBe(true);
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input gracefully', () => {
      const result = service.detectIdType(null);
      
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('unknown');
    });

    it('should handle undefined input gracefully', () => {
      const result = service.detectIdType(undefined);
      
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('unknown');
    });

    it('should handle empty string input', () => {
      const result = service.detectIdType('');
      
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('unknown');
    });

    it('should handle very long input strings', () => {
      const longString = 'a'.repeat(1000);
      const result = service.detectIdType(longString);
      
      expect(result.isValid).toBe(false);
      expect(result.type).toBe('unknown');
    });

    it('should handle special characters in input', () => {
      const specialChars = 'tt1234567!@#$%';
      const result = service.detectIdType(specialChars);
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(idDetectorService).toBeInstanceOf(IdDetectorService);
    });

    it('should maintain state across calls', () => {
      const result1 = idDetectorService.detectIdType('tt1234567');
      const result2 = idDetectorService.detectIdType('tt1234567');
      
      expect(result1).toEqual(result2);
    });
  });

  describe('Performance', () => {
    it('should handle multiple detections efficiently', () => {
      const testIds = [
        'tt1234567',
        'mal:12345',
        'anilist:67890',
        'kitsu:11111',
        'tt9876543:2:10'
      ];

      const startTime = Date.now();
      
      testIds.forEach(id => {
        service.detectIdType(id);
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (less than 100ms for 5 detections)
      expect(duration).toBeLessThan(100);
    });
  });
});