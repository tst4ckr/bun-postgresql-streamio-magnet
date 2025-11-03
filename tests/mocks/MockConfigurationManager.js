/**
 * @fileoverview Mock del ConfigurationManager para testing
 * Implementa la interfaz del ConfigurationManager
 */

import { vi } from 'vitest';

/**
 * Mock del ConfigurationManager
 */
class MockConfigurationManager {
  constructor(initialConfig = {}) {
    this._config = {
      server: {
        port: 7000,
        host: '0.0.0.0',
        timeout: 30000
      },
      cache: {
        stream: { ttl: 3600, maxSize: 1000 },
        anime: { ttl: 7200, maxSize: 500 },
        metadata: { ttl: 86400, maxSize: 2000 }
      },
      logging: {
        level: 'info',
        format: 'json',
        file: false
      },
      torrentio: {
        movies: {
          providers: 'yts,eztv,rarbg',
          sort: 'qualitysize',
          qualityFilter: '480p,720p,1080p',
          limit: 5
        },
        series: {
          providers: 'eztv,rarbg',
          sort: 'qualitysize',
          qualityFilter: '480p,720p,1080p',
          limit: 5
        }
      },
      database: {
        url: 'postgresql://test:test@localhost:5432/streamio_test',
        pool: { min: 2, max: 10 }
      },
      tor: {
        enabled: false,
        proxy: {
          host: '127.0.0.1',
          port: 9050
        }
      },
      ...initialConfig
    };
    
    // Mocks de métodos
    this.get = vi.fn();
    this.set = vi.fn();
    this.has = vi.fn();
    this.getAll = vi.fn();
    this.reload = vi.fn();
    this.validate = vi.fn();
    this.getEnvironment = vi.fn();
    this.isDevelopment = vi.fn();
    this.isProduction = vi.fn();
    this.isTest = vi.fn();
    
    // Configurar comportamiento por defecto
    this._setupDefaultBehavior();
  }
  
  /**
   * Configura el comportamiento por defecto de los mocks
   * @private
   */
  _setupDefaultBehavior() {
    this.get.mockImplementation((path, defaultValue) => {
      return this._getNestedValue(this._config, path) ?? defaultValue;
    });
    
    this.set.mockImplementation((path, value) => {
      this._setNestedValue(this._config, path, value);
      return this;
    });
    
    this.has.mockImplementation((path) => {
      return this._getNestedValue(this._config, path) !== undefined;
    });
    
    this.getAll.mockImplementation(() => {
      return { ...this._config };
    });
    
    this.reload.mockResolvedValue(this._config);
    this.validate.mockReturnValue({ valid: true, errors: [] });
    this.getEnvironment.mockReturnValue('test');
    this.isDevelopment.mockReturnValue(false);
    this.isProduction.mockReturnValue(false);
    this.isTest.mockReturnValue(true);
  }
  
  /**
   * Obtiene un valor anidado usando notación de punto
   * @param {Object} obj - Objeto fuente
   * @param {string} path - Ruta con notación de punto
   * @returns {*} Valor encontrado
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
  
  /**
   * Establece un valor anidado usando notación de punto
   * @param {Object} obj - Objeto destino
   * @param {string} path - Ruta con notación de punto
   * @param {*} value - Valor a establecer
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }
  
  /**
   * Actualiza la configuración completa
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    this._config = { ...this._config, ...newConfig };
  }
  
  /**
   * Simula un error en la validación
   * @param {Array} errors - Errores a simular
   */
  simulateValidationError(errors = ['Invalid configuration']) {
    this.validate.mockReturnValue({
      valid: false,
      errors
    });
  }
  
  /**
   * Simula un error en la recarga de configuración
   * @param {Error} error - Error a simular
   */
  simulateReloadError(error = new Error('Failed to reload configuration')) {
    this.reload.mockRejectedValue(error);
  }
  
  /**
   * Restaura el comportamiento normal
   */
  restore() {
    vi.clearAllMocks();
    this._setupDefaultBehavior();
  }
  
  /**
   * Limpia todos los mocks
   */
  clearMocks() {
    vi.clearAllMocks();
  }
  
  /**
   * Crea una instancia del mock con configuración específica
   * @param {Object} config - Configuración inicial
   * @returns {MockConfigurationManager} Instancia configurada
   */
  static create(config = {}) {
    return new MockConfigurationManager(config);
  }
  
  /**
   * Crea un mock para entorno de desarrollo
   * @returns {MockConfigurationManager} Mock configurado para desarrollo
   */
  static createForDevelopment() {
    const mock = new MockConfigurationManager({
      logging: { level: 'debug' },
      cache: { stream: { ttl: 300 } }
    });
    
    mock.getEnvironment.mockReturnValue('development');
    mock.isDevelopment.mockReturnValue(true);
    mock.isProduction.mockReturnValue(false);
    mock.isTest.mockReturnValue(false);
    
    return mock;
  }
  
  /**
   * Crea un mock para entorno de producción
   * @returns {MockConfigurationManager} Mock configurado para producción
   */
  static createForProduction() {
    const mock = new MockConfigurationManager({
      logging: { level: 'warn' },
      cache: { stream: { ttl: 7200 } }
    });
    
    mock.getEnvironment.mockReturnValue('production');
    mock.isDevelopment.mockReturnValue(false);
    mock.isProduction.mockReturnValue(true);
    mock.isTest.mockReturnValue(false);
    
    return mock;
  }
}

export default MockConfigurationManager;