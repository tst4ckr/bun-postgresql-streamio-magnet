/**
 * @fileoverview Tests unitarios para M3UTvRepository
 * Valida parsing M3U, cache y gestión de canales de TV
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { M3UTvRepository } from '../../../../src/infrastructure/repositories/M3UTvRepository.js';

// Mock dependencies
vi.mock('@/infrastructure/utils/M3UParser.js', () => ({
  M3UParser: {
    isValidM3U: vi.fn(),
    parse: vi.fn()
  }
}));

describe('M3UTvRepository', () => {
  let repository;
  let mockLogger;
  let mockConfig;
  let mockM3UParser;

  const mockM3uUrl = 'https://example.com/playlist.m3u';
  const mockCacheTimeout = 300000; // 5 minutes

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock config
    mockConfig = {
      repository: {
        m3uCacheTimeout: mockCacheTimeout
      }
    };

    // Mock M3UParser
    const { M3UParser } = require('@/infrastructure/utils/M3UParser.js');
    mockM3UParser = M3UParser;

    // Mock global fetch
    global.fetch = vi.fn();

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with valid parameters', () => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);

      expect(repository).toBeInstanceOf(M3UTvRepository);
    });

    it('should throw error with invalid M3U URL', () => {
      expect(() => {
        new M3UTvRepository(null, mockConfig, mockLogger);
      }).toThrow('M3U URL is required');

      expect(() => {
        new M3UTvRepository('', mockConfig, mockLogger);
      }).toThrow('M3U URL is required');

      expect(() => {
        new M3UTvRepository(123, mockConfig, mockLogger);
      }).toThrow('M3U URL is required');
    });

    it('should initialize with proper configuration', () => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);

      const config = repository.getConfig();
      expect(config.m3uUrl).toBe(mockM3uUrl);
      expect(config.cacheTimeout).toBe(mockCacheTimeout);
      expect(config.channelsLoaded).toBe(0);
      expect(config.lastFetch).toBeNull();
      expect(config.cacheValid).toBe(false);
    });
  });

  describe('M3U Content Loading', () => {
    beforeEach(() => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);
    });

    it('should load TV channels from M3U source successfully', async () => {
      const mockM3uContent = `#EXTM3U
#EXTINF:-1 tvg-id="channel1" tvg-name="Channel 1" tvg-logo="logo1.png" group-title="News",Channel 1
http://example.com/stream1.m3u8
#EXTINF:-1 tvg-id="channel2" tvg-name="Channel 2" tvg-logo="logo2.png" group-title="Sports",Channel 2
http://example.com/stream2.m3u8`;

      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          logo: 'logo1.png',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        },
        {
          id: 'channel2',
          name: 'Channel 2',
          logo: 'logo2.png',
          group: 'Sports',
          url: 'http://example.com/stream2.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(mockM3uContent)
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      const tvs = await repository.getAllTvs();

      expect(tvs).toHaveLength(2);
      expect(tvs[0]).toEqual(mockTvs[0]);
      expect(tvs[1]).toEqual(mockTvs[1]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 2 tvs from M3U source')
      );
    });

    it('should handle HTTP errors when fetching M3U', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(repository.getAllTvs()).rejects.toThrow('HTTP 404: Not Found');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error loading tvs from M3U source:',
        expect.any(Error)
      );
    });

    it('should handle network errors when fetching M3U', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(repository.getAllTvs()).rejects.toThrow('Failed to load tvs: Network error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error loading tvs from M3U source:',
        expect.any(Error)
      );
    });

    it('should handle invalid M3U format', async () => {
      const invalidM3uContent = 'This is not a valid M3U file';

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(invalidM3uContent)
      });

      mockM3UParser.isValidM3U.mockReturnValue(false);

      await expect(repository.getAllTvs()).rejects.toThrow('Invalid M3U format received');
    });

    it('should use proper headers when fetching M3U', async () => {
      const mockM3uContent = '#EXTM3U\n';
      const mockTvs = [];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(mockM3uContent)
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      await repository.getAllTvs();

      expect(global.fetch).toHaveBeenCalledWith(mockM3uUrl, {
        headers: {
          'User-Agent': 'Stremio-Addon/1.0',
          'Accept': 'application/x-mpegURL, text/plain, */*'
        },
        timeout: 10000
      });
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);
    });

    it('should cache TV channels and reuse them within timeout', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      // First call should fetch from source
      const tvs1 = await repository.getAllTvs();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const tvs2 = await repository.getAllTvs();
      expect(global.fetch).toHaveBeenCalledTimes(1); // No additional fetch
      expect(tvs1).toEqual(tvs2);
    });

    it('should refresh cache when timeout expires', async () => {
      // Use short cache timeout for testing
      const shortTimeoutConfig = {
        repository: {
          m3uCacheTimeout: 100 // 100ms
        }
      };

      repository = new M3UTvRepository(mockM3uUrl, shortTimeoutConfig, mockLogger);

      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      // First call
      await repository.getAllTvs();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call should fetch again
      await repository.getAllTvs();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use expired cache when fetch fails', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      // First successful fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      await repository.getAllTvs();

      // Force cache expiration
      await repository.refreshTvs();

      // Second fetch fails
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Should use expired cache
      const tvs = await repository.getAllTvs();
      expect(tvs).toHaveLength(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Using expired cache due to fetch error');
    });

    it('should force refresh cache with refreshTvs()', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      // Initial load
      await repository.getAllTvs();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Force refresh
      await repository.refreshTvs();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('TV Channel Retrieval', () => {
    beforeEach(async () => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);

      const mockTvs = [
        {
          id: 'news1',
          name: 'News Channel 1',
          group: 'News',
          url: 'http://example.com/news1.m3u8'
        },
        {
          id: 'sports1',
          name: 'Sports Channel 1',
          group: 'Sports',
          url: 'http://example.com/sports1.m3u8'
        },
        {
          id: 'sports2',
          name: 'Sports Channel 2',
          group: 'Sports',
          url: 'http://example.com/sports2.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      // Pre-load channels
      await repository.getAllTvs();
    });

    it('should get all TV channels', async () => {
      const tvs = await repository.getAllTvs();

      expect(tvs).toHaveLength(3);
      expect(tvs.map(tv => tv.id)).toEqual(['news1', 'sports1', 'sports2']);
    });

    it('should get TV channel by ID', async () => {
      const tv = await repository.getTvById('sports1');

      expect(tv).toBeDefined();
      expect(tv.id).toBe('sports1');
      expect(tv.name).toBe('Sports Channel 1');
      expect(tv.group).toBe('Sports');
    });

    it('should return null for non-existent channel ID', async () => {
      const tv = await repository.getTvById('nonexistent');

      expect(tv).toBeNull();
    });

    it('should get available groups', async () => {
      const groups = await repository.getAvailableGroups();

      expect(groups).toEqual(['News', 'Sports']);
      expect(groups).toHaveLength(2);
    });

    it('should return sorted groups', async () => {
      // Add more groups to test sorting
      const mockTvs = [
        { id: 'z1', name: 'Z Channel', group: 'Z-Group', url: 'http://z.com' },
        { id: 'a1', name: 'A Channel', group: 'A-Group', url: 'http://a.com' },
        { id: 'm1', name: 'M Channel', group: 'M-Group', url: 'http://m.com' }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.parse.mockReturnValue(mockTvs);

      await repository.refreshTvs();
      const groups = await repository.getAvailableGroups();

      expect(groups).toEqual(['A-Group', 'M-Group', 'Z-Group']);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);
    });

    it('should return correct statistics', async () => {
      const mockTvs = [
        {
          id: 'news1',
          name: 'News Channel 1',
          group: 'News',
          url: 'http://example.com/news1.m3u8'
        },
        {
          id: 'sports1',
          name: 'Sports Channel 1',
          group: 'Sports',
          url: 'http://example.com/sports1.m3u8'
        },
        {
          id: 'sports2',
          name: 'Sports Channel 2',
          group: 'Sports',
          url: 'http://example.com/sports2.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      const stats = await repository.getStats();

      expect(stats.total).toBe(3);
      expect(stats.groups).toBe(2);
      expect(stats.groupNames).toEqual(['News', 'Sports']);
      expect(stats.lastUpdated).toBeTypeOf('number');
      expect(mockLogger.debug).toHaveBeenCalledWith('[DEBUG] TV channels statistics:', stats);
    });

    it('should return empty statistics on error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const stats = await repository.getStats();

      expect(stats.total).toBe(0);
      expect(stats.groups).toBe(0);
      expect(stats.groupNames).toEqual([]);
      expect(stats.lastUpdated).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[DEBUG] Error fetching TV statistics',
        expect.any(Error)
      );
    });
  });

  describe('Configuration', () => {
    beforeEach(() => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);
    });

    it('should return configuration information', () => {
      const config = repository.getConfig();

      expect(config).toEqual({
        m3uUrl: mockM3uUrl,
        cacheTimeout: mockCacheTimeout,
        channelsLoaded: 0,
        lastFetch: null,
        cacheValid: false
      });
    });

    it('should update configuration after loading channels', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      await repository.getAllTvs();

      const config = repository.getConfig();

      expect(config.channelsLoaded).toBe(1);
      expect(config.lastFetch).toBeTypeOf('number');
      expect(config.cacheValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      repository = new M3UTvRepository(mockM3uUrl, mockConfig, mockLogger);
    });

    it('should handle empty M3U content', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue([]);

      const tvs = await repository.getAllTvs();

      expect(tvs).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 0 tvs from M3U source')
      );
    });

    it('should handle channels with missing properties', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          // Missing group
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      const tvs = await repository.getAllTvs();
      const groups = await repository.getAvailableGroups();

      expect(tvs).toHaveLength(1);
      expect(groups).toContain(undefined); // Should handle undefined group
    });

    it('should handle concurrent requests', async () => {
      const mockTvs = [
        {
          id: 'channel1',
          name: 'Channel 1',
          group: 'News',
          url: 'http://example.com/stream1.m3u8'
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      // Make concurrent requests
      const promises = [
        repository.getAllTvs(),
        repository.getTvById('channel1'),
        repository.getAvailableGroups(),
        repository.getStats()
      ];

      const results = await Promise.all(promises);

      expect(results[0]).toHaveLength(1); // getAllTvs
      expect(results[1]).toBeDefined(); // getTvById
      expect(results[2]).toBeInstanceOf(Array); // getAvailableGroups
      expect(results[3]).toHaveProperty('total'); // getStats

      // Should only fetch once despite concurrent requests
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle very large M3U files', async () => {
      // Simulate large number of channels
      const mockTvs = Array.from({ length: 10000 }, (_, i) => ({
        id: `channel${i}`,
        name: `Channel ${i}`,
        group: `Group ${i % 100}`,
        url: `http://example.com/stream${i}.m3u8`
      }));

      global.fetch.mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('#EXTM3U\n')
      });

      mockM3UParser.isValidM3U.mockReturnValue(true);
      mockM3UParser.parse.mockReturnValue(mockTvs);

      const tvs = await repository.getAllTvs();
      const groups = await repository.getAvailableGroups();
      const stats = await repository.getStats();

      expect(tvs).toHaveLength(10000);
      expect(groups).toHaveLength(100);
      expect(stats.total).toBe(10000);
      expect(stats.groups).toBe(100);
    });
  });
});