/**
 * @fileoverview Tests unitarios para CSVMagnetRepository
 * Valida carga de CSV, indexación de magnets y operaciones de búsqueda
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { CSVMagnetRepository } from '../../../../src/infrastructure/repositories/CSVMagnetRepository.js';
import { MagnetNotFoundError, RepositoryError } from '../../../../src/domain/repositories/MagnetRepository.js';
import { Magnet } from '../../../../src/domain/entities/Magnet.js';

// Mock dependencies
vi.mock('fs');
vi.mock('csv-parser');
vi.mock('@/domain/entities/Magnet.js');

describe('CSVMagnetRepository', () => {
  let repository;
  let mockLogger;
  let mockStream;
  let mockCsvParser;

  const testFilePath = '/path/to/test.csv';

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock CSV parser
    mockCsvParser = {
      [Symbol.asyncIterator]: vi.fn()
    };

    // Mock file stream
    mockStream = {
      pipe: vi.fn().mockReturnValue(mockCsvParser)
    };

    // Setup mocks
    createReadStream.mockReturnValue(mockStream);
    csv.mockReturnValue(mockCsvParser);

    // Mock Magnet constructor
    Magnet.mockImplementation((data) => ({
      ...data,
      content_id: data.content_id,
      imdb_id: data.imdb_id,
      name: data.name,
      magnet: data.magnet,
      quality: data.quality,
      size: data.size
    }));

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with required parameters', () => {
      repository = new CSVMagnetRepository(testFilePath);

      expect(repository).toBeInstanceOf(CSVMagnetRepository);
    });

    it('should initialize with custom logger', () => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);

      expect(repository).toBeInstanceOf(CSVMagnetRepository);
    });

    it('should use console as default logger', () => {
      repository = new CSVMagnetRepository(testFilePath);

      expect(repository).toBeInstanceOf(CSVMagnetRepository);
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should initialize successfully with valid CSV data', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          imdb_id: 'tt1234567',
          name: 'Test Movie 2023',
          magnet: 'magnet:?xt=urn:btih:test123',
          quality: '1080p',
          size: '2.5GB',
          seeders: '100',
          peers: '50'
        },
        {
          content_id: 'tt7654321',
          name: 'Another Movie 2023',
          magnet: 'magnet:?xt=urn:btih:test456',
          quality: '720p',
          size: '1.5GB'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(createReadStream).toHaveBeenCalledWith(testFilePath);
      expect(csv).toHaveBeenCalled();
      expect(Magnet).toHaveBeenCalledTimes(2);
    });

    it('should handle CSV with missing optional fields', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Minimal Movie',
          magnet: 'magnet:?xt=urn:btih:minimal123'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(Magnet).toHaveBeenCalledWith({
        content_id: 'tt1234567',
        original_content_id: 'tt1234567',
        name: 'Minimal Movie',
        magnet: 'magnet:?xt=urn:btih:minimal123',
        id_type: 'unknown'
      });
    });

    it('should handle CSV with imdb_id fallback for content_id', async () => {
      const mockCsvData = [
        {
          imdb_id: 'tt1234567',
          name: 'Legacy Movie',
          magnet: 'magnet:?xt=urn:btih:legacy123',
          quality: '1080p'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(Magnet).toHaveBeenCalledWith({
        content_id: 'tt1234567',
        original_content_id: 'tt1234567',
        name: 'Legacy Movie',
        magnet: 'magnet:?xt=urn:btih:legacy123',
        quality: '1080p',
        imdb_id: 'tt1234567',
        id_type: 'imdb'
      });
    });

    it('should skip invalid CSV rows and log errors', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Valid Movie',
          magnet: 'magnet:?xt=urn:btih:valid123'
        },
        {
          // Invalid row - missing required fields
          name: 'Invalid Movie'
        }
      ];

      Magnet.mockImplementationOnce((data) => ({ ...data }))
            .mockImplementationOnce(() => {
              throw new Error('Invalid magnet data');
            });

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Fila CSV inválida')
      );
      expect(Magnet).toHaveBeenCalledTimes(2);
    });

    it('should not reinitialize if already initialized', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Test Movie',
          magnet: 'magnet:?xt=urn:btih:test123'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();
      await repository.initialize(); // Second call

      expect(createReadStream).toHaveBeenCalledTimes(1);
    });

    it('should throw RepositoryError on file read error', async () => {
      createReadStream.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(repository.initialize()).rejects.toThrow(RepositoryError);
      expect(mockLogger.error).not.toHaveBeenCalled(); // Error should be thrown before logging
    });

    it('should handle stream errors', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        throw new Error('Stream error');
      };

      await expect(repository.initialize()).rejects.toThrow(RepositoryError);
    });
  });

  describe('Magnet Indexing', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should index magnets by content_id', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Test Movie',
          magnet: 'magnet:?xt=urn:btih:test123'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      const magnets = await repository.getMagnetsByContentId('tt1234567');
      expect(magnets).toHaveLength(1);
      expect(magnets[0].content_id).toBe('tt1234567');
    });

    it('should index magnets by both content_id and imdb_id', async () => {
      const mockCsvData = [
        {
          content_id: 'kitsu:12345',
          imdb_id: 'tt1234567',
          name: 'Anime Movie',
          magnet: 'magnet:?xt=urn:btih:anime123'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      // Should be accessible by both IDs
      const magnetsByContentId = await repository.getMagnetsByContentId('kitsu:12345');
      const magnetsByImdbId = await repository.getMagnetsByContentId('tt1234567');

      expect(magnetsByContentId).toHaveLength(1);
      expect(magnetsByImdbId).toHaveLength(1);
      expect(magnetsByContentId[0]).toEqual(magnetsByImdbId[0]);
    });

    it('should handle multiple magnets for same content_id', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Movie 1080p',
          magnet: 'magnet:?xt=urn:btih:hd123',
          quality: '1080p'
        },
        {
          content_id: 'tt1234567',
          name: 'Movie 720p',
          magnet: 'magnet:?xt=urn:btih:sd123',
          quality: '720p'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      const magnets = await repository.getMagnetsByContentId('tt1234567');
      expect(magnets).toHaveLength(2);
      expect(magnets.map(m => m.quality)).toEqual(['1080p', '720p']);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);

      const mockCsvData = [
        {
          content_id: 'tt1234567',
          imdb_id: 'tt1234567',
          name: 'Test Movie 1080p',
          magnet: 'magnet:?xt=urn:btih:test123',
          quality: '1080p',
          size: '2.5GB'
        },
        {
          content_id: 'tt1234567',
          name: 'Test Movie 720p',
          magnet: 'magnet:?xt=urn:btih:test456',
          quality: '720p',
          size: '1.5GB'
        },
        {
          content_id: 'kitsu:12345',
          name: 'Anime Episode',
          magnet: 'magnet:?xt=urn:btih:anime123'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();
    });

    describe('getMagnetsByContentId', () => {
      it('should return magnets for existing content_id', async () => {
        const magnets = await repository.getMagnetsByContentId('tt1234567');

        expect(magnets).toHaveLength(2);
        expect(magnets.every(m => m.content_id === 'tt1234567')).toBe(true);
      });

      it('should return magnets for anime content_id', async () => {
        const magnets = await repository.getMagnetsByContentId('kitsu:12345');

        expect(magnets).toHaveLength(1);
        expect(magnets[0].content_id).toBe('kitsu:12345');
      });

      it('should throw MagnetNotFoundError for non-existent content_id', async () => {
        await expect(repository.getMagnetsByContentId('tt9999999'))
          .rejects.toThrow(MagnetNotFoundError);
      });

      it('should handle type parameter (not used in CSV)', async () => {
        const magnets = await repository.getMagnetsByContentId('tt1234567', 'movie');

        expect(magnets).toHaveLength(2);
      });

      it('should initialize automatically if not initialized', async () => {
        const newRepository = new CSVMagnetRepository(testFilePath, mockLogger);

        // Mock CSV data for new repository
        mockCsvParser[Symbol.asyncIterator] = async function* () {
          yield {
            content_id: 'tt1111111',
            name: 'Auto Init Movie',
            magnet: 'magnet:?xt=urn:btih:auto123'
          };
        };

        const magnets = await newRepository.getMagnetsByContentId('tt1111111');

        expect(magnets).toHaveLength(1);
        expect(createReadStream).toHaveBeenCalled();
      });
    });

    describe('getMagnetsByImdbId', () => {
      it('should return magnets for existing IMDb ID', async () => {
        const magnets = await repository.getMagnetsByImdbId('tt1234567');

        expect(magnets).toHaveLength(2);
        expect(magnets.every(m => m.content_id === 'tt1234567')).toBe(true);
      });

      it('should throw MagnetNotFoundError for non-existent IMDb ID', async () => {
        await expect(repository.getMagnetsByImdbId('tt9999999'))
          .rejects.toThrow(MagnetNotFoundError);
      });

      it('should handle type parameter', async () => {
        const magnets = await repository.getMagnetsByImdbId('tt1234567', 'series');

        expect(magnets).toHaveLength(2);
      });

      it('should delegate to getMagnetsByContentId', async () => {
        const spy = vi.spyOn(repository, 'getMagnetsByContentId');

        await repository.getMagnetsByImdbId('tt1234567', 'movie');

        expect(spy).toHaveBeenCalledWith('tt1234567', 'movie');
      });
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should return total entries count', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1111111',
          name: 'Movie 1',
          magnet: 'magnet:?xt=urn:btih:movie1'
        },
        {
          content_id: 'tt2222222',
          name: 'Movie 2',
          magnet: 'magnet:?xt=urn:btih:movie2'
        },
        {
          content_id: 'tt3333333',
          name: 'Movie 3',
          magnet: 'magnet:?xt=urn:btih:movie3'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      const total = await repository.getTotalEntries();

      expect(total).toBe(3);
    });

    it('should return zero for empty CSV', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        // Empty generator
      };

      const total = await repository.getTotalEntries();

      expect(total).toBe(0);
    });

    it('should initialize automatically when getting total entries', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        yield {
          content_id: 'tt1111111',
          name: 'Auto Init Movie',
          magnet: 'magnet:?xt=urn:btih:auto123'
        };
      };

      const total = await repository.getTotalEntries();

      expect(total).toBe(1);
      expect(createReadStream).toHaveBeenCalled();
    });
  });

  describe('Data Processing', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should process numeric fields correctly', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Test Movie',
          magnet: 'magnet:?xt=urn:btih:test123',
          seeders: '150',
          peers: '75'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(Magnet).toHaveBeenCalledWith(
        expect.objectContaining({
          seeders: 150,
          peers: 75
        })
      );
    });

    it('should handle empty string fields', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          name: 'Test Movie',
          magnet: 'magnet:?xt=urn:btih:test123',
          quality: '',
          size: '',
          provider: ''
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(Magnet).toHaveBeenCalledWith({
        content_id: 'tt1234567',
        original_content_id: 'tt1234567',
        name: 'Test Movie',
        magnet: 'magnet:?xt=urn:btih:test123',
        id_type: 'unknown'
      });
    });

    it('should preserve all valid fields', async () => {
      const mockCsvData = [
        {
          content_id: 'tt1234567',
          imdb_id: 'tt1234567',
          name: 'Complete Movie',
          magnet: 'magnet:?xt=urn:btih:complete123',
          quality: '1080p',
          size: '2.5GB',
          provider: 'TestProvider',
          filename: 'movie.mkv',
          seeders: '100',
          peers: '50'
        }
      ];

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      expect(Magnet).toHaveBeenCalledWith({
        content_id: 'tt1234567',
        original_content_id: 'tt1234567',
        name: 'Complete Movie',
        magnet: 'magnet:?xt=urn:btih:complete123',
        quality: '1080p',
        size: '2.5GB',
        imdb_id: 'tt1234567',
        id_type: 'imdb',
        provider: 'TestProvider',
        filename: 'movie.mkv',
        seeders: 100,
        peers: 50
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should handle malformed CSV gracefully', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        yield { malformed: 'data' };
        yield {
          content_id: 'tt1234567',
          name: 'Valid Movie',
          magnet: 'magnet:?xt=urn:btih:valid123'
        };
      };

      Magnet.mockImplementationOnce(() => {
        throw new Error('Invalid data');
      }).mockImplementationOnce((data) => ({ ...data }));

      await repository.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Fila CSV inválida')
      );
      expect(Magnet).toHaveBeenCalledTimes(2);
    });

    it('should handle Magnet validation errors', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        yield {
          content_id: 'invalid',
          name: 'Invalid Movie'
        };
      };

      Magnet.mockImplementation(() => {
        const error = new Error('Validation failed');
        error.issues = [{ message: 'Invalid magnet URI' }];
        throw error;
      });

      await repository.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid magnet URI')
      );
    });

    it('should handle concurrent initialization attempts', async () => {
      mockCsvParser[Symbol.asyncIterator] = async function* () {
        yield {
          content_id: 'tt1234567',
          name: 'Test Movie',
          magnet: 'magnet:?xt=urn:btih:test123'
        };
      };

      // Start multiple initializations concurrently
      const promises = [
        repository.initialize(),
        repository.initialize(),
        repository.initialize()
      ];

      await Promise.all(promises);

      // Should only read file once
      expect(createReadStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      repository = new CSVMagnetRepository(testFilePath, mockLogger);
    });

    it('should handle large CSV files efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        content_id: `tt${String(i).padStart(7, '0')}`,
        name: `Movie ${i}`,
        magnet: `magnet:?xt=urn:btih:hash${i}`,
        quality: i % 2 === 0 ? '1080p' : '720p'
      }));

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of largeDataset) {
          yield row;
        }
      };

      const startTime = Date.now();
      await repository.initialize();
      const endTime = Date.now();

      const total = await repository.getTotalEntries();
      expect(total).toBe(1000);

      // Should complete in reasonable time (less than 1 second for test)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should provide fast lookups after initialization', async () => {
      const mockCsvData = Array.from({ length: 100 }, (_, i) => ({
        content_id: `tt${String(i).padStart(7, '0')}`,
        name: `Movie ${i}`,
        magnet: `magnet:?xt=urn:btih:hash${i}`
      }));

      mockCsvParser[Symbol.asyncIterator] = async function* () {
        for (const row of mockCsvData) {
          yield row;
        }
      };

      await repository.initialize();

      // Multiple fast lookups
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        const contentId = `tt${String(i).padStart(7, '0')}`;
        const magnets = await repository.getMagnetsByContentId(contentId);
        expect(magnets).toHaveLength(1);
      }
      const endTime = Date.now();

      // Lookups should be very fast (less than 100ms for 10 lookups)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});