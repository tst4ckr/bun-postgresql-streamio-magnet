/**
 * @fileoverview Tests unitarios para la interfaz MagnetRepository
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '@/domain/repositories/MagnetRepository.js';
import { Magnet } from '@/domain/entities/Magnet.js';

describe('Domain Repository Interface: MagnetRepository', () => {
  let repository;

  beforeEach(() => {
    repository = new MagnetRepository();
  });

  describe('Interface Contract', () => {
    it('should be instantiable', () => {
      expect(repository).toBeInstanceOf(MagnetRepository);
    });

    it('should have all required methods', () => {
      expect(typeof repository.getMagnetsByImdbId).toBe('function');
      expect(typeof repository.getMagnetsByContentId).toBe('function');
      expect(typeof repository.setPriorityLanguage).toBe('function');
      expect(typeof repository.getPriorityLanguage).toBe('function');
    });

    it('should throw error when getMagnetsByImdbId is not implemented', async () => {
      await expect(repository.getMagnetsByImdbId('tt1234567')).rejects.toThrow(
        'Método getMagnetsByImdbId debe ser implementado por la clase derivada'
      );
    });

    it('should have default implementation for getMagnetsByContentId that delegates to getMagnetsByImdbId', async () => {
      // Spy on getMagnetsByImdbId to verify it's called
      const spy = vi.spyOn(repository, 'getMagnetsByImdbId').mockRejectedValue(
        new Error('Método getMagnetsByImdbId debe ser implementado por la clase derivada')
      );

      await expect(repository.getMagnetsByContentId('tt1234567')).rejects.toThrow(
        'Método getMagnetsByImdbId debe ser implementado por la clase derivada'
      );

      expect(spy).toHaveBeenCalledWith('tt1234567', 'movie');
    });

    it('should pass type parameter correctly in getMagnetsByContentId', async () => {
      const spy = vi.spyOn(repository, 'getMagnetsByImdbId').mockRejectedValue(
        new Error('Método getMagnetsByImdbId debe ser implementado por la clase derivada')
      );

      await expect(repository.getMagnetsByContentId('tt1234567', 'series')).rejects.toThrow();
      expect(spy).toHaveBeenCalledWith('tt1234567', 'series');
    });

    it('should have optional implementation for setPriorityLanguage', () => {
      expect(() => repository.setPriorityLanguage('es')).not.toThrow();
    });

    it('should have optional implementation for getPriorityLanguage', () => {
      expect(repository.getPriorityLanguage()).toBe(null);
    });
  });

  describe('Method Signatures', () => {
    it('getMagnetsByImdbId should accept imdbId and optional type', async () => {
      const mockRepository = new (class extends MagnetRepository {
        async getMagnetsByImdbId(imdbId, type = 'movie') {
          return [];
        }
      })();

      const result = await mockRepository.getMagnetsByImdbId('tt1234567');
      expect(Array.isArray(result)).toBe(true);

      const resultWithType = await mockRepository.getMagnetsByImdbId('tt1234567', 'series');
      expect(Array.isArray(resultWithType)).toBe(true);
    });

    it('getMagnetsByContentId should accept contentId, type, and options', async () => {
      const mockRepository = new (class extends MagnetRepository {
        async getMagnetsByImdbId(imdbId, type = 'movie') {
          return [];
        }
      })();

      const result = await mockRepository.getMagnetsByContentId('tt1234567');
      expect(Array.isArray(result)).toBe(true);

      const resultWithOptions = await mockRepository.getMagnetsByContentId(
        'tt1234567', 
        'series', 
        { limit: 10 }
      );
      expect(Array.isArray(resultWithOptions)).toBe(true);
    });
  });

  describe('Concrete Implementation Example', () => {
    let concreteRepository;

    beforeEach(() => {
      concreteRepository = new (class extends MagnetRepository {
        constructor() {
          super();
          this.priorityLanguage = null;
          this.mockData = [
            {
              content_id: 'tt1234567',
              name: 'Test Movie 1080p',
              magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678',
              quality: '1080p',
              size: '2.5 GB',
              imdb_id: 'tt1234567',
              seeders: 100,
              peers: 50
            },
            {
              content_id: 'tt1234567',
              name: 'Test Movie 720p',
              magnet: 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12',
              quality: '720p',
              size: '1.2 GB',
              imdb_id: 'tt1234567',
              seeders: 80,
              peers: 30
            }
          ];
        }

        async getMagnetsByImdbId(imdbId, type = 'movie') {
          if (!imdbId) {
            throw new RepositoryError('IMDb ID is required');
          }

          const magnets = this.mockData
            .filter(data => data.imdb_id === imdbId)
            .map(data => new Magnet(data));

          if (magnets.length === 0) {
            throw new MagnetNotFoundError(imdbId);
          }

          return magnets;
        }

        setPriorityLanguage(language) {
          this.priorityLanguage = language;
        }

        getPriorityLanguage() {
          return this.priorityLanguage;
        }
      })();
    });

    it('should return magnets for valid IMDb ID', async () => {
      const magnets = await concreteRepository.getMagnetsByImdbId('tt1234567');

      expect(magnets).toHaveLength(2);
      expect(magnets[0]).toBeInstanceOf(Magnet);
      expect(magnets[0].content_id).toBe('tt1234567');
      expect(magnets[0].quality).toBe('1080p');
      expect(magnets[1].quality).toBe('720p');
    });

    it('should throw MagnetNotFoundError for non-existent IMDb ID', async () => {
      await expect(concreteRepository.getMagnetsByImdbId('tt9999999')).rejects.toThrow(MagnetNotFoundError);
    });

    it('should throw RepositoryError for invalid input', async () => {
      await expect(concreteRepository.getMagnetsByImdbId('')).rejects.toThrow(RepositoryError);
      await expect(concreteRepository.getMagnetsByImdbId(null)).rejects.toThrow(RepositoryError);
    });

    it('should handle priority language configuration', () => {
      expect(concreteRepository.getPriorityLanguage()).toBe(null);

      concreteRepository.setPriorityLanguage('es');
      expect(concreteRepository.getPriorityLanguage()).toBe('es');

      concreteRepository.setPriorityLanguage('en');
      expect(concreteRepository.getPriorityLanguage()).toBe('en');
    });

    it('should work with getMagnetsByContentId delegation', async () => {
      const magnets = await concreteRepository.getMagnetsByContentId('tt1234567');

      expect(magnets).toHaveLength(2);
      expect(magnets[0]).toBeInstanceOf(Magnet);
    });
  });
});

describe('Domain Errors: RepositoryError', () => {
  it('should create RepositoryError with message', () => {
    const error = new RepositoryError('Test error message');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('RepositoryError');
    expect(error.message).toBe('Test error message');
  });

  it('should create RepositoryError with message and cause', () => {
    const cause = new Error('Original error');
    const error = new RepositoryError('Test error message', cause);

    expect(error.message).toBe('Test error message');
    expect(error.cause).toBe(cause);
  });

  it('should maintain error stack trace', () => {
    const error = new RepositoryError('Test error');
    expect(error.stack).toBeDefined();
  });
});

describe('Domain Errors: MagnetNotFoundError', () => {
  it('should create MagnetNotFoundError with IMDb ID', () => {
    const error = new MagnetNotFoundError('tt1234567');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MagnetNotFoundError);
    expect(error.name).toBe('MagnetNotFoundError');
    expect(error.message).toBe('No se encontraron magnets para el ID de IMDB: tt1234567');
    expect(error.imdbId).toBe('tt1234567');
  });

  it('should maintain error stack trace', () => {
    const error = new MagnetNotFoundError('tt1234567');
    expect(error.stack).toBeDefined();
  });

  it('should handle different IMDb ID formats', () => {
    const error1 = new MagnetNotFoundError('tt0123456');
    const error2 = new MagnetNotFoundError('tt1234567:1:1');

    expect(error1.imdbId).toBe('tt0123456');
    expect(error2.imdbId).toBe('tt1234567:1:1');
  });
});