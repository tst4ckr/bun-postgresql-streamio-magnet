/**
 * @fileoverview Tests unitarios para EnhancedLogger
 * Valida sistema de logging optimizado con lazy evaluation y structured logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedLogger } from '@/infrastructure/utils/EnhancedLogger.js';

describe('EnhancedLogger', () => {
  let logger;
  let mockConsole;
  let originalNodeEnv;

  beforeEach(() => {
    // Mock console
    mockConsole = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn()
    };

    // Store original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV;

    // Mock global console
    global.console = mockConsole;

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default parameters', () => {
      logger = new EnhancedLogger();

      expect(logger.getLogLevel()).toBe('info');
    });

    it('should initialize with custom log level', () => {
      logger = new EnhancedLogger('debug');

      expect(logger.getLogLevel()).toBe('debug');
    });

    it('should apply production configuration', () => {
      process.env.NODE_ENV = 'production';
      
      const productionConfig = {
        disableSourceTracking: true,
        minimalOutput: true,
        errorOnly: true,
        enableBatching: true,
        batchSize: 20,
        batchDelay: 200
      };

      logger = new EnhancedLogger('info', true, productionConfig);

      expect(logger).toBeInstanceOf(EnhancedLogger);
    });

    it('should use development settings in non-production', () => {
      process.env.NODE_ENV = 'development';

      logger = new EnhancedLogger('debug', true);

      expect(logger.getLogLevel()).toBe('debug');
    });
  });

  describe('Log Level Management', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('info');
    });

    it('should set and get log level', () => {
      logger.setLogLevel('debug');
      expect(logger.getLogLevel()).toBe('debug');

      logger.setLogLevel('error');
      expect(logger.getLogLevel()).toBe('error');
    });

    it('should respect log level hierarchy for info level', () => {
      logger.setLogLevel('info');

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message')
      );
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it('should respect log level hierarchy for error level', () => {
      logger.setLogLevel('error');

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message')
      );
      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it('should log all levels for debug level', () => {
      logger.setLogLevel('debug');

      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');

      expect(mockConsole.error).toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
      expect(mockConsole.debug).toHaveBeenCalled();
    });
  });

  describe('Basic Logging Methods', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should log info messages', () => {
      logger.info('Test info message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });

    it('should log warning messages', () => {
      logger.warn('Test warning message');

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Test warning message')
      );
    });

    it('should log error messages', () => {
      logger.error('Test error message');

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');

      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );
    });

    it('should handle function messages (lazy evaluation)', () => {
      const lazyMessage = vi.fn(() => 'Lazy evaluated message');

      logger.info(lazyMessage);

      expect(lazyMessage).toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Lazy evaluated message')
      );
    });

    it('should not evaluate function messages when log level prevents logging', () => {
      logger.setLogLevel('error');
      const lazyMessage = vi.fn(() => 'Should not be called');

      logger.info(lazyMessage);

      expect(lazyMessage).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
    });

    it('should handle additional arguments', () => {
      const testObject = { key: 'value' };
      const testArray = [1, 2, 3];

      logger.info('Message with args', testObject, testArray);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Message with args'),
        testObject,
        testArray
      );
    });
  });

  describe('Source Tracking', () => {
    it('should enable source tracking by default', () => {
      logger = new EnhancedLogger('debug', true);

      logger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      );
    });

    it('should disable source tracking when configured', () => {
      logger = new EnhancedLogger('debug', false);

      logger.setSourceTracking(false);
      logger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      );
    });

    it('should toggle source tracking', () => {
      logger = new EnhancedLogger('debug', true);

      logger.setSourceTracking(false);
      logger.info('Message without tracking');

      logger.setSourceTracking(true);
      logger.info('Message with tracking');

      expect(mockConsole.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('Child Logger', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should create child logger with prefix', () => {
      const childLogger = logger.createChild('TestComponent');

      childLogger.info('Child message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] Child message')
      );
    });

    it('should handle lazy evaluation in child logger', () => {
      const childLogger = logger.createChild('LazyComponent');
      const lazyMessage = vi.fn(() => 'Lazy child message');

      childLogger.info(lazyMessage);

      expect(lazyMessage).toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[LazyComponent] Lazy child message')
      );
    });

    it('should inherit log level from parent', () => {
      logger.setLogLevel('error');
      const childLogger = logger.createChild('ErrorComponent');

      childLogger.info('Should not log');
      childLogger.error('Should log');

      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorComponent] Should log')
      );
    });

    it('should support all log levels in child logger', () => {
      const childLogger = logger.createChild('AllLevels');

      childLogger.debug('Debug message');
      childLogger.info('Info message');
      childLogger.warn('Warning message');
      childLogger.error('Error message');

      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('[AllLevels] Debug message')
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[AllLevels] Info message')
      );
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('[AllLevels] Warning message')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[AllLevels] Error message')
      );
    });
  });

  describe('Structured Logging', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should log structured data in development', () => {
      process.env.NODE_ENV = 'development';
      
      const metadata = {
        userId: '12345',
        action: 'login',
        timestamp: '2023-01-01T00:00:00Z'
      };

      logger.structured('info', 'User action', metadata);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('User action')
      );
    });

    it('should log structured data in production as JSON', () => {
      process.env.NODE_ENV = 'production';
      logger = new EnhancedLogger('debug');
      
      const metadata = {
        userId: '12345',
        action: 'login'
      };

      logger.structured('info', 'User action', metadata);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"message":"User action"')
      );
    });

    it('should handle empty metadata', () => {
      logger.structured('info', 'Simple message');

      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should respect log levels in structured logging', () => {
      logger.setLogLevel('error');

      logger.structured('info', 'Should not log', { key: 'value' });
      logger.structured('error', 'Should log', { key: 'value' });

      expect(mockConsole.info).toHaveBeenCalledTimes(1); // Only error logged as info
    });
  });

  describe('Transaction Logging', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should log with transaction ID', () => {
      const transactionId = 'txn-12345';

      logger.withTransaction('info', transactionId, 'Transaction message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(`[TXN:${transactionId}] Transaction message`)
      );
    });

    it('should handle lazy evaluation with transaction ID', () => {
      const transactionId = 'txn-67890';
      const lazyMessage = vi.fn(() => 'Lazy transaction message');

      logger.withTransaction('info', transactionId, lazyMessage);

      expect(lazyMessage).toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(`[TXN:${transactionId}] Lazy transaction message`)
      );
    });

    it('should handle additional arguments with transaction', () => {
      const transactionId = 'txn-args';
      const extraData = { key: 'value' };

      logger.withTransaction('info', transactionId, 'Message with args', extraData);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(`[TXN:${transactionId}] Message with args`),
        extraData
      );
    });
  });

  describe('Universal Log Method', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should log with component option', () => {
      logger.log('info', 'Component message', { component: 'TestService' });

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestService] Component message')
      );
    });

    it('should log with structured data', () => {
      const data = { userId: '123', action: 'test' };

      logger.log('info', 'Structured message', { data });

      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should log with transaction ID', () => {
      logger.log('info', 'Transaction message', { transactionId: 'txn-123' });

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TXN:txn-123] Transaction message')
      );
    });

    it('should combine component and data', () => {
      const data = { key: 'value' };

      logger.log('info', 'Combined message', { 
        component: 'TestComponent', 
        data 
      });

      expect(mockConsole.info).toHaveBeenCalled();
    });

    it('should handle empty options', () => {
      logger.log('info', 'Simple message');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Simple message')
      );
    });
  });

  describe('Specialized Logging Methods', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should log operation completion', () => {
      const metrics = { duration: 150, itemsProcessed: 10 };

      logger.operationComplete('dataProcessing', 150, metrics);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('dataProcessing completada')
      );
    });

    it('should log validation failures', () => {
      const context = { field: 'email', value: 'invalid-email' };

      logger.validationFailed('User', 'Invalid email format', context);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Validación fallida para User')
      );
    });

    it('should log resource not found', () => {
      const context = { searchCriteria: 'id=123' };

      logger.resourceNotFound('Movie', 'tt1234567', context);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Movie no encontrado')
      );
    });

    it('should log configuration applied', () => {
      logger.configurationApplied('torService', { enabled: true, port: 9050 });

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Configuración torService aplicada')
      );
    });

    it('should log search results', () => {
      const details = { source: 'API', cached: false };

      logger.searchResults('magnet', 'tt1234567', 5, details);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Búsqueda magnet')
      );
    });

    it('should log resource discarded', () => {
      const details = { quality: 'low', seeders: 0 };

      logger.resourceDiscarded('Magnet', 'No seeders available', details);

      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Magnet descartado')
      );
    });

    it('should log processing errors', () => {
      const error = new Error('Processing failed');
      const context = { step: 'validation', input: 'data' };

      logger.processingError('dataValidation', error, context);

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error en operación dataValidation')
      );
    });

    it('should log selection made', () => {
      const criteria = { quality: '1080p', seeders: 100 };

      logger.selectionMade('magnet', 'Best quality option', criteria);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Selección magnet realizada')
      );
    });

    it('should log non-optimal conditions', () => {
      const details = { currentValue: 5, optimalValue: 50 };

      logger.nonOptimalCondition('Low seeders', 'Slower download', details);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Condición no óptima detectada')
      );
    });

    it('should log resource changes', () => {
      const details = { from: 'inactive', to: 'active' };

      logger.resourceChanged('TorService', 'status_change', details);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Cambio en recurso TorService')
      );
    });

    it('should log configuration status', () => {
      const details = { errors: ['Missing API key'] };

      logger.configurationStatus('apiConfig', false, details);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Estado de configuración apiConfig')
      );
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should track log counts', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      logger.debug('Debug message');

      const metrics = logger.getPerformanceMetrics();

      expect(metrics.logCounts.info).toBe(1);
      expect(metrics.logCounts.warn).toBe(1);
      expect(metrics.logCounts.error).toBe(1);
      expect(metrics.logCounts.debug).toBe(1);
      expect(metrics.totalLogs).toBe(4);
    });

    it('should track performance over time', () => {
      const initialMetrics = logger.getPerformanceMetrics();
      
      logger.info('Test message 1');
      logger.info('Test message 2');

      const updatedMetrics = logger.getPerformanceMetrics();

      expect(updatedMetrics.totalLogs).toBe(initialMetrics.totalLogs + 2);
      expect(updatedMetrics.startTime).toBe(initialMetrics.startTime);
    });

    it('should reset performance metrics', () => {
      logger.info('Message before reset');
      
      logger.resetPerformanceMetrics();
      
      const metrics = logger.getPerformanceMetrics();

      expect(metrics.totalLogs).toBe(0);
      expect(metrics.logCounts.info).toBe(0);
    });

    it('should include timing information in metrics', () => {
      const metrics = logger.getPerformanceMetrics();

      expect(metrics).toHaveProperty('startTime');
      expect(metrics).toHaveProperty('lastReset');
      expect(typeof metrics.startTime).toBe('number');
      expect(typeof metrics.lastReset).toBe('number');
    });
  });

  describe('Batching (Production Mode)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      
      const productionConfig = {
        enableBatching: true,
        batchSize: 3,
        batchDelay: 50
      };

      logger = new EnhancedLogger('debug', true, productionConfig);
    });

    it('should process errors immediately even with batching enabled', () => {
      logger.error('Critical error');

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Critical error')
      );
    });

    it('should batch non-error logs', async () => {
      logger.info('Message 1');
      logger.info('Message 2');

      // Should not log immediately
      expect(mockConsole.info).not.toHaveBeenCalled();

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockConsole.info).toHaveBeenCalledTimes(2);
    });

    it('should flush batch when size limit reached', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3'); // Should trigger batch flush

      expect(mockConsole.info).toHaveBeenCalledTimes(3);
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should flush pending logs', () => {
      logger.flush();

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should destroy logger and clean up resources', () => {
      logger.destroy();

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should handle multiple destroy calls', () => {
      logger.destroy();
      logger.destroy();

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should handle console method not available', () => {
      // Remove debug method to test fallback
      delete mockConsole.debug;

      logger.debug('Debug message');

      // Should fallback to info method
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should handle function message errors gracefully', () => {
      const errorMessage = vi.fn(() => {
        throw new Error('Message function error');
      });

      // Should not throw, but handle gracefully
      expect(() => logger.info(errorMessage)).not.toThrow();
    });

    it('should handle invalid log levels', () => {
      logger.setLogLevel('invalid');

      // Should still function
      logger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      logger = new EnhancedLogger('debug');
    });

    it('should handle null and undefined messages', () => {
      logger.info(null);
      logger.info(undefined);

      expect(mockConsole.info).toHaveBeenCalledTimes(2);
    });

    it('should handle empty string messages', () => {
      logger.info('');

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.any(String)
      );
    });

    it('should handle circular references in arguments', () => {
      const circular = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => logger.info('Circular test', circular)).not.toThrow();
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);

      logger.info(longMessage);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('x'.repeat(100)) // At least part of the message
      );
    });

    it('should handle concurrent logging', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => 
        Promise.resolve().then(() => logger.info(`Message ${i}`))
      );

      await Promise.all(promises);

      expect(mockConsole.info).toHaveBeenCalledTimes(100);
    });
  });
});