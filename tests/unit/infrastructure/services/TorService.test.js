/**
 * @fileoverview Tests unitarios para TorService
 * Valida configuración Tor, proxy, rotación de sesiones y operaciones de red
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'net';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { TorService } from '../../../../src/infrastructure/services/TorService.js';

// Mock dependencies
vi.mock('net');
vi.mock('socks-proxy-agent');
vi.mock('@/config/constants.js', () => ({
  CONSTANTS: {
    NETWORK: {
      TOR_DEFAULT_HOST: '127.0.0.1',
      TOR_DEFAULT_PORT: 9050,
      TOR_CONTROL_DEFAULT_HOST: '127.0.0.1',
      TOR_CONTROL_DEFAULT_PORT: 9051,
      MAX_RETRIES: 3,
      TOR_CHECK_TIMEOUT: 5000,
      FIREFOX_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
    },
    TIME: {
      TOR_RETRY_DELAY: 2000,
      DEFAULT_TIMEOUT: 30000
    }
  }
}));

describe('TorService', () => {
  let torService;
  let mockLogger;
  let mockSocket;
  let mockAgent;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock socket
    mockSocket = {
      connect: vi.fn(),
      destroy: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
      end: vi.fn()
    };

    // Mock SocksProxyAgent
    mockAgent = {};
    SocksProxyAgent.mockImplementation(() => mockAgent);

    // Mock net.Socket
    net.Socket.mockImplementation(() => mockSocket);
    net.createConnection.mockImplementation(() => mockSocket);

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
    global.setInterval = vi.fn((fn, delay) => {
      return { id: 'interval-id' };
    });
    global.clearInterval = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (torService) {
      torService.destroy();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      torService = new TorService({}, mockLogger);

      expect(torService.isEnabled()).toBe(true);
      expect(torService.getConfig()).toEqual({
        enabled: true,
        host: '127.0.0.1',
        port: 9050,
        controlHost: '127.0.0.1',
        controlPort: 9051,
        maxRetries: 3,
        retryDelay: 2000,
        timeout: 30000
      });
    });

    it('should initialize with custom configuration', () => {
      const config = {
        enabled: false,
        host: '192.168.1.100',
        port: 9150,
        controlHost: '192.168.1.100',
        controlPort: 9151,
        maxRetries: 5,
        retryDelay: 3000,
        timeout: 60000
      };

      torService = new TorService(config, mockLogger);

      expect(torService.isEnabled()).toBe(false);
      expect(torService.getConfig()).toEqual(config);
    });

    it('should create SocksProxyAgent when enabled', () => {
      torService = new TorService({ enabled: true }, mockLogger);

      expect(SocksProxyAgent).toHaveBeenCalledWith('socks5h://127.0.0.1:9050');
      expect(torService.getAgent()).toBe(mockAgent);
    });

    it('should not create SocksProxyAgent when disabled', () => {
      torService = new TorService({ enabled: false }, mockLogger);

      expect(SocksProxyAgent).not.toHaveBeenCalled();
      expect(torService.getAgent()).toBe(null);
    });

    it('should start auto rotation when enabled', () => {
      torService = new TorService({ enabled: true }, mockLogger);

      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        300000 // 5 minutes
      );
    });

    it('should not start auto rotation when disabled', () => {
      torService = new TorService({ enabled: false }, mockLogger);

      expect(global.setInterval).not.toHaveBeenCalled();
    });
  });

  describe('Tor Availability Check', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    describe('isAvailable()', () => {
      it('should return false when Tor is disabled', async () => {
        torService = new TorService({ enabled: false }, mockLogger);

        const result = await torService.isAvailable();

        expect(result).toBe(false);
      });

      it('should return true when Tor connection succeeds', async () => {
        // Mock successful connection
        mockSocket.connect.mockImplementation((port, host, callback) => {
          callback();
        });

        const result = await torService.isAvailable();

        expect(result).toBe(true);
        expect(mockSocket.connect).toHaveBeenCalledWith(9050, '127.0.0.1', expect.any(Function));
        expect(mockSocket.destroy).toHaveBeenCalled();
      });

      it('should return false when Tor connection fails', async () => {
        // Mock connection error
        mockSocket.on.mockImplementation((event, callback) => {
          if (event === 'error') {
            callback(new Error('Connection refused'));
          }
        });

        const result = await torService.isAvailable();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Error al conectar con Tor')
        );
      });

      it('should return false on connection timeout', async () => {
        // Mock timeout
        global.setTimeout.mockImplementation((callback, delay) => {
          callback();
          return { id: 'timeout-id' };
        });

        const result = await torService.isAvailable();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Timeout al verificar Tor - considerando no disponible'
        );
      });
    });
  });

  describe('HTTP Requests through Tor', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    describe('fetch()', () => {
      it('should throw error when Tor is disabled', async () => {
        torService = new TorService({ enabled: false }, mockLogger);

        await expect(torService.fetch('https://example.com')).rejects.toThrow(
          'Tor no está habilitado'
        );
      });

      it('should throw error when Tor is not available', async () => {
        // Mock Tor as unavailable
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(false);

        await expect(torService.fetch('https://example.com')).rejects.toThrow(
          'Tor no está disponible'
        );
      });

      it('should make successful request through Tor', async () => {
        // Mock Tor as available
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);

        // Mock successful fetch response
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ data: 'test' })
        };
        global.fetch.mockResolvedValue(mockResponse);

        const result = await torService.fetch('https://example.com');

        expect(result).toBe(mockResponse);
        expect(global.fetch).toHaveBeenCalledWith('https://example.com', {
          agent: mockAgent,
          signal: expect.any(Object),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0',
            'Accept': 'application/json'
          }
        });
      });

      it('should handle 502 error with session rotation', async () => {
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(torService, 'rotateSession').mockResolvedValue();

        // Mock 502 response first, then success
        const mock502Response = { ok: false, status: 502 };
        const mockSuccessResponse = { ok: true, status: 200 };

        global.fetch
          .mockResolvedValueOnce(mock502Response)
          .mockResolvedValueOnce(mockSuccessResponse);

        const result = await torService.fetch('https://example.com');

        expect(result).toBe(mockSuccessResponse);
        expect(torService.rotateSession).toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Error 502 detectado, rotando sesión Tor')
        );
      });

      it('should handle connection timeout with retry', async () => {
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(torService, 'rotateSession').mockResolvedValue();

        // Mock timeout error first, then success
        const timeoutError = new Error('Timeout de 30000ms excedido');
        timeoutError.name = 'AbortError';
        const mockSuccessResponse = { ok: true, status: 200 };

        global.fetch
          .mockRejectedValueOnce(timeoutError)
          .mockResolvedValueOnce(mockSuccessResponse);

        const result = await torService.fetch('https://example.com');

        expect(result).toBe(mockSuccessResponse);
        expect(torService.rotateSession).toHaveBeenCalled();
      });

      it('should handle ECONNREFUSED error', async () => {
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);

        const connRefusedError = new Error('Connection refused');
        connRefusedError.code = 'ECONNREFUSED';

        global.fetch.mockRejectedValue(connRefusedError);

        await expect(torService.fetch('https://example.com')).rejects.toThrow(
          'Tor no está ejecutándose en 127.0.0.1:9050'
        );
      });

      it('should exhaust retries and throw error', async () => {
        vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);
        vi.spyOn(torService, 'rotateSession').mockResolvedValue();

        const timeoutError = new Error('Timeout');
        timeoutError.code = 'ETIMEDOUT';

        global.fetch.mockRejectedValue(timeoutError);

        await expect(torService.fetch('https://example.com')).rejects.toThrow('Timeout');
        expect(torService.rotateSession).toHaveBeenCalledTimes(3); // maxRetries
      });
    });
  });

  describe('Session Rotation', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    describe('rotateSession()', () => {
      it('should rotate session successfully', async () => {
        // Mock successful control connection
        mockSocket.write.mockImplementation(() => {});
        mockSocket.on.mockImplementation((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('250 OK\r\n'));
          } else if (event === 'end') {
            callback();
          }
        });

        await torService.rotateSession();

        expect(net.createConnection).toHaveBeenCalledWith({
          port: 9051,
          host: '127.0.0.1'
        }, expect.any(Function));
        expect(mockSocket.write).toHaveBeenCalledWith('AUTHENTICATE ""\r\n');
        expect(mockSocket.write).toHaveBeenCalledWith('SIGNAL NEWNYM\r\n');
        expect(mockSocket.write).toHaveBeenCalledWith('QUIT\r\n');
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Sesión Tor rotada exitosamente - nueva IP obtenida'
        );
      });

      it('should handle rotation error gracefully', async () => {
        // Mock connection error
        mockSocket.on.mockImplementation((event, callback) => {
          if (event === 'error') {
            callback(new Error('Control connection failed'));
          }
        });

        await torService.rotateSession();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('No se pudo rotar sesión Tor')
        );
      });

      it('should skip rotation when control port not configured', async () => {
        torService = new TorService({
          enabled: true,
          controlPort: null
        }, mockLogger);

        await torService.rotateSession();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Control de Tor no configurado correctamente - saltando rotación'
        );
        expect(net.createConnection).not.toHaveBeenCalled();
      });
    });

    describe('Auto Rotation', () => {
      it('should start auto rotation when enabled', () => {
        torService = new TorService({ enabled: true }, mockLogger);

        expect(global.setInterval).toHaveBeenCalledWith(
          expect.any(Function),
          300000
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Rotación automática de circuitos Tor iniciada (cada 5 minutos)',
          expect.any(Object)
        );
      });

      it('should not start auto rotation when disabled', () => {
        torService = new TorService({ enabled: false }, mockLogger);

        expect(global.setInterval).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Tor no está habilitado, omitiendo rotación automática',
          expect.any(Object)
        );
      });

      it('should stop auto rotation', () => {
        torService = new TorService({ enabled: true }, mockLogger);
        
        torService.stopAutoRotation();

        expect(global.clearInterval).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Rotación automática de circuitos Tor detenida'
        );
      });

      it('should handle auto rotation errors', async () => {
        // Get the auto rotation function
        let autoRotationFn;
        global.setInterval.mockImplementation((fn, delay) => {
          autoRotationFn = fn;
          return { id: 'interval-id' };
        });

        torService = new TorService({ enabled: true }, mockLogger);

        // Mock rotation error
        vi.spyOn(torService, 'rotateSession').mockRejectedValue(
          new Error('Rotation failed')
        );

        // Execute auto rotation
        await autoRotationFn();

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error en rotación automática de Tor:',
          expect.any(Error),
          expect.any(Object)
        );
      });
    });
  });

  describe('Configuration and State', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    describe('getAgent()', () => {
      it('should return SOCKS agent when enabled', () => {
        expect(torService.getAgent()).toBe(mockAgent);
      });

      it('should return null when disabled', () => {
        torService = new TorService({ enabled: false }, mockLogger);
        expect(torService.getAgent()).toBe(null);
      });
    });

    describe('isEnabled()', () => {
      it('should return true when enabled', () => {
        expect(torService.isEnabled()).toBe(true);
      });

      it('should return false when disabled', () => {
        torService = new TorService({ enabled: false }, mockLogger);
        expect(torService.isEnabled()).toBe(false);
      });
    });

    describe('getConfig()', () => {
      it('should return current configuration', () => {
        const config = torService.getConfig();

        expect(config).toEqual({
          enabled: true,
          host: '127.0.0.1',
          port: 9050,
          controlHost: '127.0.0.1',
          controlPort: 9051,
          maxRetries: 3,
          retryDelay: 2000,
          timeout: 30000
        });
      });
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    describe('destroy()', () => {
      it('should clean up resources properly', () => {
        torService.destroy();

        expect(global.clearInterval).toHaveBeenCalled();
        expect(torService.getAgent()).toBe(null);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'TorService destruido y recursos liberados'
        );
      });

      it('should handle multiple destroy calls', () => {
        torService.destroy();
        torService.destroy();

        // Should not throw error
        expect(mockLogger.info).toHaveBeenCalledWith(
          'TorService destruido y recursos liberados'
        );
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    it('should handle malformed URLs gracefully', async () => {
      vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);

      const malformedError = new Error('Invalid URL');
      global.fetch.mockRejectedValue(malformedError);

      await expect(torService.fetch('invalid-url')).rejects.toThrow('Invalid URL');
    });

    it('should handle network interruptions', async () => {
      vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);
      vi.spyOn(torService, 'rotateSession').mockResolvedValue();

      const networkError = new Error('Network error');
      networkError.code = 'ETIMEDOUT';

      global.fetch.mockRejectedValue(networkError);

      await expect(torService.fetch('https://example.com')).rejects.toThrow('Network error');
      expect(torService.rotateSession).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent requests properly', async () => {
      vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);

      const mockResponse = { ok: true, status: 200 };
      global.fetch.mockResolvedValue(mockResponse);

      const promises = [
        torService.fetch('https://example1.com'),
        torService.fetch('https://example2.com'),
        torService.fetch('https://example3.com')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBe(mockResponse);
      });
    });
  });

  describe('Performance and Monitoring', () => {
    beforeEach(() => {
      torService = new TorService({ enabled: true }, mockLogger);
    });

    it('should log performance metrics', async () => {
      vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);

      const mockResponse = { ok: true, status: 200 };
      global.fetch.mockResolvedValue(mockResponse);

      await torService.fetch('https://example.com');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Intento 1/3 - Consultando vía Tor'),
        expect.any(String)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Respuesta exitosa vía Tor (200) en intento 1'),
        expect.any(Object)
      );
    });

    it('should track retry attempts', async () => {
      vi.spyOn(torService, 'isAvailable').mockResolvedValue(true);
      vi.spyOn(torService, 'rotateSession').mockResolvedValue();

      const timeoutError = new Error('Timeout');
      timeoutError.code = 'ETIMEDOUT';
      const successResponse = { ok: true, status: 200 };

      global.fetch
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(successResponse);

      await torService.fetch('https://example.com');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error de conexión, rotando sesión Tor e intentando nuevamente (1/3)'),
        expect.any(Object)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error de conexión, rotando sesión Tor e intentando nuevamente (2/3)'),
        expect.any(Object)
      );
    });
  });
});