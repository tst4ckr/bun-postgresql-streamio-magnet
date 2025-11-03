/**
 * @fileoverview Tests unitarios para la entidad Magnet
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Magnet } from '@/domain/entities/Magnet.js';
import { MockDataGenerator } from '@tests/mocks/mockData.js';

describe('Domain Entity: Magnet', () => {
  let validMagnetData;

  beforeEach(() => {
    validMagnetData = {
      content_id: 'tt1234567',
      name: 'Test Movie 2024 1080p BluRay x264-TEST',
      magnet: 'magnet:?xt=urn:btih:a1b2c3d4e5f6789012345678901234567890abcd&dn=Test+Movie+2024&tr=udp://tracker.example.com:80',
      quality: '1080p',
      size: '1.5 GB',
      imdb_id: 'tt1234567',
      id_type: 'imdb',
      provider: 'test-provider',
      filename: 'Test.Movie.2024.1080p.BluRay.x264-TEST.mkv',
      seeders: 100,
      peers: 50
    };
  });

  describe('Constructor', () => {
    it('should create a valid Magnet instance with all fields', () => {
      const magnet = new Magnet(validMagnetData);

      expect(magnet.content_id).toBe(validMagnetData.content_id);
      expect(magnet.name).toBe(validMagnetData.name);
      expect(magnet.magnet).toBe(validMagnetData.magnet);
      expect(magnet.quality).toBe(validMagnetData.quality);
      expect(magnet.size).toBe(validMagnetData.size);
      expect(magnet.imdb_id).toBe(validMagnetData.imdb_id);
      expect(magnet.id_type).toBe(validMagnetData.id_type);
      expect(magnet.provider).toBe(validMagnetData.provider);
      expect(magnet.filename).toBe(validMagnetData.filename);
      expect(magnet.seeders).toBe(validMagnetData.seeders);
      expect(magnet.peers).toBe(validMagnetData.peers);
    });

    it('should create a valid Magnet instance with only required fields', () => {
      const minimalData = {
        content_id: 'tt1234567',
        name: 'Test Movie 2024',
        magnet: 'magnet:?xt=urn:btih:a1b2c3d4e5f6789012345678901234567890abcd',
        quality: '1080p',
        size: '1.5 GB'
      };

      const magnet = new Magnet(minimalData);

      expect(magnet.content_id).toBe(minimalData.content_id);
      expect(magnet.name).toBe(minimalData.name);
      expect(magnet.magnet).toBe(minimalData.magnet);
      expect(magnet.quality).toBe(minimalData.quality);
      expect(magnet.size).toBe(minimalData.size);
      expect(magnet.id_type).toBe('imdb'); // valor por defecto
    });

    it('should be immutable after creation', () => {
      const magnet = new Magnet(validMagnetData);

      expect(() => {
        magnet.content_id = 'modified';
      }).toThrow();

      expect(() => {
        magnet.name = 'Modified Name';
      }).toThrow();

      expect(Object.isFrozen(magnet)).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should throw error when content_id is missing', () => {
      const invalidData = { ...validMagnetData };
      delete invalidData.content_id;

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when name is missing', () => {
      const invalidData = { ...validMagnetData };
      delete invalidData.name;

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when magnet is missing', () => {
      const invalidData = { ...validMagnetData };
      delete invalidData.magnet;

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when quality is missing', () => {
      const invalidData = { ...validMagnetData };
      delete invalidData.quality;

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when size is missing', () => {
      const invalidData = { ...validMagnetData };
      delete invalidData.size;

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when magnet URL is invalid', () => {
      const invalidData = {
        ...validMagnetData,
        magnet: 'invalid-magnet-url'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when magnet URL does not start with magnet:?xt=urn:btih:', () => {
      const invalidData = {
        ...validMagnetData,
        magnet: 'http://example.com/torrent'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when imdb_id format is invalid', () => {
      const invalidData = {
        ...validMagnetData,
        imdb_id: 'invalid-imdb-id'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should accept valid imdb_id formats', () => {
      const validImdbIds = [
        'tt1234567',
        'tt1234567:1',
        'tt1234567:1:2'
      ];

      validImdbIds.forEach(imdbId => {
        const data = { ...validMagnetData, imdb_id: imdbId };
        expect(() => new Magnet(data)).not.toThrow();
      });
    });

    it('should throw error when id_type is invalid', () => {
      const invalidData = {
        ...validMagnetData,
        id_type: 'invalid-type'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should accept valid id_type values', () => {
      const validIdTypes = ['imdb', 'tmdb', 'tvdb', 'kitsu', 'anilist', 'mal'];

      validIdTypes.forEach(idType => {
        const data = { ...validMagnetData, id_type: idType };
        expect(() => new Magnet(data)).not.toThrow();
      });
    });

    it('should throw error when seeders is not a number', () => {
      const invalidData = {
        ...validMagnetData,
        seeders: 'not-a-number'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });

    it('should throw error when peers is not a number', () => {
      const invalidData = {
        ...validMagnetData,
        peers: 'not-a-number'
      };

      expect(() => new Magnet(invalidData)).toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero seeders and peers', () => {
      const data = {
        ...validMagnetData,
        seeders: 0,
        peers: 0
      };

      const magnet = new Magnet(data);
      expect(magnet.seeders).toBe(0);
      expect(magnet.peers).toBe(0);
    });

    it('should handle very long magnet URLs', () => {
      const longMagnet = 'magnet:?xt=urn:btih:a1b2c3d4e5f6789012345678901234567890abcd' +
        '&dn=Very+Long+Movie+Name+With+Many+Details+2024+1080p+BluRay+x264+DTS+HD+MA+7.1' +
        '&tr=udp://tracker1.example.com:80' +
        '&tr=udp://tracker2.example.com:80' +
        '&tr=udp://tracker3.example.com:80';

      const data = {
        ...validMagnetData,
        magnet: longMagnet
      };

      expect(() => new Magnet(data)).not.toThrow();
    });

    it('should handle special characters in name', () => {
      const data = {
        ...validMagnetData,
        name: 'Test Movie: The Sequel (2024) [1080p] {BluRay} - Director\'s Cut'
      };

      const magnet = new Magnet(data);
      expect(magnet.name).toBe(data.name);
    });

    it('should handle unicode characters in name', () => {
      const data = {
        ...validMagnetData,
        name: 'Película de Prueba 2024 - Ñoño & Niña'
      };

      const magnet = new Magnet(data);
      expect(magnet.name).toBe(data.name);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data integrity after creation', () => {
      const magnet = new Magnet(validMagnetData);
      const originalData = { ...validMagnetData };

      // Verificar que los datos no han cambiado
      expect(magnet.content_id).toBe(originalData.content_id);
      expect(magnet.name).toBe(originalData.name);
      expect(magnet.magnet).toBe(originalData.magnet);
      expect(magnet.quality).toBe(originalData.quality);
      expect(magnet.size).toBe(originalData.size);
    });

    it('should not be affected by changes to original data object', () => {
      const originalData = { ...validMagnetData };
      const magnet = new Magnet(originalData);

      // Modificar el objeto original
      originalData.name = 'Modified Name';
      originalData.quality = 'Modified Quality';

      // Verificar que el magnet no se ve afectado
      expect(magnet.name).toBe(validMagnetData.name);
      expect(magnet.quality).toBe(validMagnetData.quality);
    });
  });

  describe('Integration with MockDataGenerator', () => {
    it('should work with MockDataGenerator.createStream', () => {
      const streamData = MockDataGenerator.createStream({
        name: 'Generated Test Movie 2024 1080p',
        quality: '1080p',
        size: '2.1 GB'
      });

      // Convertir stream data a magnet data
      const magnetData = {
        content_id: 'tt1234567',
        name: streamData.name,
        magnet: `magnet:?xt=urn:btih:${streamData.infoHash}`,
        quality: streamData.quality || '1080p',
        size: streamData.size ? `${(streamData.size / 1073741824).toFixed(1)} GB` : '1.0 GB'
      };

      expect(() => new Magnet(magnetData)).not.toThrow();
    });
  });
});