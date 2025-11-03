/**
 * @fileoverview Unit tests for TvHandler
 * Tests catalog, meta, and stream handlers for TV channels
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TvHandler } from '@/application/handlers/TvHandler.js';
import { MockLogger } from '@tests/mocks/MockLogger.js';
import { mockData } from '../../../mocks/mockData.js';

describe('TvHandler', () => {
  let handler;
  let mockTvRepository;
  let mockConfig;
  let mockLogger;
  let mockTvChannels;

  beforeEach(() => {
    mockLogger = MockLogger.create();
    
    mockConfig = {
      cache: {
        tvCatalogMaxAge: 3600,
        metadataCacheMaxAge: 1800,
        streamCacheMaxAge: 300
      }
    };

    mockTvChannels = [
      {
        id: 'channel1',
        name: 'Test Channel 1',
        group: 'News',
        streamUrl: 'http://example.com/stream1.m3u8',
        toStremioMeta: vi.fn().mockReturnValue({
          id: 'channel1',
          name: 'Test Channel 1',
          type: 'tv'
        }),
        toStremioStream: vi.fn().mockReturnValue({
          url: 'http://example.com/stream1.m3u8',
          title: 'Test Channel 1'
        })
      },
      {
        id: 'channel2',
        name: 'Test Channel 2',
        group: 'Sports',
        streamUrl: 'http://example.com/stream2.m3u8',
        toStremioMeta: vi.fn().mockReturnValue({
          id: 'channel2',
          name: 'Test Channel 2',
          type: 'tv'
        }),
        toStremioStream: vi.fn().mockReturnValue({
          url: 'http://example.com/stream2.m3u8',
          title: 'Test Channel 2'
        })
      }
    ];

    mockTvRepository = {
      getAllTvs: vi.fn().mockResolvedValue(mockTvChannels),
      getTvById: vi.fn().mockImplementation((id) => {
        const channel = mockTvChannels.find(ch => ch.id === id);
        return Promise.resolve(channel || null);
      })
    };

    handler = new TvHandler(mockTvRepository, mockConfig, mockLogger);
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(handler).toBeInstanceOf(TvHandler);
    });

    it('should store repository, config, and logger', () => {
      // Test by calling methods that use these dependencies
      expect(() => handler.createCatalogHandler()).not.toThrow();
      expect(() => handler.createMetaHandler()).not.toThrow();
      expect(() => handler.createStreamHandler()).not.toThrow();
    });
  });

  describe('createCatalogHandler', () => {
    let catalogHandler;

    beforeEach(() => {
      catalogHandler = handler.createCatalogHandler();
    });

    it('should return a function', () => {
      expect(typeof catalogHandler).toBe('function');
    });

    it('should return all TV channels when no genre filter', async () => {
      const args = { id: 'tv_catalog' };
      const result = await catalogHandler(args);

      expect(result).toEqual({
        metas: [
          { id: 'channel1', name: 'Test Channel 1', type: 'tv' },
          { id: 'channel2', name: 'Test Channel 2', type: 'tv' }
        ],
        cacheMaxAge: 3600
      });

      expect(mockTvRepository.getAllTvs).toHaveBeenCalledOnce();
      expect(mockTvChannels[0].toStremioMeta).toHaveBeenCalledOnce();
      expect(mockTvChannels[1].toStremioMeta).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('TV catalog request: id=tv_catalog');
    });

    it('should filter channels by genre when specified', async () => {
      const args = { 
        id: 'tv_catalog',
        extra: { genre: 'News' }
      };
      const result = await catalogHandler(args);

      expect(result).toEqual({
        metas: [
          { id: 'channel1', name: 'Test Channel 1', type: 'tv' }
        ],
        cacheMaxAge: 3600
      });

      expect(mockTvChannels[0].toStremioMeta).toHaveBeenCalledOnce();
      expect(mockTvChannels[1].toStremioMeta).not.toHaveBeenCalled();
    });

    it('should return empty array when no channels match genre', async () => {
      const args = { 
        id: 'tv_catalog',
        extra: { genre: 'NonExistent' }
      };
      const result = await catalogHandler(args);

      expect(result).toEqual({
        metas: [],
        cacheMaxAge: 3600
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('No TV channels found for genre: "NonExistent"');
    });

    it('should handle empty TV repository', async () => {
      mockTvRepository.getAllTvs.mockResolvedValue([]);
      const args = { id: 'tv_catalog' };
      const result = await catalogHandler(args);

      expect(result).toEqual({ metas: [] });
      expect(mockLogger.warn).toHaveBeenCalledWith('No TV channels found for catalog');
    });

    it('should handle null TV repository response', async () => {
      mockTvRepository.getAllTvs.mockResolvedValue(null);
      const args = { id: 'tv_catalog' };
      const result = await catalogHandler(args);

      expect(result).toEqual({ metas: [] });
      expect(mockLogger.warn).toHaveBeenCalledWith('No TV channels found for catalog');
    });

    it('should handle repository errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockTvRepository.getAllTvs.mockRejectedValue(error);
      
      const args = { id: 'tv_catalog' };
      const result = await catalogHandler(args);

      expect(result).toEqual({ metas: [] });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching TV catalog',
        { error: 'Database connection failed' }
      );
    });

    it('should handle channels without toStremioMeta method', async () => {
      const invalidChannel = { id: 'invalid', name: 'Invalid Channel' };
      mockTvRepository.getAllTvs.mockResolvedValue([invalidChannel]);
      
      const args = { id: 'tv_catalog' };
      
      await expect(catalogHandler(args)).rejects.toThrow();
    });
  });

  describe('createMetaHandler', () => {
    let metaHandler;

    beforeEach(() => {
      metaHandler = handler.createMetaHandler();
    });

    it('should return a function', () => {
      expect(typeof metaHandler).toBe('function');
    });

    it('should return channel metadata when channel exists', async () => {
      const args = { id: 'channel1' };
      const result = await metaHandler(args);

      expect(result).toEqual({
        meta: { id: 'channel1', name: 'Test Channel 1', type: 'tv' },
        cacheMaxAge: 1800,
        staleRevalidate: 5400,
        staleError: 10800
      });

      expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      expect(mockTvChannels[0].toStremioMeta).toHaveBeenCalledOnce();
    });

    it('should handle channel ID with options (colon-separated)', async () => {
      const args = { id: 'channel1:option1:option2' };
      const result = await metaHandler(args);

      expect(result.meta).toEqual({ id: 'channel1', name: 'Test Channel 1', type: 'tv' });
      expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
    });

    it('should return empty meta when channel not found', async () => {
      const args = { id: 'nonexistent' };
      const result = await metaHandler(args);

      expect(result).toEqual({
        meta: {},
        cacheMaxAge: 1800,
        staleRevalidate: 3600,
        staleError: 7200
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('TV channel not found: nonexistent');
    });

    it('should include debug metadata in development environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const args = { id: 'channel1' };
      const result = await metaHandler(args);

      expect(result._metadata).toEqual({
        channelFound: true,
        channelId: 'channel1',
        channelName: 'Test Channel 1',
        timestamp: expect.any(String)
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should include debug metadata for not found channels in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const args = { id: 'nonexistent' };
      const result = await metaHandler(args);

      expect(result._metadata).toEqual({
        channelFound: false,
        channelId: 'nonexistent',
        timestamp: expect.any(String)
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle repository errors gracefully', async () => {
      const error = new Error('Database error');
      mockTvRepository.getTvById.mockRejectedValue(error);

      const args = { id: 'channel1' };
      const result = await metaHandler(args);

      expect(result).toEqual({
        meta: {},
        cacheMaxAge: 1800,
        staleRevalidate: 1800,
        staleError: 3600
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching TV meta',
        { error: 'Database error', args }
      );
    });

    it('should include error metadata in development environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      mockTvRepository.getTvById.mockRejectedValue(error);

      const args = { id: 'channel1' };
      const result = await metaHandler(args);

      expect(result._metadata).toEqual({
        error: true,
        errorMessage: 'Test error',
        timestamp: expect.any(String)
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('createStreamHandler', () => {
    let streamHandler;

    beforeEach(() => {
      streamHandler = handler.createStreamHandler();
    });

    it('should return a function', () => {
      expect(typeof streamHandler).toBe('function');
    });

    it('should return stream when channel exists', async () => {
      const args = { id: 'channel1' };
      const result = await streamHandler(args);

      expect(result).toEqual({
        streams: [{
          url: 'http://example.com/stream1.m3u8',
          title: 'Test Channel 1'
        }],
        cacheMaxAge: 300
      });

      expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      expect(mockTvChannels[0].toStremioStream).toHaveBeenCalledOnce();
    });

    it('should handle channel ID with options (colon-separated)', async () => {
      const args = { id: 'channel2:hd:subtitles' };
      const result = await streamHandler(args);

      expect(result.streams).toEqual([{
        url: 'http://example.com/stream2.m3u8',
        title: 'Test Channel 2'
      }]);
      expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel2');
    });

    it('should return empty streams when channel not found', async () => {
      const args = { id: 'nonexistent' };
      const result = await streamHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('TV channel not found: nonexistent');
    });

    it('should handle repository errors gracefully', async () => {
      const error = new Error('Stream fetch error');
      mockTvRepository.getTvById.mockRejectedValue(error);

      const args = { id: 'channel1' };
      const result = await streamHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching TV stream',
        { error: 'Stream fetch error', args }
      );
    });

    it('should handle null repository response', async () => {
      mockTvRepository.getTvById.mockResolvedValue(null);

      const args = { id: 'channel1' };
      const result = await streamHandler(args);

      expect(result).toEqual({
        streams: [],
        cacheMaxAge: 300
      });
    });
  });

  describe('Private Methods', () => {
    describe('#extractChannelId', () => {
      it('should extract channel ID from simple ID', async () => {
        const streamHandler = handler.createStreamHandler();
        const args = { id: 'channel1' };
        
        await streamHandler(args);
        
        expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      });

      it('should extract channel ID from complex ID with options', async () => {
        const streamHandler = handler.createStreamHandler();
        const args = { id: 'channel1:option1:option2:option3' };
        
        await streamHandler(args);
        
        expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      });

      it('should handle empty options', async () => {
        const streamHandler = handler.createStreamHandler();
        const args = { id: 'channel1:' };
        
        await streamHandler(args);
        
        expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      });
    });

    describe('#getTvById', () => {
      it('should return channel when found', async () => {
        const metaHandler = handler.createMetaHandler();
        const args = { id: 'channel1' };
        
        const result = await metaHandler(args);
        
        expect(result.meta).toBeDefined();
        expect(mockTvRepository.getTvById).toHaveBeenCalledWith('channel1');
      });

      it('should return null when channel not found', async () => {
        mockTvRepository.getTvById.mockResolvedValue(null);
        
        const metaHandler = handler.createMetaHandler();
        const args = { id: 'nonexistent' };
        
        const result = await metaHandler(args);
        
        expect(result.meta).toEqual({});
      });

      it('should handle repository errors and return null', async () => {
        mockTvRepository.getTvById.mockRejectedValue(new Error('DB Error'));
        
        const metaHandler = handler.createMetaHandler();
        const args = { id: 'channel1' };
        
        const result = await metaHandler(args);
        
        expect(result.meta).toEqual({});
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Error fetching TV channel channel1:',
          { error: 'DB Error' }
        );
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow for existing channel', async () => {
      const catalogHandler = handler.createCatalogHandler();
      const metaHandler = handler.createMetaHandler();
      const streamHandler = handler.createStreamHandler();

      // Test catalog
      const catalogResult = await catalogHandler({ id: 'tv_catalog' });
      expect(catalogResult.metas).toHaveLength(2);

      // Test meta for first channel
      const metaResult = await metaHandler({ id: 'channel1' });
      expect(metaResult.meta.id).toBe('channel1');

      // Test stream for first channel
      const streamResult = await streamHandler({ id: 'channel1' });
      expect(streamResult.streams).toHaveLength(1);
    });

    it('should handle complete workflow for non-existent channel', async () => {
      const metaHandler = handler.createMetaHandler();
      const streamHandler = handler.createStreamHandler();

      // Test meta for non-existent channel
      const metaResult = await metaHandler({ id: 'nonexistent' });
      expect(metaResult.meta).toEqual({});

      // Test stream for non-existent channel
      const streamResult = await streamHandler({ id: 'nonexistent' });
      expect(streamResult.streams).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined args', async () => {
      const catalogHandler = handler.createCatalogHandler();
      
      await expect(catalogHandler(undefined)).rejects.toThrow();
    });

    it('should handle null args', async () => {
      const metaHandler = handler.createMetaHandler();
      
      await expect(metaHandler(null)).rejects.toThrow();
    });

    it('should handle empty string ID', async () => {
      const streamHandler = handler.createStreamHandler();
      const args = { id: '' };
      
      const result = await streamHandler(args);
      
      expect(result.streams).toEqual([]);
      expect(mockTvRepository.getTvById).toHaveBeenCalledWith('');
    });

    it('should handle very long channel IDs', async () => {
      const longId = 'a'.repeat(1000);
      const streamHandler = handler.createStreamHandler();
      const args = { id: longId };
      
      const result = await streamHandler(args);
      
      expect(mockTvRepository.getTvById).toHaveBeenCalledWith(longId);
    });

    it('should handle special characters in channel ID', async () => {
      const specialId = 'channel-1_test@domain.com';
      const streamHandler = handler.createStreamHandler();
      const args = { id: specialId };
      
      const result = await streamHandler(args);
      
      expect(mockTvRepository.getTvById).toHaveBeenCalledWith(specialId);
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent requests', async () => {
      const catalogHandler = handler.createCatalogHandler();
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(catalogHandler({ id: 'tv_catalog' }));
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.metas).toHaveLength(2);
      });
    });

    it('should handle large number of channels efficiently', async () => {
      const largeChannelList = Array.from({ length: 1000 }, (_, i) => ({
        id: `channel${i}`,
        name: `Channel ${i}`,
        group: i % 2 === 0 ? 'News' : 'Sports',
        toStremioMeta: vi.fn().mockReturnValue({ id: `channel${i}`, name: `Channel ${i}`, type: 'tv' })
      }));
      
      mockTvRepository.getAllTvs.mockResolvedValue(largeChannelList);
      
      const catalogHandler = handler.createCatalogHandler();
      const startTime = Date.now();
      
      const result = await catalogHandler({ id: 'tv_catalog' });
      
      const endTime = Date.now();
      
      expect(result.metas).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});