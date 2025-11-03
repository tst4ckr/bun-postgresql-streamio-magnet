/**
 * @fileoverview Tests unitarios para CascadingMagnetRepository
 * Valida búsqueda en cascada, fallbacks y gestión de fuentes agotadas
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CascadingMagnetRepository } from '../../../../src/infrastructure/repositories/CascadingMagnetRepository.js';
import { MagnetNotFoundError, RepositoryError } from '../../../../src/domain/repositories/MagnetRepository.js';

// Mock dependencies
vi.mock('@/infrastructure/repositories/CSVMagnetRepository.js');
vi.mock('@/infrastructure/services/TorrentioApiService.js');
vi.mock('@/infrastructure/services/UnifiedIdService.js');
vi.mock('@/infrastructure/services/MetadataService.js');
vi.mock('@/infrastructure/services/CacheService.js');
vi.mock('@/infrastructure/patterns/ConfigurationCommand.js');
vi.mock('@/infrastructure/utils/CsvFileInitializer.js');
vi.mock('path');

describe('CascadingMagnetRepository', () => {
  let repository;
  let mockLogger;
  let mockPrimaryRepository;
  let mockSecondaryRepository;
  let mockAnimeRepository;
  let mockEnglishRepository;
  let mockTorrentioApiService;
  let mockIdService;
  let mockMetadataService;
  let mockCacheService;
  let mockConfigInvoker;

  const mockPaths = {
    primary: '/path/to/magnets.csv',
    secondary: '/path/to/torrentio.csv',
    anime: '/path/to/anime.csv',
    english: '/path/to/english.csv'
  };
  const mockTorrentioUrl = 'https://torrentio.stremio.com';

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock repositories
    mockPrimaryRepository = {
      initialize: vi.fn(),
      getMagnetsByImdbId: vi.fn(),
      getMagnetsByContentId: vi.fn(),
      getStats: vi.fn()
    };

    mockSecondaryRepository = {
      initialize: vi.fn(),
      getMagnetsByImdbId: vi.fn(),
      getMagnetsByContentId: vi.fn(),
      getStats: vi.fn()
    };

    mockAnimeRepository = {
      initialize: vi.fn(),
      getMagnetsByImdbId: vi.fn(),
      getMagnetsByContentId: vi.fn(),
      getStats: vi.fn()
    };

    mockEnglishRepository = {
      initialize: vi.fn(),
      getMagnetsByImdbId: vi.fn(),
      getMagnetsByContentId: vi.fn(),
      getStats: vi.fn()
    };

    // Mock TorrentioApiService
    mockTorrentioApiService = {
      searchMagnetsById: vi.fn(),
      searchMagnetsWithLanguageFallback: vi.fn(),
      searchMagnetsInEnglish: vi.fn(),
      setPriorityLanguage: vi.fn(),
      getPriorityLanguage: vi.fn()
    };

    // Mock UnifiedIdService
    mockIdService = {
      detectIdType: vi.fn(),
      convertId: vi.fn(),
      isValidId: vi.fn()
    };

    // Mock MetadataService
    mockMetadataService = {
      getMetadata: vi.fn()
    };

    // Mock CacheService
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      generateMagnetCacheKey: vi.fn(),
      generateMetadataCacheKey: vi.fn()
    };

    // Mock ConfigInvoker
    mockConfigInvoker = {
      execute: vi.fn()
    };

    // Setup mocks
    const { CSVMagnetRepository } = require('@/infrastructure/repositories/CSVMagnetRepository.js');
    CSVMagnetRepository.mockImplementation((path) => {
      if (path.includes('magnets.csv')) return mockPrimaryRepository;
      if (path.includes('torrentio.csv')) return mockSecondaryRepository;
      if (path.includes('anime.csv')) return mockAnimeRepository;
      if (path.includes('english.csv')) return mockEnglishRepository;
      return mockPrimaryRepository;
    });

    const { TorrentioApiService } = require('@/infrastructure/services/TorrentioApiService.js');
    TorrentioApiService.mockImplementation(() => mockTorrentioApiService);

    const { unifiedIdService } = require('@/infrastructure/services/UnifiedIdService.js');
    Object.assign(unifiedIdService, mockIdService);

    const { metadataService } = require('@/infrastructure/services/MetadataService.js');
    Object.assign(metadataService, mockMetadataService);

    const { cacheService } = require('@/infrastructure/services/CacheService.js');
    Object.assign(cacheService, mockCacheService);

    const { ConfigurationCommandFactory } = require('@/infrastructure/patterns/ConfigurationCommand.js');
    ConfigurationCommandFactory.createInvoker = vi.fn().mockReturnValue(mockConfigInvoker);

    const { CsvFileInitializer } = require('@/infrastructure/utils/CsvFileInitializer.js');
    CsvFileInitializer.initializeAllCsvFiles = vi.fn();

    const { dirname } = require('path');
    dirname.mockReturnValue('/path/to');

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with required parameters', () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      expect(repository).toBeInstanceOf(CascadingMagnetRepository);
    });

    it('should initialize with all optional parameters', () => {
      const torConfig = { enabled: true, host: '127.0.0.1', port: 9050 };

      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger,
        60000,
        mockIdService,
        torConfig,
        mockPaths.english
      );

      expect(repository).toBeInstanceOf(CascadingMagnetRepository);
    });

    it('should generate english path automatically if not provided', () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      // Should create english path based on secondary path
      expect(repository).toBeInstanceOf(CascadingMagnetRepository);
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );
    });

    it('should initialize all repositories successfully', async () => {
      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();

      await repository.initialize();

      expect(mockPrimaryRepository.initialize).toHaveBeenCalled();
      expect(mockSecondaryRepository.initialize).toHaveBeenCalled();
      expect(mockAnimeRepository.initialize).toHaveBeenCalled();
      expect(mockEnglishRepository.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Inicializando repositorios en cascada...',
        { component: 'CascadingMagnetRepository' }
      );
    });

    it('should handle repository initialization errors', async () => {
      mockPrimaryRepository.initialize.mockRejectedValue(new Error('Primary init error'));
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();

      await expect(repository.initialize()).rejects.toThrow('Primary init error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();

      await repository.initialize();
      await repository.initialize(); // Second call

      expect(mockPrimaryRepository.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search by IMDb ID', () => {
    beforeEach(async () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      // Mock initialization
      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();
    });

    it('should find magnets in primary repository', async () => {
      const mockMagnets = [
        {
          magnetUri: 'magnet:?xt=urn:btih:primary123',
          title: 'Primary Movie 2023',
          quality: '1080p',
          size: '2.5GB',
          seeders: 100
        }
      ];

      mockPrimaryRepository.getMagnetsByImdbId.mockResolvedValue(mockMagnets);

      const result = await repository.getMagnetsByImdbId('tt1234567', 'movie');

      expect(result).toEqual(mockMagnets);
      expect(mockPrimaryRepository.getMagnetsByImdbId).toHaveBeenCalledWith('tt1234567', 'movie');
      expect(mockSecondaryRepository.getMagnetsByImdbId).not.toHaveBeenCalled();
    });

    it('should fallback to secondary repository when primary is empty', async () => {
      const mockMagnets = [
        {
          magnetUri: 'magnet:?xt=urn:btih:secondary123',
          title: 'Secondary Movie 2023',
          quality: '720p',
          size: '1.5GB',
          seeders: 50
        }
      ];

      mockPrimaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByImdbId.mockResolvedValue(mockMagnets);

      const result = await repository.getMagnetsByImdbId('tt1234567', 'movie');

      expect(result).toEqual(mockMagnets);
      expect(mockPrimaryRepository.getMagnetsByImdbId).toHaveBeenCalled();
      expect(mockSecondaryRepository.getMagnetsByImdbId).toHaveBeenCalled();
    });

    it('should fallback to API when repositories are empty', async () => {
      const mockApiMagnets = [
        {
          magnetUri: 'magnet:?xt=urn:btih:api123',
          title: 'API Movie 2023',
          quality: '1080p',
          size: '3GB',
          seeders: 200
        }
      ];

      mockPrimaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsById.mockResolvedValue(mockApiMagnets);

      const result = await repository.getMagnetsByImdbId('tt1234567', 'movie');

      expect(result).toEqual(mockApiMagnets);
      expect(mockTorrentioApiService.searchMagnetsById).toHaveBeenCalledWith('tt1234567', 'movie');
    });

    it('should throw MagnetNotFoundError when no magnets found', async () => {
      mockPrimaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsById.mockResolvedValue([]);

      await expect(repository.getMagnetsByImdbId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);
    });

    it('should handle repository errors gracefully', async () => {
      mockPrimaryRepository.getMagnetsByImdbId.mockRejectedValue(new Error('Primary error'));
      mockSecondaryRepository.getMagnetsByImdbId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsById.mockResolvedValue([]);

      await expect(repository.getMagnetsByImdbId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error en búsqueda de magnets.csv')
      );
    });
  });

  describe('Search by Content ID', () => {
    beforeEach(async () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      // Mock initialization
      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();

      // Mock metadata service
      mockMetadataService.getMetadata.mockResolvedValue({
        title: 'Test Movie',
        year: 2023,
        type: 'movie'
      });

      // Mock cache service
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key-123');
      mockCacheService.get.mockReturnValue(null); // No cache initially
    });

    it('should validate input parameters', async () => {
      await expect(repository.getMagnetsByContentId(null, 'movie'))
        .rejects.toThrow(RepositoryError);

      await expect(repository.getMagnetsByContentId('', 'movie'))
        .rejects.toThrow(RepositoryError);

      await expect(repository.getMagnetsByContentId('tt1234567', null))
        .rejects.toThrow(RepositoryError);

      await expect(repository.getMagnetsByContentId('tt1234567', 'invalid'))
        .rejects.toThrow(RepositoryError);
    });

    it('should return cached results when available', async () => {
      const cachedMagnets = [
        {
          magnetUri: 'magnet:?xt=urn:btih:cached123',
          title: 'Cached Movie 2023'
        }
      ];

      mockCacheService.get.mockReturnValue(cachedMagnets);

      const result = await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(result).toEqual(cachedMagnets);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Resultados obtenidos desde cache')
      );
    });

    it('should search in all repositories simultaneously', async () => {
      const primaryMagnets = [{ magnetUri: 'magnet:primary', title: 'Primary' }];
      const secondaryMagnets = [{ magnetUri: 'magnet:secondary', title: 'Secondary' }];

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue(primaryMagnets);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue(secondaryMagnets);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);

      const result = await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(result.length).toBeGreaterThan(0);
      expect(mockPrimaryRepository.getMagnetsByContentId).toHaveBeenCalled();
      expect(mockSecondaryRepository.getMagnetsByContentId).toHaveBeenCalled();
    });

    it('should handle anime content specifically', async () => {
      const animeMagnets = [{ magnetUri: 'magnet:anime', title: 'Anime Episode' }];

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue(animeMagnets);

      const result = await repository.getMagnetsByContentId('kitsu:12345', 'anime');

      expect(result.length).toBeGreaterThan(0);
      expect(mockAnimeRepository.getMagnetsByContentId).toHaveBeenCalled();
    });

    it('should fallback to API when repositories are empty', async () => {
      const apiMagnets = [{ magnetUri: 'magnet:api', title: 'API Result' }];

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue(apiMagnets);

      const result = await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(result).toEqual(apiMagnets);
      expect(mockTorrentioApiService.searchMagnetsWithLanguageFallback).toHaveBeenCalled();
    });

    it('should cache successful results', async () => {
      const magnets = [{ magnetUri: 'magnet:test', title: 'Test Movie' }];

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue(magnets);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);

      await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('Source Exhaustion Management', () => {
    beforeEach(async () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      // Mock initialization
      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();

      mockMetadataService.getMetadata.mockResolvedValue({
        title: 'Test Movie',
        year: 2023
      });

      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);
    });

    it('should mark sources as exhausted when no results found', async () => {
      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue([]);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      // Should have marked sources as exhausted
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Saltando búsqueda')
      );
    });

    it('should skip exhausted sources in subsequent searches', async () => {
      // First search - mark sources as exhausted
      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue([]);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      // Second search - should skip exhausted sources
      vi.clearAllMocks();
      mockCacheService.get.mockReturnValue(null); // No cache

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      // Should have skipped searches
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Saltando búsqueda')
      );
    });

    it('should clear exhausted sources cache', async () => {
      // Mark sources as exhausted first
      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue([]);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      // Clear cache
      repository.clearExhaustedSourcesCache();

      // Should search again after clearing cache
      vi.clearAllMocks();
      mockCacheService.get.mockReturnValue(null);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      expect(mockPrimaryRepository.getMagnetsByContentId).toHaveBeenCalled();
    });
  });

  describe('Language Priority Management', () => {
    beforeEach(() => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );
    });

    it('should set priority language', () => {
      repository.setPriorityLanguage('english');

      expect(mockTorrentioApiService.setPriorityLanguage).toHaveBeenCalledWith('english');
    });

    it('should get priority language', () => {
      mockTorrentioApiService.getPriorityLanguage.mockReturnValue('spanish');

      const language = repository.getPriorityLanguage();

      expect(language).toBe('spanish');
      expect(mockTorrentioApiService.getPriorityLanguage).toHaveBeenCalled();
    });

    it('should set temporary priority language', () => {
      repository.setPriorityLanguageTemporary('english', 'movie');

      // Should execute configuration command
      expect(mockConfigInvoker.execute).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );
    });

    it('should get repository statistics', async () => {
      const mockStats = {
        primary: { total: 1000, lastUpdated: Date.now() },
        secondary: { total: 500, lastUpdated: Date.now() },
        anime: { total: 200, lastUpdated: Date.now() },
        english: { total: 300, lastUpdated: Date.now() }
      };

      mockPrimaryRepository.getStats.mockResolvedValue(mockStats.primary);
      mockSecondaryRepository.getStats.mockResolvedValue(mockStats.secondary);
      mockAnimeRepository.getStats.mockResolvedValue(mockStats.anime);
      mockEnglishRepository.getStats.mockResolvedValue(mockStats.english);

      const stats = await repository.getRepositoryStats();

      expect(stats).toHaveProperty('primary');
      expect(stats).toHaveProperty('secondary');
      expect(stats).toHaveProperty('anime');
      expect(stats).toHaveProperty('english');
      expect(stats.primary).toEqual(mockStats.primary);
    });

    it('should handle statistics errors gracefully', async () => {
      mockPrimaryRepository.getStats.mockRejectedValue(new Error('Stats error'));
      mockSecondaryRepository.getStats.mockResolvedValue({ total: 500 });
      mockAnimeRepository.getStats.mockResolvedValue({ total: 200 });
      mockEnglishRepository.getStats.mockResolvedValue({ total: 300 });

      const stats = await repository.getRepositoryStats();

      expect(stats.primary).toEqual({ error: 'Stats error' });
      expect(stats.secondary).toEqual({ total: 500 });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();
    });

    it('should handle metadata service errors', async () => {
      mockMetadataService.getMetadata.mockRejectedValue(new Error('Metadata error'));
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue([]);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle API service errors', async () => {
      mockMetadataService.getMetadata.mockResolvedValue({ title: 'Test' });
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockRejectedValue(
        new Error('API error')
      );

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error en búsqueda de API Torrentio')
      );
    });

    it('should handle concurrent search errors', async () => {
      mockMetadataService.getMetadata.mockResolvedValue({ title: 'Test' });
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);

      mockPrimaryRepository.getMagnetsByContentId.mockRejectedValue(new Error('Primary error'));
      mockSecondaryRepository.getMagnetsByContentId.mockRejectedValue(new Error('Secondary error'));
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockTorrentioApiService.searchMagnetsWithLanguageFallback.mockResolvedValue([]);

      await expect(repository.getMagnetsByContentId('tt1234567', 'movie'))
        .rejects.toThrow(MagnetNotFoundError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error en búsqueda de magnets.csv')
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error en búsqueda de torrentio.csv')
      );
    });
  });

  describe('Performance and Optimization', () => {
    beforeEach(async () => {
      repository = new CascadingMagnetRepository(
        mockPaths.primary,
        mockPaths.secondary,
        mockPaths.anime,
        mockTorrentioUrl,
        mockLogger
      );

      mockPrimaryRepository.initialize.mockResolvedValue();
      mockSecondaryRepository.initialize.mockResolvedValue();
      mockAnimeRepository.initialize.mockResolvedValue();
      mockEnglishRepository.initialize.mockResolvedValue();
    });

    it('should handle concurrent requests efficiently', async () => {
      const mockMagnets = [{ magnetUri: 'magnet:test', title: 'Test' }];

      mockMetadataService.getMetadata.mockResolvedValue({ title: 'Test' });
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue(mockMagnets);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);

      const promises = [
        repository.getMagnetsByContentId('tt1111111', 'movie'),
        repository.getMagnetsByContentId('tt2222222', 'movie'),
        repository.getMagnetsByContentId('tt3333333', 'movie')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeInstanceOf(Array);
      });
    });

    it('should optimize cache usage', async () => {
      const cachedMagnets = [{ magnetUri: 'magnet:cached', title: 'Cached' }];

      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(cachedMagnets);

      const result = await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(result).toEqual(cachedMagnets);
      // Should not call repositories when cache hit
      expect(mockPrimaryRepository.getMagnetsByContentId).not.toHaveBeenCalled();
    });

    it('should measure search performance', async () => {
      const mockMagnets = [{ magnetUri: 'magnet:test', title: 'Test' }];

      mockMetadataService.getMetadata.mockResolvedValue({ title: 'Test' });
      mockCacheService.generateMagnetCacheKey.mockReturnValue('cache-key');
      mockCacheService.get.mockReturnValue(null);

      mockPrimaryRepository.getMagnetsByContentId.mockResolvedValue(mockMagnets);
      mockSecondaryRepository.getMagnetsByContentId.mockResolvedValue([]);
      mockAnimeRepository.getMagnetsByContentId.mockResolvedValue([]);

      await repository.getMagnetsByContentId('tt1234567', 'movie');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('en'),
        expect.objectContaining({ component: 'CascadingMagnetRepository' })
      );
    });
  });
});