/**
 * @fileoverview Tests unitarios para StreamValidationService
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamValidationService } from '@/application/services/StreamValidationService.js';
import { MockLogger } from '@/tests/mocks/MockLogger.js';

describe('Application Service: StreamValidationService', () => {
  let service;
  let mockValidationService;
  let mockIdDetectorService;
  let mockLogger;

  beforeEach(() => {
    // Mock del servicio de validación
    mockValidationService = {
      validateStreamArgs: vi.fn(),
      validateContentType: vi.fn(),
      validateContentId: vi.fn()
    };

    // Mock del servicio detector de IDs
    mockIdDetectorService = {
      detectIdType: vi.fn()
    };

    mockLogger = MockLogger.create();

    service = new StreamValidationService(
      mockValidationService,
      mockIdDetectorService,
      mockLogger
    );
  });

  describe('Constructor', () => {
    it('should create service with all dependencies', () => {
      expect(service).toBeInstanceOf(StreamValidationService);
    });

    it('should use console as default logger', () => {
      const serviceWithoutLogger = new StreamValidationService(
        mockValidationService,
        mockIdDetectorService
      );
      expect(serviceWithoutLogger).toBeInstanceOf(StreamValidationService);
    });
  });

  describe('validateStreamRequest', () => {
    const validArgs = {
      type: 'movie',
      id: 'tt1234567'
    };

    beforeEach(() => {
      mockValidationService.validateStreamArgs.mockResolvedValue({
        isValid: true,
        normalizedArgs: validArgs
      });

      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'imdb',
        isValid: true,
        confidence: 0.95
      });
    });

    it('should validate successful stream request', async () => {
      const result = await service.validateStreamRequest(validArgs);

      expect(result.isValid).toBe(true);
      expect(result.normalizedArgs).toEqual(validArgs);
      expect(result.idDetection.type).toBe('imdb');
      expect(result.idDetection.isValid).toBe(true);

      expect(mockValidationService.validateStreamArgs).toHaveBeenCalledWith(validArgs);
      expect(mockIdDetectorService.detectIdType).toHaveBeenCalledWith('tt1234567');
    });

    it('should handle validation service errors', async () => {
      mockValidationService.validateStreamArgs.mockResolvedValue({
        isValid: false,
        error: 'Invalid type'
      });

      const result = await service.validateStreamRequest(validArgs);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid type');
      expect(result.normalizedArgs).toBeUndefined();
      expect(result.idDetection).toBeUndefined();
    });

    it('should handle ID detection errors', async () => {
      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'unknown',
        isValid: false,
        error: 'Invalid ID format'
      });

      const result = await service.validateStreamRequest(validArgs);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid ID format');
      expect(result.normalizedArgs).toEqual(validArgs);
      expect(result.idDetection.type).toBe('unknown');
    });

    it('should handle validation service exceptions', async () => {
      const error = new Error('Validation service error');
      mockValidationService.validateStreamArgs.mockRejectedValue(error);

      const result = await service.validateStreamRequest(validArgs);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Error en validación: Validation service error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error en validateStreamRequest:',
        error
      );
    });

    it('should handle ID detector service exceptions', async () => {
      const error = new Error('ID detector error');
      mockIdDetectorService.detectIdType.mockImplementation(() => {
        throw error;
      });

      const result = await service.validateStreamRequest(validArgs);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('ID detector error');
      expect(result.idDetection.type).toBe('unknown');
      expect(result.idDetection.isValid).toBe(false);
    });

    it('should log debug information for valid detection', async () => {
      await service.validateStreamRequest(validArgs);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ID detectado: tt1234567 -> imdb (válido: true)'
      );
    });

    it('should log error for detection failures', async () => {
      const error = new Error('Detection failed');
      mockIdDetectorService.detectIdType.mockImplementation(() => {
        throw error;
      });

      await service.validateStreamRequest(validArgs);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error detectando tipo de ID para tt1234567: Detection failed'
      );
    });
  });

  describe('isSupportedType', () => {
    it('should return true for supported types', () => {
      expect(service.isSupportedType('movie')).toBe(true);
      expect(service.isSupportedType('series')).toBe(true);
      expect(service.isSupportedType('anime')).toBe(true);
      expect(service.isSupportedType('tv')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(service.isSupportedType('music')).toBe(false);
      expect(service.isSupportedType('book')).toBe(false);
      expect(service.isSupportedType('game')).toBe(false);
      expect(service.isSupportedType('')).toBe(false);
      expect(service.isSupportedType(null)).toBe(false);
      expect(service.isSupportedType(undefined)).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(service.isSupportedType('Movie')).toBe(false);
      expect(service.isSupportedType('MOVIE')).toBe(false);
      expect(service.isSupportedType('Series')).toBe(false);
    });
  });

  describe('detectContentIdType', () => {
    it('should detect valid IMDb ID', () => {
      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'imdb',
        isValid: true,
        confidence: 0.95,
        metadata: { format: 'tt1234567' }
      });

      const result = service.detectContentIdType('tt1234567');

      expect(result.type).toBe('imdb');
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(mockIdDetectorService.detectIdType).toHaveBeenCalledWith('tt1234567');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ID detectado: tt1234567 -> imdb (válido: true)'
      );
    });

    it('should detect valid Kitsu ID', () => {
      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'kitsu',
        isValid: true,
        confidence: 0.90,
        metadata: { format: 'kitsu:12345' }
      });

      const result = service.detectContentIdType('kitsu:12345');

      expect(result.type).toBe('kitsu');
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(0.90);
    });

    it('should handle empty or null ID', () => {
      const result1 = service.detectContentIdType('');
      const result2 = service.detectContentIdType(null);
      const result3 = service.detectContentIdType(undefined);

      [result1, result2, result3].forEach(result => {
        expect(result.type).toBe('unknown');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('ID vacío');
      });

      expect(mockIdDetectorService.detectIdType).not.toHaveBeenCalled();
    });

    it('should handle detection service errors', () => {
      const error = new Error('Detection service error');
      mockIdDetectorService.detectIdType.mockImplementation(() => {
        throw error;
      });

      const result = service.detectContentIdType('invalid-id');

      expect(result.type).toBe('unknown');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Detection service error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error detectando tipo de ID para invalid-id: Detection service error'
      );
    });

    it('should handle unknown ID types', () => {
      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'unknown',
        isValid: false,
        confidence: 0.0,
        error: 'Unrecognized ID format'
      });

      const result = service.detectContentIdType('unknown-format-123');

      expect(result.type).toBe('unknown');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unrecognized ID format');
    });
  });

  describe('extractSeasonEpisode', () => {
    it('should extract season and episode from IMDb series ID', () => {
      const result = service.extractSeasonEpisode('tt1234567:2:5');

      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });

    it('should extract only season from IMDb series ID', () => {
      const result = service.extractSeasonEpisode('tt1234567:3');

      expect(result.season).toBe(3);
      expect(result.episode).toBeNull();
    });

    it('should return null for movie IDs', () => {
      const result = service.extractSeasonEpisode('tt1234567');

      expect(result.season).toBeNull();
      expect(result.episode).toBeNull();
    });

    it('should handle invalid season/episode numbers', () => {
      const result1 = service.extractSeasonEpisode('tt1234567:abc:def');
      const result2 = service.extractSeasonEpisode('tt1234567:0:0');

      [result1, result2].forEach(result => {
        expect(result.season).toBeNull();
        expect(result.episode).toBeNull();
      });
    });

    it('should handle empty or invalid IDs', () => {
      const result1 = service.extractSeasonEpisode('');
      const result2 = service.extractSeasonEpisode(null);
      const result3 = service.extractSeasonEpisode('invalid-format');

      [result1, result2, result3].forEach(result => {
        expect(result.season).toBeNull();
        expect(result.episode).toBeNull();
      });
    });

    it('should handle edge cases with extra colons', () => {
      const result = service.extractSeasonEpisode('tt1234567:2:5:extra');

      expect(result.season).toBe(2);
      expect(result.episode).toBe(5);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete validation workflow', async () => {
      const args = { type: 'series', id: 'tt1234567:2:5' };

      mockValidationService.validateStreamArgs.mockResolvedValue({
        isValid: true,
        normalizedArgs: args
      });

      mockIdDetectorService.detectIdType.mockReturnValue({
        type: 'imdb',
        isValid: true,
        confidence: 0.95
      });

      const result = await service.validateStreamRequest(args);

      expect(result.isValid).toBe(true);
      expect(result.normalizedArgs).toEqual(args);
      expect(result.idDetection.type).toBe('imdb');

      // Verificar que se pueden extraer temporada y episodio
      const seasonEpisode = service.extractSeasonEpisode(args.id);
      expect(seasonEpisode.season).toBe(2);
      expect(seasonEpisode.episode).toBe(5);

      // Verificar que el tipo es soportado
      expect(service.isSupportedType(args.type)).toBe(true);
    });

    it('should handle validation failure cascade', async () => {
      const args = { type: 'invalid', id: 'bad-id' };

      mockValidationService.validateStreamArgs.mockResolvedValue({
        isValid: false,
        error: 'Unsupported type'
      });

      const result = await service.validateStreamRequest(args);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported type');

      // Verificar que el tipo no es soportado
      expect(service.isSupportedType(args.type)).toBe(false);

      // ID detection no debería ser llamado si la validación falla
      expect(mockIdDetectorService.detectIdType).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle all types of errors gracefully', async () => {
      const testCases = [
        {
          name: 'Network error',
          error: new Error('Network timeout'),
          expectedMessage: 'Error en validación: Network timeout'
        },
        {
          name: 'Validation error',
          error: new TypeError('Invalid argument type'),
          expectedMessage: 'Error en validación: Invalid argument type'
        },
        {
          name: 'Service unavailable',
          error: new Error('Service temporarily unavailable'),
          expectedMessage: 'Error en validación: Service temporarily unavailable'
        }
      ];

      for (const testCase of testCases) {
        mockValidationService.validateStreamArgs.mockRejectedValue(testCase.error);

        const result = await service.validateStreamRequest({ type: 'movie', id: 'tt1234567' });

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(testCase.expectedMessage);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error en validateStreamRequest:',
          testCase.error
        );
      }
    });
  });
});