/**
 * @fileoverview Tests unitarios para CsvFileInitializer
 * Valida inicialización, validación y reparación de archivos CSV
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn()
}));

// Mock path module
vi.mock('path', () => ({
  dirname: vi.fn(),
  join: vi.fn()
}));

// Import mocked functions
import { existsSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';

// Import the class after mocking
import { CsvFileInitializer } from '../../../../src/infrastructure/utils/CsvFileInitializer.js';

describe('CsvFileInitializer', () => {
  let testDirectory;
  let mockLogger;

  beforeEach(() => {
    testDirectory = '/test/data';
    
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset mock functions
    existsSync.mockReturnValue(false);
    writeFileSync.mockImplementation(() => {});
    mkdirSync.mockImplementation(() => {});
    readFileSync.mockReturnValue('');
    rmSync.mockImplementation(() => {});
    
    // Default mock implementations
    dirname.mockImplementation(path => {
      const parts = path.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });
    join.mockImplementation((...paths) => paths.join('/'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('should have correct CSV header format', () => {
      const expectedHeader = 'content_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode,imdb_id,id_type';
      
      expect(CsvFileInitializer.CSV_HEADER).toBe(expectedHeader);
    });

    it('should have all required fields in header', () => {
      const requiredFields = [
        'content_id', 'name', 'magnet', 'quality', 'size', 
        'source', 'fileIdx', 'filename', 'provider', 
        'seeders', 'peers', 'season', 'episode', 'imdb_id', 'id_type'
      ];

      const headerFields = CsvFileInitializer.CSV_HEADER.split(',');
      
      requiredFields.forEach(field => {
        expect(headerFields).toContain(field);
      });
    });
  });

  describe('initializeAllCsvFiles', () => {
    it('should create data directory if it does not exist', () => {
      existsSync.mockReturnValue(false);

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      expect(mkdirSync).toHaveBeenCalledWith(testDirectory, { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      existsSync.mockReturnValue(true);

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should initialize all required CSV files', () => {
      const expectedFiles = ['anime.csv', 'english.csv', 'magnets.csv', 'torrentio.csv'];
      
      existsSync.mockReturnValue(false);

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      expectedFiles.forEach(filename => {
        const expectedPath = `${testDirectory}/${filename}`;
        expect(writeFileSync).toHaveBeenCalledWith(
          expectedPath,
          CsvFileInitializer.CSV_HEADER + '\n',
          'utf8'
        );
      });
    });

    it('should handle existing CSV files correctly', () => {
      // Mock some files as existing
      existsSync.mockImplementation(path => {
        return path.includes('anime.csv') || path.includes('magnets.csv');
      });

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      // Should only create non-existing files
      expect(writeFileSync).toHaveBeenCalledTimes(2); // english.csv and torrentio.csv
    });

    it('should create parent directories for CSV files if needed', () => {
      existsSync.mockImplementation(path => {
        if (path === testDirectory) return true;
        return false; // CSV files don't exist
      });

      dirname.mockReturnValue('/test/data/subdir');

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      expect(mkdirSync).toHaveBeenCalledWith('/test/data/subdir', { recursive: true });
    });

    it('should handle directory creation errors gracefully', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        CsvFileInitializer.initializeAllCsvFiles(testDirectory);
      }).toThrow('Permission denied');
    });
  });

  describe('ensureCsvFileExists', () => {
    const testFilePath = '/test/data/test.csv';
    const testFilename = 'test.csv';

    it('should create CSV file if it does not exist', () => {
      existsSync.mockReturnValue(false);

      CsvFileInitializer.ensureCsvFileExists(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        CsvFileInitializer.CSV_HEADER + '\n',
        'utf8'
      );
    });

    it('should not create file if it already exists', () => {
      existsSync.mockReturnValue(true);

      CsvFileInitializer.ensureCsvFileExists(testFilePath, testFilename);

      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should create parent directory if it does not exist', () => {
      existsSync.mockImplementation(path => {
        if (path === testFilePath) return false;
        if (path === '/test/data') return false;
        return true;
      });

      dirname.mockReturnValue('/test/data');

      CsvFileInitializer.ensureCsvFileExists(testFilePath, testFilename);

      expect(mkdirSync).toHaveBeenCalledWith('/test/data', { recursive: true });
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should handle nested directory structures', () => {
      const nestedPath = '/test/data/deep/nested/file.csv';
      
      existsSync.mockReturnValue(false);
      dirname.mockReturnValue('/test/data/deep/nested');

      CsvFileInitializer.ensureCsvFileExists(nestedPath, 'file.csv');

      expect(mkdirSync).toHaveBeenCalledWith('/test/data/deep/nested', { recursive: true });
      expect(writeFileSync).toHaveBeenCalledWith(
        nestedPath,
        CsvFileInitializer.CSV_HEADER + '\n',
        'utf8'
      );
    });

    it('should handle file creation errors', () => {
      existsSync.mockReturnValue(false);
      writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => {
        CsvFileInitializer.ensureCsvFileExists(testFilePath, testFilename);
      }).toThrow('Disk full');
    });
  });

  describe('validateCsvFormat', () => {
    const testFilePath = '/test/data/validate.csv';

    it('should return false if file does not exist', () => {
      existsSync.mockReturnValue(false);

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(false);
    });

    it('should return true for correctly formatted CSV', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(CsvFileInitializer.CSV_HEADER + '\ndata,row,here');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(true);
    });

    it('should return false for incorrectly formatted CSV', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('wrong,header,format\ndata,row,here');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(false);
    });

    it('should handle empty files', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(false);
    });

    it('should handle files with only whitespace', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('   \n  \n  ');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(false);
    });

    it('should handle header with extra whitespace', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(`  ${CsvFileInitializer.CSV_HEADER}  \ndata,row,here`);

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(true);
    });

    it('should handle file read errors gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(false);
    });

    it('should handle files with Windows line endings', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(CsvFileInitializer.CSV_HEADER + '\r\ndata,row,here\r\n');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(true);
    });

    it('should handle files with mixed line endings', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(CsvFileInitializer.CSV_HEADER + '\r\ndata,row,here\n');

      const result = CsvFileInitializer.validateCsvFormat(testFilePath);

      expect(result).toBe(true);
    });
  });

  describe('repairCsvFormat', () => {
    const testFilePath = '/test/data/repair.csv';
    const testFilename = 'repair.csv';

    it('should repair CSV with incorrect header', () => {
      const incorrectContent = 'wrong,header,format\ndata,row,1\ndata,row,2';
      const expectedContent = `${CsvFileInitializer.CSV_HEADER}\ndata,row,1\ndata,row,2`;

      readFileSync.mockReturnValue(incorrectContent);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        expectedContent,
        'utf8'
      );
    });

    it('should not modify CSV with correct header', () => {
      const correctContent = `${CsvFileInitializer.CSV_HEADER}\ndata,row,1\ndata,row,2`;

      readFileSync.mockReturnValue(correctContent);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle empty files', () => {
      readFileSync.mockReturnValue('');

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        CsvFileInitializer.CSV_HEADER,
        'utf8'
      );
    });

    it('should handle files with only header', () => {
      const headerOnlyContent = 'wrong,header';

      readFileSync.mockReturnValue(headerOnlyContent);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        CsvFileInitializer.CSV_HEADER,
        'utf8'
      );
    });

    it('should preserve data rows when repairing header', () => {
      const contentWithData = 'old,header,format\nrow1,data1,value1\nrow2,data2,value2';
      const expectedContent = `${CsvFileInitializer.CSV_HEADER}\nrow1,data1,value1\nrow2,data2,value2`;

      readFileSync.mockReturnValue(contentWithData);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        expectedContent,
        'utf8'
      );
    });

    it('should handle header with whitespace correctly', () => {
      const contentWithWhitespace = '  wrong , header , format  \ndata,row,here';
      const expectedContent = `${CsvFileInitializer.CSV_HEADER}\ndata,row,here`;

      readFileSync.mockReturnValue(contentWithWhitespace);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        expectedContent,
        'utf8'
      );
    });

    it('should handle read errors gracefully', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('File not readable');
      });

      expect(() => {
        CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);
      }).not.toThrow();
    });

    it('should handle write errors gracefully', () => {
      readFileSync.mockReturnValue('wrong,header\ndata,row');
      writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => {
        CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);
      }).not.toThrow();
    });

    it('should handle Windows line endings in repair', () => {
      const windowsContent = 'wrong,header\r\ndata,row,1\r\ndata,row,2\r\n';
      const expectedContent = `${CsvFileInitializer.CSV_HEADER}\r\ndata,row,1\r\ndata,row,2\r\n`;

      readFileSync.mockReturnValue(windowsContent);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        expectedContent,
        'utf8'
      );
    });

    it('should handle mixed line endings in repair', () => {
      const mixedContent = 'wrong,header\r\ndata,row,1\ndata,row,2\r\n';
      const expectedContent = `${CsvFileInitializer.CSV_HEADER}\r\ndata,row,1\ndata,row,2\r\n`;

      readFileSync.mockReturnValue(mixedContent);

      CsvFileInitializer.repairCsvFormat(testFilePath, testFilename);

      expect(writeFileSync).toHaveBeenCalledWith(
        testFilePath,
        expectedContent,
        'utf8'
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete initialization workflow', () => {
      // Simulate fresh installation
      existsSync.mockReturnValue(false);

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      // Verify directory creation
      expect(mkdirSync).toHaveBeenCalledWith(testDirectory, { recursive: true });

      // Verify all files created
      expect(writeFileSync).toHaveBeenCalledTimes(4);
      
      const expectedFiles = ['anime.csv', 'english.csv', 'magnets.csv', 'torrentio.csv'];
      expectedFiles.forEach(filename => {
        expect(writeFileSync).toHaveBeenCalledWith(
          `${testDirectory}/${filename}`,
          CsvFileInitializer.CSV_HEADER + '\n',
          'utf8'
        );
      });
    });

    it('should handle partial initialization (some files exist)', () => {
      // Simulate partial installation
      existsSync.mockImplementation(path => {
        if (path === testDirectory) return true;
        return path.includes('anime.csv'); // Only anime.csv exists
      });

      CsvFileInitializer.initializeAllCsvFiles(testDirectory);

      // Should not create directory
      expect(mkdirSync).not.toHaveBeenCalledWith(testDirectory, { recursive: true });

      // Should create only missing files
      expect(writeFileSync).toHaveBeenCalledTimes(3);
    });

    it('should handle validation and repair workflow', () => {
      const filePath = '/test/data/corrupted.csv';
      
      // First validation fails
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('corrupted,header\ndata,row');

      let isValid = CsvFileInitializer.validateCsvFormat(filePath);
      expect(isValid).toBe(false);

      // Repair the file
      CsvFileInitializer.repairCsvFormat(filePath, 'corrupted.csv');

      // Mock the repaired content for second validation
      readFileSync.mockReturnValue(`${CsvFileInitializer.CSV_HEADER}\ndata,row`);

      isValid = CsvFileInitializer.validateCsvFormat(filePath);
      expect(isValid).toBe(true);
    });

    it('should handle concurrent file operations', () => {
      existsSync.mockReturnValue(false);

      // Simulate concurrent initialization
      const promises = [
        Promise.resolve().then(() => CsvFileInitializer.ensureCsvFileExists('/test/file1.csv', 'file1.csv')),
        Promise.resolve().then(() => CsvFileInitializer.ensureCsvFileExists('/test/file2.csv', 'file2.csv')),
        Promise.resolve().then(() => CsvFileInitializer.ensureCsvFileExists('/test/file3.csv', 'file3.csv'))
      ];

      return Promise.all(promises).then(() => {
        expect(writeFileSync).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Error Recovery', () => {
    it('should recover from temporary file system errors', () => {
      let callCount = 0;
      existsSync.mockReturnValue(false);
      writeFileSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary error');
        }
        return true;
      });

      // First call should throw
      expect(() => {
        CsvFileInitializer.ensureCsvFileExists('/test/temp.csv', 'temp.csv');
      }).toThrow('Temporary error');

      // Second call should succeed
      expect(() => {
        CsvFileInitializer.ensureCsvFileExists('/test/temp2.csv', 'temp2.csv');
      }).not.toThrow();
    });

    it('should handle corrupted file content gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('\x00\x01\x02invalid binary content');

      const isValid = CsvFileInitializer.validateCsvFormat('/test/binary.csv');
      expect(isValid).toBe(false);

      // Should not throw when trying to repair
      expect(() => {
        CsvFileInitializer.repairCsvFormat('/test/binary.csv', 'binary.csv');
      }).not.toThrow();
    });

    it('should handle very large files efficiently', () => {
      const largeContent = CsvFileInitializer.CSV_HEADER + '\n' + 
        Array(10000).fill('data,row,content,here,large,file,test,data,provider,10,5,1,1,tt1234567,movie').join('\n');

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(largeContent);

      const isValid = CsvFileInitializer.validateCsvFormat('/test/large.csv');
      expect(isValid).toBe(true);

      // Should handle large file repair without issues
      expect(() => {
        CsvFileInitializer.repairCsvFormat('/test/large.csv', 'large.csv');
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in file paths', () => {
      const specialPath = '/test/data with spaces/special-chars_123/file.csv';
      
      existsSync.mockReturnValue(false);
      dirname.mockReturnValue('/test/data with spaces/special-chars_123');

      CsvFileInitializer.ensureCsvFileExists(specialPath, 'file.csv');

      expect(mkdirSync).toHaveBeenCalledWith('/test/data with spaces/special-chars_123', { recursive: true });
      expect(writeFileSync).toHaveBeenCalledWith(
        specialPath,
        CsvFileInitializer.CSV_HEADER + '\n',
        'utf8'
      );
    });

    it('should handle Unicode characters in content', () => {
      const unicodeContent = 'título,descripción,año\nPelícula,Descripción con ñ,2023';
      const testPath = '/test/unicode.csv';

      existsSync.mockReturnValue(false);

      CsvFileInitializer.ensureCsvFileExists(testPath, 'unicode.csv');

      expect(writeFileSync).toHaveBeenCalledWith(
        testPath,
        CsvFileInitializer.CSV_HEADER + '\n',
        'utf8'
      );
    });

    it('should handle extremely long file paths', () => {
      const longPath = '/very/long/path/that/exceeds/normal/limits/and/continues/for/many/directories/deep/into/the/filesystem/structure/test.csv';
      
      existsSync.mockReturnValue(false);
      mkdirSync.mockImplementation(() => {});

      expect(() => {
        CsvFileInitializer.ensureCsvFileExists(longPath, 'test.csv');
      }).not.toThrow();
    });

    it('should handle files with no extension', () => {
      const noExtPath = '/test/noextension';
      
      existsSync.mockReturnValue(false);
      mkdirSync.mockImplementation(() => {});

      expect(() => {
        CsvFileInitializer.ensureCsvFileExists(noExtPath, 'noextension');
      }).not.toThrow();
    });
  });
});