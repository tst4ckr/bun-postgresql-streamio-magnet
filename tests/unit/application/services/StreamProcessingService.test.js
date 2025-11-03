/**
 * @fileoverview Tests unitarios para StreamProcessingService
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamProcessingService } from '@/application/services/StreamProcessingService.js';
import { MockLogger } from '@/tests/mocks/MockLogger.js';
import { Magnet } from '@/domain/entities/Magnet.js';
import { MagnetNotFoundError } from '@/domain/repositories/MagnetRepository.js';

describe('Application Service: StreamProcessingService', () => {
  let service;
  let mockMagnetRepository;
  let mockUnifiedIdService;
  let mockLogger;

  const sampleMagnets = [
    {
      content_id: 'tt1234567',
      name: 'Test Movie 1080p BluRay x264',
      magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
      quality: '1080p',
      size: '2.5 GB',
      imdb_id: 'tt1234567',
      provider: 'TestProvider',
      seeders: 100,
      peers: 50
    },
    {
      content_id: 'tt1234567',
      name: 'Test Movie 720p WEB-DL x264',
      magnet: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
      quality: '720p',
      size: '1.2 GB',
      imdb_id: 'tt1234567',
      provider: 'TestProvider',
      seeders: 80,
      peers: 30
    }
  ];

  beforeEach(() => {
    mockMagnetRepository = {
      getMagnetsByContentId: vi.fn(),
      getMagnetsByImdbId: vi.fn()
    };

    mockUnifiedIdService = {
      convertToImdb: vi.fn()
    };

    mockLogger = MockLogger.create();

    service = new StreamProcessingService(
      mockMagnetRepository,
      mockUnifiedIdService,
      mockLogger
    );
  });

  describe('Constructor', () => {
    it('should create service with all dependencies', () => {
      expect(service).toBeInstanceOf(StreamProcessingService);
    });

    it('should use console as default logger', () => {
      const serviceWithoutLogger = new StreamProcessingService(
        mockMagnetRepository,
        mockUnifiedIdService
      );
      expect(serviceWithoutLogger).toBeInstanceOf(StreamProcessingService);
    });
  });

  describe('getMagnets', () => {
    const validIdDetection = {
      type: 'imdb',
      isValid: true,
      confidence: 0.95
    };

    beforeEach(() => {
      mockMagnetRepository.getMagnetsByContentId.mockResolvedValue(
        sampleMagnets.map(data => new Magnet(data))
      );
    });

    it('should get magnets successfully with original ID', async () => {
      const result = await service.getMagnets('tt1234567', 'movie', validIdDetection);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Magnet);
      expect(result[0].content_id).toBe('tt1234567');
      expect(result[0].quality).toBe('1080p');
      expect(result[1].quality).toBe('720p');

      expect(mockMagnetRepository.getMagnetsByContentId).toHaveBeenCalledWith(
        'tt1234567',
        'movie'
      );
    });

    it('should handle empty results from repository', async () => {
      mockMagnetRepository.getMagnetsByContentId.mockResolvedValue([]);

      const result = await service.getMagnets('tt1234567', 'movie', validIdDetection);

      expect(result).toEqual([]);
    });

    it('should try ID conversion when original search fails', async () => {
      const kitsuIdDetection = {
        type: 'kitsu',
        isValid: true,
        confidence: 0.90
      };

      // Primera llamada falla (ID original)
      mockMagnetRepository.getMagnetsByContentId
        .mockRejectedValueOnce(new MagnetNotFoundError('kitsu:12345'))
        .mockResolvedValueOnce(sampleMagnets.map(data => new Magnet(data)));

      // Conversión exitosa
      mockUnifiedIdService.convertToImdb.mockResolvedValue({
        success: true,
        imdbId: 'tt1234567'
      });

      const result = await service.getMagnets('kitsu:12345', 'anime', kitsuIdDetection);

      expect(result).toHaveLength(2);
      expect(mockUnifiedIdService.convertToImdb).toHaveBeenCalledWith(
        'kitsu:12345',
        'anime'
      );
      expect(mockMagnetRepository.getMagnetsByContentId).toHaveBeenCalledTimes(2);
    });

    it('should return null when both original and converted searches fail', async () => {
      const kitsuIdDetection = {
        type: 'kitsu',
        isValid: true,
        confidence: 0.90
      };

      // Ambas llamadas fallan
      mockMagnetRepository.getMagnetsByContentId
        .mockRejectedValue(new MagnetNotFoundError('kitsu:12345'));

      mockUnifiedIdService.convertToImdb.mockResolvedValue({
        success: false,
        error: 'Conversion failed'
      });

      const result = await service.getMagnets('kitsu:12345', 'anime', kitsuIdDetection);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No se encontraron magnets para kitsu:12345 con ID original'
      );
    });

    it('should handle repository errors', async () => {
      const repositoryError = new Error('Database connection failed');
      mockMagnetRepository.getMagnetsByContentId.mockRejectedValue(repositoryError);

      await expect(
        service.getMagnets('tt1234567', 'movie', validIdDetection)
      ).rejects.toThrow('Error accessing magnet repository for tt1234567');
    });

    it('should handle conversion service errors', async () => {
      const kitsuIdDetection = {
        type: 'kitsu',
        isValid: true,
        confidence: 0.90
      };

      mockMagnetRepository.getMagnetsByContentId
        .mockRejectedValueOnce(new MagnetNotFoundError('kitsu:12345'));

      const conversionError = new Error('Conversion service unavailable');
      mockUnifiedIdService.convertToImdb.mockRejectedValue(conversionError);

      const result = await service.getMagnets('kitsu:12345', 'anime', kitsuIdDetection);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error en conversión de ID kitsu:12345 a IMDb:',
        conversionError
      );
    });

    it('should skip conversion for IMDb IDs', async () => {
      mockMagnetRepository.getMagnetsByContentId
        .mockRejectedValueOnce(new MagnetNotFoundError('tt1234567'));

      const result = await service.getMagnets('tt1234567', 'movie', validIdDetection);

      expect(result).toBeNull();
      expect(mockUnifiedIdService.convertToImdb).not.toHaveBeenCalled();
    });
  });

  describe('convertMagnetsToStreams', () => {
    let magnets;

    beforeEach(() => {
      magnets = sampleMagnets.map(data => new Magnet(data));
    });

    it('should convert magnets to Stremio streams format', () => {
      const streams = service.convertMagnetsToStreams(magnets, 'movie', {
        type: 'imdb',
        isValid: true
      });

      expect(streams).toHaveLength(2);
      
      const stream1 = streams[0];
      expect(stream1.title).toContain('🎬1080p | TestProvider');
      expect(stream1.title).toContain('(100S)');
      expect(stream1.infoHash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(stream1.sources).toEqual(['tracker:1234567890abcdef1234567890abcdef12345678']);
      expect(stream1.description).toContain('Calidad: 1080p');
      expect(stream1.description).toContain('Tamaño: 2.5 GB');
      expect(stream1.description).toContain('Seeders: 100');

      const stream2 = streams[1];
      expect(stream2.title).toContain('🎬720p | TestProvider');
      expect(stream2.title).toContain('(80S)');
      expect(stream2.infoHash).toBe('abcdef1234567890abcdef1234567890abcdef12');
    });

    it('should handle anime content type', () => {
      const animeMagnets = [{
        ...sampleMagnets[0],
        content_id: 'kitsu:12345',
        name: 'Test Anime Episode 01 1080p',
        season: 1,
        episode: 1,
        language: 'Japanese',
        fansub: 'TestSub'
      }].map(data => new Magnet(data));

      const streams = service.convertMagnetsToStreams(animeMagnets, 'anime', {
        type: 'kitsu',
        isValid: true
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('🎌1080p | TestProvider');
      expect(streams[0].description).toContain('Idioma: Japanese');
      expect(streams[0].description).toContain('Fansub: TestSub');
      expect(streams[0].description).toContain('Temporada 1 - Episodio 1');
    });

    it('should handle series content type', () => {
      const seriesMagnets = [{
        ...sampleMagnets[0],
        name: 'Test Series S02E05 1080p',
        season: 2,
        episode: 5
      }].map(data => new Magnet(data));

      const streams = service.convertMagnetsToStreams(seriesMagnets, 'series', {
        type: 'imdb',
        isValid: true
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('📺1080p | TestProvider | T2E5');
      expect(streams[0].description).toContain('T2E5');
    });

    it('should handle magnets without seeders', () => {
      const magnetsWithoutSeeders = [{
        ...sampleMagnets[0],
        seeders: undefined,
        peers: undefined
      }].map(data => new Magnet(data));

      const streams = service.convertMagnetsToStreams(magnetsWithoutSeeders, 'movie', {
        type: 'imdb',
        isValid: true
      });

      expect(streams[0].title).not.toContain('S)');
      expect(streams[0].description).not.toContain('Seeders:');
    });

    it('should handle magnets with missing optional fields', () => {
      const minimalMagnets = [{
        content_id: 'tt1234567',
        name: 'Minimal Movie',
        magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
        quality: 'SD',
        size: 'N/A'
      }].map(data => new Magnet(data));

      const streams = service.convertMagnetsToStreams(minimalMagnets, 'movie', {
        type: 'imdb',
        isValid: true
      });

      expect(streams).toHaveLength(1);
      expect(streams[0].title).toContain('🎬SD | Unknown');
      expect(streams[0].description).not.toContain('Calidad: SD');
      expect(streams[0].description).not.toContain('Tamaño: N/A');
    });

    it('should extract correct info hash from magnet URL', () => {
      const streams = service.convertMagnetsToStreams(magnets, 'movie', {
        type: 'imdb',
        isValid: true
      });

      expect(streams[0].infoHash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(streams[1].infoHash).toBe('abcdef1234567890abcdef1234567890abcdef12');
    });

    it('should handle empty magnets array', () => {
      const streams = service.convertMagnetsToStreams([], 'movie', {
        type: 'imdb',
        isValid: true
      });

      expect(streams).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined inputs gracefully', async () => {
      const result1 = await service.getMagnets(null, 'movie', { type: 'imdb', isValid: true });
      const result2 = await service.getMagnets('tt1234567', null, { type: 'imdb', isValid: true });
      const result3 = await service.getMagnets('tt1234567', 'movie', null);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });

    it('should handle invalid ID detection', async () => {
      const invalidIdDetection = {
        type: 'unknown',
        isValid: false,
        error: 'Invalid format'
      };

      const result = await service.getMagnets('invalid-id', 'movie', invalidIdDetection);
      expect(result).toBeNull();
    });

    it('should handle malformed magnet URLs', () => {
      const malformedMagnets = [{
        content_id: 'tt1234567',
        name: 'Test Movie',
        magnet: 'invalid-magnet-url',
        quality: '1080p',
        size: '2.5 GB'
      }].map(data => new Magnet(data));

      expect(() => {
        service.convertMagnetsToStreams(malformedMagnets, 'movie', {
          type: 'imdb',
          isValid: true
        });
      }).not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large number of magnets efficiently', () => {
      const largeMagnetSet = Array.from({ length: 1000 }, (_, i) => ({
        content_id: 'tt1234567',
        name: `Test Movie ${i} 1080p`,
        magnet: `magnet:?xt=urn:btih:${i.toString().padStart(40, '0')}`,
        quality: '1080p',
        size: '2.5 GB',
        seeders: i,
        peers: Math.floor(i / 2)
      })).map(data => new Magnet(data));

      const startTime = Date.now();
      const streams = service.convertMagnetsToStreams(largeMagnetSet, 'movie', {
        type: 'imdb',
        isValid: true
      });
      const endTime = Date.now();

      expect(streams).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow from ID to streams', async () => {
      const kitsuIdDetection = {
        type: 'kitsu',
        isValid: true,
        confidence: 0.90
      };

      // Simular flujo completo: falla original, conversión exitosa, magnets encontrados
      mockMagnetRepository.getMagnetsByContentId
        .mockRejectedValueOnce(new MagnetNotFoundError('kitsu:12345'))
        .mockResolvedValueOnce(sampleMagnets.map(data => new Magnet(data)));

      mockUnifiedIdService.convertToImdb.mockResolvedValue({
        success: true,
        imdbId: 'tt1234567'
      });

      const magnets = await service.getMagnets('kitsu:12345', 'anime', kitsuIdDetection);
      expect(magnets).toHaveLength(2);

      const streams = service.convertMagnetsToStreams(magnets, 'anime', kitsuIdDetection);
      expect(streams).toHaveLength(2);
      expect(streams[0].title).toContain('🎌');
    });
  });
});