/**
 * @fileoverview Tests unitarios para la entidad Tv
 * Siguiendo principios de Clean Architecture y DDD
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Tv } from '@/domain/entities/Tv.js';

describe('Domain Entity: Tv', () => {
  let validTvData;

  beforeEach(() => {
    validTvData = {
      id: 'tv_test_channel',
      name: 'Test Channel',
      streamUrl: 'https://example.com/stream.m3u8',
      logo: 'https://example.com/logo.png',
      group: 'Entertainment',
      tvgId: 'test.channel',
      tvgName: 'Test Channel HD'
    };
  });

  describe('Constructor', () => {
    it('should create a valid Tv instance with all fields', () => {
      const tv = new Tv(validTvData);

      expect(tv.id).toBe(validTvData.id);
      expect(tv.name).toBe(validTvData.name);
      expect(tv.streamUrl).toBe(validTvData.streamUrl);
      expect(tv.logo).toBe(validTvData.logo);
      expect(tv.group).toBe(validTvData.group);
      expect(tv.tvgId).toBe(validTvData.tvgId);
      expect(tv.tvgName).toBe(validTvData.tvgName);
    });

    it('should create a valid Tv instance with only required fields', () => {
      const minimalData = {
        id: 'tv_minimal',
        name: 'Minimal Channel',
        streamUrl: 'https://example.com/minimal.m3u8'
      };

      const tv = new Tv(minimalData);

      expect(tv.id).toBe(minimalData.id);
      expect(tv.name).toBe(minimalData.name);
      expect(tv.streamUrl).toBe(minimalData.streamUrl);
      expect(tv.logo).toBe(null);
      expect(tv.group).toBe('General'); // valor por defecto
      expect(tv.tvgId).toBe(null);
      expect(tv.tvgName).toBe(minimalData.name); // usa name como fallback
    });

    it('should be immutable after creation', () => {
      const tv = new Tv(validTvData);

      expect(() => {
        tv.id = 'modified';
      }).toThrow();

      expect(() => {
        tv.name = 'Modified Name';
      }).toThrow();

      expect(Object.isFrozen(tv)).toBe(true);
    });

    it('should use name as tvgName fallback when tvgName is not provided', () => {
      const dataWithoutTvgName = {
        id: 'tv_test',
        name: 'Test Channel',
        streamUrl: 'https://example.com/stream.m3u8'
      };

      const tv = new Tv(dataWithoutTvgName);
      expect(tv.tvgName).toBe(dataWithoutTvgName.name);
    });
  });

  describe('Validation', () => {
    it('should throw error when data is not an object', () => {
      expect(() => new Tv(null)).toThrow('Tv data must be an object');
      expect(() => new Tv(undefined)).toThrow('Tv data must be an object');
      expect(() => new Tv('string')).toThrow('Tv data must be an object');
      expect(() => new Tv(123)).toThrow('Tv data must be an object');
    });

    it('should throw error when id is missing', () => {
      const invalidData = { ...validTvData };
      delete invalidData.id;

      expect(() => new Tv(invalidData)).toThrow('Tv id is required and must be a string');
    });

    it('should throw error when name is missing', () => {
      const invalidData = { ...validTvData };
      delete invalidData.name;

      expect(() => new Tv(invalidData)).toThrow('Tv name is required and must be a string');
    });

    it('should throw error when streamUrl is missing', () => {
      const invalidData = { ...validTvData };
      delete invalidData.streamUrl;

      expect(() => new Tv(invalidData)).toThrow('Tv streamUrl is required and must be a string');
    });

    it('should throw error when id is not a string', () => {
      const invalidData = { ...validTvData, id: 123 };
      expect(() => new Tv(invalidData)).toThrow('Tv id is required and must be a string');
    });

    it('should throw error when name is not a string', () => {
      const invalidData = { ...validTvData, name: 123 };
      expect(() => new Tv(invalidData)).toThrow('Tv name is required and must be a string');
    });

    it('should throw error when streamUrl is not a string', () => {
      const invalidData = { ...validTvData, streamUrl: 123 };
      expect(() => new Tv(invalidData)).toThrow('Tv streamUrl is required and must be a string');
    });

    it('should throw error when id is empty string', () => {
      const invalidData = { ...validTvData, id: '' };
      expect(() => new Tv(invalidData)).toThrow('Tv id is required and must be a string');
    });

    it('should throw error when name is empty string', () => {
      const invalidData = { ...validTvData, name: '' };
      expect(() => new Tv(invalidData)).toThrow('Tv name is required and must be a string');
    });

    it('should throw error when streamUrl is empty string', () => {
      const invalidData = { ...validTvData, streamUrl: '' };
      expect(() => new Tv(invalidData)).toThrow('Tv streamUrl is required and must be a string');
    });

    it('should throw error when streamUrl is not a valid HTTP/HTTPS URL', () => {
      const invalidUrls = [
        'ftp://example.com/stream.m3u8',
        'file:///local/stream.m3u8',
        'not-a-url',
        'http://',
        'https://'
      ];

      invalidUrls.forEach(url => {
        const invalidData = { ...validTvData, streamUrl: url };
        expect(() => new Tv(invalidData)).toThrow('Tv stream URL must be a valid HTTP/HTTPS URL');
      });
    });

    it('should accept valid HTTP and HTTPS URLs', () => {
      const validUrls = [
        'http://example.com/stream.m3u8',
        'https://example.com/stream.m3u8',
        'https://subdomain.example.com:8080/path/to/stream.m3u8?param=value',
        'http://192.168.1.1:8080/stream.m3u8'
      ];

      validUrls.forEach(url => {
        const data = { ...validTvData, streamUrl: url };
        expect(() => new Tv(data)).not.toThrow();
      });
    });
  });

  describe('toStremioMeta', () => {
    it('should convert to valid Stremio metadata format', () => {
      const tv = new Tv(validTvData);
      const meta = tv.toStremioMeta();

      expect(meta).toHaveProperty('id', validTvData.id);
      expect(meta).toHaveProperty('type', 'tv');
      expect(meta).toHaveProperty('name', validTvData.name);
      expect(meta).toHaveProperty('poster', validTvData.logo);
      expect(meta).toHaveProperty('posterShape', 'landscape');
      expect(meta).toHaveProperty('background', validTvData.logo);
      expect(meta).toHaveProperty('description', `Canal: ${validTvData.name} (${validTvData.group})`);
      expect(meta).toHaveProperty('genre', [validTvData.group]);
      expect(meta).toHaveProperty('runtime', 'Live TV');
      expect(meta).toHaveProperty('country', 'ES');
      expect(meta).toHaveProperty('language', 'es');
      expect(meta).toHaveProperty('behaviorHints');
      expect(meta.behaviorHints).toHaveProperty('defaultVideoId', validTvData.id);
      expect(meta.behaviorHints).toHaveProperty('hasScheduledVideos', false);
    });

    it('should handle missing logo in metadata', () => {
      const dataWithoutLogo = { ...validTvData };
      delete dataWithoutLogo.logo;

      const tv = new Tv(dataWithoutLogo);
      const meta = tv.toStremioMeta();

      expect(meta.poster).toBe(null);
      expect(meta.background).toBe(null);
    });

    it('should handle default group in description', () => {
      const dataWithoutGroup = {
        id: 'tv_test',
        name: 'Test Channel',
        streamUrl: 'https://example.com/stream.m3u8'
      };

      const tv = new Tv(dataWithoutGroup);
      const meta = tv.toStremioMeta();

      expect(meta.description).toBe('Canal: Test Channel (General)');
      expect(meta.genre).toEqual(['General']);
    });

    it('should include current year in released field', () => {
      const tv = new Tv(validTvData);
      const meta = tv.toStremioMeta();
      const currentYear = new Date().getFullYear().toString();

      expect(meta.released).toBe(currentYear);
    });
  });

  describe('toStremioStream', () => {
    it('should convert to valid Stremio stream format', () => {
      const tv = new Tv(validTvData);
      const stream = tv.toStremioStream();

      expect(stream).toHaveProperty('name', validTvData.name);
      expect(stream).toHaveProperty('description', `Canal: ${validTvData.name} (${validTvData.group})`);
      expect(stream).toHaveProperty('url', validTvData.streamUrl);
      expect(stream).toHaveProperty('behaviorHints');
      expect(stream.behaviorHints).toHaveProperty('notWebReady', true);
      expect(stream.behaviorHints).toHaveProperty('bingeGroup', `tv-${validTvData.group}`);
      expect(stream.behaviorHints).toHaveProperty('proxyHeaders');
      expect(stream.behaviorHints.proxyHeaders).toHaveProperty('request');
      expect(stream.behaviorHints.proxyHeaders.request).toHaveProperty('User-Agent');
    });

    it('should handle default group in stream', () => {
      const dataWithoutGroup = {
        id: 'tv_test',
        name: 'Test Channel',
        streamUrl: 'https://example.com/stream.m3u8'
      };

      const tv = new Tv(dataWithoutGroup);
      const stream = tv.toStremioStream();

      expect(stream.description).toBe('Canal: Test Channel (General)');
      expect(stream.behaviorHints.bingeGroup).toBe('tv-General');
    });
  });

  describe('generateId static method', () => {
    it('should generate valid ID from normal name', () => {
      const id = Tv.generateId('Test Channel');
      expect(id).toBe('tv_test-channel');
    });

    it('should handle names with special characters', () => {
      const id = Tv.generateId('Test Channel: HD (Premium)');
      expect(id).toBe('tv_test-channel-hd-premium');
    });

    it('should handle names with accents and unicode', () => {
      const id = Tv.generateId('Televisión Española');
      expect(id).toBe('tv_television-espanola');
    });

    it('should handle names with multiple spaces', () => {
      const id = Tv.generateId('Test    Channel    HD');
      expect(id).toBe('tv_test-channel-hd');
    });

    it('should handle empty or invalid names', () => {
      expect(Tv.generateId('')).toMatch(/^tv_invalid_\d+$/);
      expect(Tv.generateId('   ')).toMatch(/^tv_invalid_\d+$/);
      expect(Tv.generateId(null)).toMatch(/^tv_invalid_\d+$/);
      expect(Tv.generateId(undefined)).toMatch(/^tv_invalid_\d+$/);
      expect(Tv.generateId(123)).toMatch(/^tv_invalid_\d+$/);
    });

    it('should handle names with only special characters', () => {
      const id = Tv.generateId('!@#$%^&*()');
      expect(id).toMatch(/^tv_unnamed_\d+$/);
    });

    it('should handle very long names', () => {
      const longName = 'Very Long Channel Name That Should Be Processed Correctly Without Issues';
      const id = Tv.generateId(longName);
      expect(id).toBe('tv_very-long-channel-name-that-should-be-processed-correctly-without-issues');
      expect(id.startsWith('tv_')).toBe(true);
    });

    it('should handle names with consecutive special characters', () => {
      const id = Tv.generateId('Test---Channel___HD');
      expect(id).toBe('tv_test-channel-hd');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long names', () => {
      const longName = 'Very Long Channel Name That Exceeds Normal Length Expectations For Testing Purposes';
      const data = { ...validTvData, name: longName };

      const tv = new Tv(data);
      expect(tv.name).toBe(longName);
    });

    it('should handle special characters in name', () => {
      const specialName = 'Test Channel: HD (Premium) - 24/7 [Live]';
      const data = { ...validTvData, name: specialName };

      const tv = new Tv(data);
      expect(tv.name).toBe(specialName);
    });

    it('should handle unicode characters in name', () => {
      const unicodeName = 'Televisión Española - Niños & Niñas';
      const data = { ...validTvData, name: unicodeName };

      const tv = new Tv(data);
      expect(tv.name).toBe(unicodeName);
    });

    it('should handle very long URLs', () => {
      const longUrl = 'https://very-long-domain-name-for-testing.example.com:8080/very/long/path/to/stream/file.m3u8?param1=value1&param2=value2&param3=value3';
      const data = { ...validTvData, streamUrl: longUrl };

      const tv = new Tv(data);
      expect(tv.streamUrl).toBe(longUrl);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data integrity after creation', () => {
      const tv = new Tv(validTvData);
      const originalData = { ...validTvData };

      expect(tv.id).toBe(originalData.id);
      expect(tv.name).toBe(originalData.name);
      expect(tv.streamUrl).toBe(originalData.streamUrl);
      expect(tv.logo).toBe(originalData.logo);
      expect(tv.group).toBe(originalData.group);
    });

    it('should not be affected by changes to original data object', () => {
      const originalData = { ...validTvData };
      const tv = new Tv(originalData);

      // Modificar el objeto original
      originalData.name = 'Modified Name';
      originalData.group = 'Modified Group';

      // Verificar que el tv no se ve afectado
      expect(tv.name).toBe(validTvData.name);
      expect(tv.group).toBe(validTvData.group);
    });
  });
});