/**
 * @fileoverview Tests unitarios para TorrentioApiService
 * Valida integración API, procesamiento streams y persistencia CSV
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { TorrentioApiService } from '../../../../src/infrastructure/services/TorrentioApiService.js';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('@/domain/entities/Magnet.js');
vi.mock('@/infrastructure/utils/EnhancedLogger.js');
vi.mock('@/config/addonConfig.js', () => ({
  addonConfig: {
    torrentio: {
      movie: {
        languageConfigs: {
          spanish: { providers: ['cinecalidad', 'mejortorrent'] },
          combined: { providers: ['cinecalidad', 'mejortorrent', 'yts'] }
        }
      },
      series: {
        languageConfigs: {
          spanish: { providers: ['cinecalidad', 'mejortorrent'] },
          combined: { providers: ['cinecalidad', 'mejortorrent', 'eztv'] }
        }
      },
      anime: {
        languageConfigs: {
          spanish: { providers: ['nyaasi'] },
          combined: { providers: ['nyaasi', 'horriblesubs'] }
        }
      }
    }
  }
}));
vi.mock('@/config/constants.js', () => ({
  CONSTANTS: {
    TIME: {
      DEFAULT_TIMEOUT: 30000,
      MANIFEST_CACHE_EXPIRY: 300000
    },
    NETWORK: {
      FIREFOX_USER_AGENT: 'Mozilla/5.0 Firefox/91.0'
    }
  }
}));
vi.mock('@/infrastructure/patterns/ConfigurationCommand.js');
vi.mock('@/infrastructure/services/TorService.js');

describe('TorrentioApiService', () => {
  let torrentioApiService;
  let mockLogger;
  let mockTorService;
  let mockConfigInvoker;

  const mockBaseUrl = 'https://torrentio.stremio.com';
  const mockTorrentioFilePath = '/path/to/torrentio.csv';
  const mockEnglishFilePath = '/path/to/english.csv';

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock TorService
    mockTorService = {
      isEnabled: vi.fn().mockReturnValue(true),
      fetch: vi.fn(),
      destroy: vi.fn()
    };

    // Mock ConfigInvoker
    mockConfigInvoker = {
      execute: vi.fn()
    };

    // Mock file system
    existsSync.mockReturnValue(true);
    mkdirSync.mockReturnValue(undefined);
    writeFileSync.mockReturnValue(undefined);
    appendFileSync.mockReturnValue(undefined);
    readFileSync.mockReturnValue('');
    dirname.mockReturnValue('/path/to');

    // Mock global fetch
    global.fetch = vi.fn();
    global.AbortController = vi.fn(() => ({
      abort: vi.fn(),
      signal: {}
    }));
    global.setTimeout = vi.fn((fn, delay) => {
      return { id: 'timeout-id' };
    });
    global.clearTimeout = vi.fn();

    // Mock TorService constructor
    const { TorService } = require('@/infrastructure/services/TorService.js');
    TorService.mockImplementation(() => mockTorService);

    // Mock ConfigurationCommandFactory
    const { ConfigurationCommandFactory } = require('@/infrastructure/patterns/ConfigurationCommand.js');
    ConfigurationCommandFactory.createInvoker = vi.fn().mockReturnValue(mockConfigInvoker);
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (torrentioApiService) {
      // Clean up if service has destroy method
      if (typeof torrentioApiService.destroy === 'function') {
        torrentioApiService.destroy();
      }
    }
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );

      expect(mockLogger.info).toHaveBeenCalled();
      expect(existsSync).toHaveBeenCalled();
    });

    it('should initialize with custom configuration', () => {
      const customTimeout = 60000;
      const torConfig = {
        enabled: true,
        host: '127.0.0.1',
        port: 9050
      };

      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger,
        customTimeout,
        torConfig,
        mockEnglishFilePath
      );

      expect(mockLogger).toBeDefined();
    });

    it('should create torrentio file if it does not exist', () => {
      existsSync.mockReturnValue(false);

      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Content ID Processing', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    describe('searchMagnetsById()', () => {
      it('should handle IMDb ID for movies', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Test Movie',
                title: 'Test Movie 2023 1080p BluRay x264 [2.5GB] [Seeders: 100]',
                infoHash: 'abcd1234567890abcd1234567890abcd12345678'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalledWith(
          expect.stringContaining('tt1234567')
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Buscando magnets en API Torrentio'),
          expect.any(Object)
        );
      });

      it('should handle series with season and episode', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Test Series S01E01',
                title: 'Test Series S01E01 1080p WEB-DL x264 [1.2GB] [Seeders: 50]',
                infoHash: 'efgh5678901234efgh5678901234efgh56789012'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsById('tt7654321', 'series', 1, 1);

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalledWith(
          expect.stringContaining('tt7654321:1:1')
        );
      });

      it('should handle anime content', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Test Anime Episode 1',
                title: 'Test Anime - 01 [1080p] [SubsPlease] [500MB] [Seeders: 200]',
                infoHash: 'ijkl9012345678ijkl9012345678ijkl90123456'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsById('kitsu:12345', 'anime', 1, 1);

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalled();
      });

      it('should handle invalid content ID', async () => {
        const result = await torrentioApiService.searchMagnetsById(null, 'movie');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('ID inválido para Torrentio API')
        );
      });

      it('should handle API error responses', async () => {
        const mockResponse = {
          ok: false,
          status: 404
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('API Torrentio respondió con status 404')
        );
      });

      it('should handle network errors', async () => {
        mockTorService.fetch.mockRejectedValue(new Error('Network error'));

        const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

        expect(result).toEqual([]);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error en búsqueda de API Torrentio:'
        );
      });
    });

    describe('searchMagnetsWithLanguageFallback()', () => {
      it('should return Spanish results when sufficient', async () => {
        const mockSpanishResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Película Española',
                title: 'Película Española 2023 1080p [2GB] [Seeders: 50]',
                infoHash: 'spanish123456789012345678901234567890'
              },
              {
                name: 'Otra Película',
                title: 'Otra Película 2023 720p [1.5GB] [Seeders: 30]',
                infoHash: 'spanish234567890123456789012345678901'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockSpanishResponse);

        const result = await torrentioApiService.searchMagnetsWithLanguageFallback('tt1234567', 'movie');

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Encontrados')
        );
      });

      it('should fallback to combined results when Spanish insufficient', async () => {
        // First call (Spanish) returns insufficient results
        const mockSpanishResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Película Española',
                title: 'Película Española 2023 1080p [2GB] [Seeders: 0]', // No seeds
                infoHash: 'spanish123456789012345678901234567890'
              }
            ]
          })
        };

        // Second call (Combined) returns better results
        const mockCombinedResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'English Movie',
                title: 'English Movie 2023 1080p [2GB] [Seeders: 100]',
                infoHash: 'english123456789012345678901234567890'
              }
            ]
          })
        };

        mockTorService.fetch
          .mockResolvedValueOnce(mockSpanishResponse)
          .mockResolvedValueOnce(mockCombinedResponse);

        const result = await torrentioApiService.searchMagnetsWithLanguageFallback('tt1234567', 'movie');

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalledTimes(2);
      });

      it('should handle identical Spanish and combined configurations', async () => {
        // Mock identical configurations
        const { addonConfig } = require('@/config/addonConfig.js');
        addonConfig.torrentio.movie.languageConfigs.combined = 
          addonConfig.torrentio.movie.languageConfigs.spanish;

        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'Test Movie',
                title: 'Test Movie 2023 1080p [2GB] [Seeders: 50]',
                infoHash: 'test1234567890123456789012345678901234'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsWithLanguageFallback('tt1234567', 'movie');

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalledTimes(1); // Only one call due to identical configs
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Configuraciones español y combinado son idénticas')
        );
      });
    });

    describe('searchMagnetsInEnglish()', () => {
      it('should search for English content', async () => {
        const mockResponse = {
          ok: true,
          json: vi.fn().mockResolvedValue({
            streams: [
              {
                name: 'English Movie',
                title: 'English Movie 2023 1080p BluRay [2.5GB] [Seeders: 150]',
                infoHash: 'english123456789012345678901234567890'
              }
            ]
          })
        };

        mockTorService.fetch.mockResolvedValue(mockResponse);

        const result = await torrentioApiService.searchMagnetsInEnglish('tt1234567', 'movie');

        expect(result).toBeInstanceOf(Array);
        expect(mockTorService.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Stream Processing', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should parse streams to magnets correctly', async () => {
      const mockStreams = [
        {
          name: 'Test Movie',
          title: 'Test Movie 2023 1080p BluRay x264 [2.5GB] [Seeders: 100] [Peers: 50]',
          infoHash: 'abcd1234567890abcd1234567890abcd12345678'
        },
        {
          name: 'Test Movie 720p',
          title: 'Test Movie 2023 720p WEB-DL [1.2GB] [Seeders: 75] [Peers: 25]',
          infoHash: 'efgh5678901234efgh5678901234efgh56789012'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(2);
      
      // Verify magnet properties
      result.forEach(magnet => {
        expect(magnet).toHaveProperty('magnetUri');
        expect(magnet).toHaveProperty('title');
        expect(magnet).toHaveProperty('quality');
        expect(magnet).toHaveProperty('size');
        expect(magnet).toHaveProperty('seeders');
        expect(magnet).toHaveProperty('peers');
      });
    });

    it('should filter results with seeds', async () => {
      const mockStreams = [
        {
          name: 'With Seeds',
          title: 'With Seeds 2023 1080p [2GB] [Seeders: 50]',
          infoHash: 'withseeds123456789012345678901234567890'
        },
        {
          name: 'No Seeds',
          title: 'No Seeds 2023 1080p [2GB] [Seeders: 0]',
          infoHash: 'noseeds1234567890123456789012345678901'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      // Should only return magnets with seeds > 0
      const magnetsWithSeeds = result.filter(magnet => magnet.seeders > 0);
      expect(magnetsWithSeeds.length).toBeGreaterThan(0);
    });

    it('should extract quality information correctly', async () => {
      const mockStreams = [
        {
          name: '4K Movie',
          title: '4K Movie 2023 2160p UHD BluRay [8GB] [Seeders: 25]',
          infoHash: '4kmovie123456789012345678901234567890'
        },
        {
          name: 'HD Movie',
          title: 'HD Movie 2023 1080p BluRay [2.5GB] [Seeders: 100]',
          infoHash: 'hdmovie123456789012345678901234567890'
        },
        {
          name: 'SD Movie',
          title: 'SD Movie 2023 720p WEB-DL [1.2GB] [Seeders: 75]',
          infoHash: 'sdmovie123456789012345678901234567890'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(result.some(magnet => magnet.quality.includes('2160p'))).toBe(true);
      expect(result.some(magnet => magnet.quality.includes('1080p'))).toBe(true);
      expect(result.some(magnet => magnet.quality.includes('720p'))).toBe(true);
    });
  });

  describe('File Persistence', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should save magnets to CSV file', async () => {
      const mockStreams = [
        {
          name: 'Test Movie',
          title: 'Test Movie 2023 1080p [2GB] [Seeders: 50]',
          infoHash: 'test1234567890123456789012345678901234'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(appendFileSync).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Guardados')
      );
    });

    it('should handle file write errors gracefully', async () => {
      appendFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });

      const mockStreams = [
        {
          name: 'Test Movie',
          title: 'Test Movie 2023 1080p [2GB] [Seeders: 50]',
          infoHash: 'test1234567890123456789012345678901234'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      // Should not throw error
      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should get provider configuration', () => {
      const config = torrentioApiService.getProviderConfig('movie');
      expect(config).toBeDefined();
    });

    it('should set provider configuration', () => {
      const newConfig = {
        providers: ['test-provider'],
        quality: ['1080p']
      };

      torrentioApiService.setProviderConfig('movie', newConfig);
      
      const retrievedConfig = torrentioApiService.getProviderConfig('movie');
      expect(retrievedConfig).toEqual(newConfig);
    });

    it('should set and get priority language', () => {
      torrentioApiService.setPriorityLanguage('english');
      
      const language = torrentioApiService.getPriorityLanguage();
      expect(language).toBe('english');
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should clear global duplicate cache', () => {
      torrentioApiService.clearGlobalDuplicateCache();
      
      // Should not throw error
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('Content Type Detection', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should detect movie content type', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          streams: [
            {
              name: 'Test Movie',
              title: 'Test Movie 2023 1080p [2GB] [Seeders: 50]',
              infoHash: 'test1234567890123456789012345678901234'
            }
          ]
        })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'auto');

      expect(result).toBeInstanceOf(Array);
      expect(mockTorService.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/movie/')
      );
    });

    it('should detect series content type', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          streams: [
            {
              name: 'Test Series S01E01',
              title: 'Test Series S01E01 1080p [1GB] [Seeders: 30]',
              infoHash: 'testseries123456789012345678901234567'
            }
          ]
        })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt7654321', 'auto', 1, 1);

      expect(result).toBeInstanceOf(Array);
      expect(mockTorService.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/series/')
      );
    });

    it('should detect anime content type', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          streams: [
            {
              name: 'Test Anime Episode 1',
              title: 'Test Anime - 01 [1080p] [500MB] [Seeders: 100]',
              infoHash: 'testanime123456789012345678901234567'
            }
          ]
        })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('kitsu:12345', 'auto', 1, 1);

      expect(result).toBeInstanceOf(Array);
      expect(mockTorService.fetch).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should handle malformed JSON responses', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      mockTorService.fetch.mockRejectedValue(new Error('Request timeout'));

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle Tor service unavailable', async () => {
      mockTorService.isEnabled.mockReturnValue(false);
      
      global.fetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: [] })
      });

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      expect(result).toBeInstanceOf(Array);
      expect(global.fetch).toHaveBeenCalled(); // Should fallback to regular fetch
    });
  });

  describe('Performance and Optimization', () => {
    beforeEach(() => {
      torrentioApiService = new TorrentioApiService(
        mockBaseUrl,
        mockTorrentioFilePath,
        mockLogger
      );
    });

    it('should handle concurrent requests efficiently', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          streams: [
            {
              name: 'Test Movie',
              title: 'Test Movie 2023 1080p [2GB] [Seeders: 50]',
              infoHash: 'test1234567890123456789012345678901234'
            }
          ]
        })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const promises = [
        torrentioApiService.searchMagnetsById('tt1111111', 'movie'),
        torrentioApiService.searchMagnetsById('tt2222222', 'movie'),
        torrentioApiService.searchMagnetsById('tt3333333', 'movie')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeInstanceOf(Array);
      });
    });

    it('should deduplicate results effectively', async () => {
      const mockStreams = [
        {
          name: 'Duplicate Movie',
          title: 'Duplicate Movie 2023 1080p [2GB] [Seeders: 50]',
          infoHash: 'duplicate123456789012345678901234567890'
        },
        {
          name: 'Duplicate Movie', // Same name
          title: 'Duplicate Movie 2023 720p [1.5GB] [Seeders: 30]',
          infoHash: 'duplicate123456789012345678901234567890' // Same hash
        },
        {
          name: 'Unique Movie',
          title: 'Unique Movie 2023 1080p [2GB] [Seeders: 40]',
          infoHash: 'unique1234567890123456789012345678901'
        }
      ];

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ streams: mockStreams })
      };

      mockTorService.fetch.mockResolvedValue(mockResponse);

      const result = await torrentioApiService.searchMagnetsById('tt1234567', 'movie');

      // Should deduplicate based on infoHash
      const uniqueHashes = new Set(result.map(magnet => magnet.infoHash));
      expect(uniqueHashes.size).toBe(result.length);
    });
  });
});