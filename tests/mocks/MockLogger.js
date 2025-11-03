/**
 * @fileoverview Mock del Logger para testing
 * Implementa la interfaz del OptimizedLoggerService
 */

import { vi } from 'vitest';

/**
 * Mock del Logger siguiendo la interfaz del OptimizedLoggerService
 */
class MockLogger {
  constructor() {
    this.info = vi.fn();
    this.error = vi.fn();
    this.warn = vi.fn();
    this.debug = vi.fn();
    this.log = vi.fn();
    this.trace = vi.fn();
    
    // Métodos específicos del OptimizedLoggerService
    this.logStreamRequest = vi.fn();
    this.logStreamResponse = vi.fn();
    this.logError = vi.fn();
    this.logPerformance = vi.fn();
    
    // Estado interno para verificaciones
    this._logs = [];
    this._errors = [];
    this._warnings = [];
    
    // Configurar comportamiento por defecto
    this._setupDefaultBehavior();
  }
  
  /**
   * Configura el comportamiento por defecto de los mocks
   * @private
   */
  _setupDefaultBehavior() {
    // Capturar logs para verificación posterior
    this.info.mockImplementation((message, meta) => {
      this._logs.push({ level: 'info', message, meta, timestamp: new Date() });
    });
    
    this.error.mockImplementation((message, meta) => {
      this._errors.push({ level: 'error', message, meta, timestamp: new Date() });
    });
    
    this.warn.mockImplementation((message, meta) => {
      this._warnings.push({ level: 'warn', message, meta, timestamp: new Date() });
    });
    
    this.debug.mockImplementation((message, meta) => {
      this._logs.push({ level: 'debug', message, meta, timestamp: new Date() });
    });
  }
  
  /**
   * Obtiene todos los logs capturados
   * @returns {Array} Array de logs
   */
  getLogs() {
    return [...this._logs];
  }
  
  /**
   * Obtiene todos los errores capturados
   * @returns {Array} Array de errores
   */
  getErrors() {
    return [...this._errors];
  }
  
  /**
   * Obtiene todas las advertencias capturadas
   * @returns {Array} Array de advertencias
   */
  getWarnings() {
    return [...this._warnings];
  }
  
  /**
   * Verifica si se logueó un mensaje específico
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje a buscar
   * @returns {boolean} True si se encontró el mensaje
   */
  hasLoggedMessage(level, message) {
    const logs = level === 'error' ? this._errors : 
                 level === 'warn' ? this._warnings : this._logs;
    
    return logs.some(log => 
      log.level === level && 
      (typeof log.message === 'string' ? log.message.includes(message) : false)
    );
  }
  
  /**
   * Verifica si se logueó un error con código específico
   * @param {string} errorCode - Código de error a buscar
   * @returns {boolean} True si se encontró el error
   */
  hasLoggedError(errorCode) {
    return this._errors.some(error => 
      error.meta && error.meta.code === errorCode
    );
  }
  
  /**
   * Limpia todos los logs capturados
   */
  clearLogs() {
    this._logs = [];
    this._errors = [];
    this._warnings = [];
    
    // Limpiar mocks
    vi.clearAllMocks();
  }
  
  /**
   * Configura el logger para simular errores
   * @param {Error} error - Error a simular
   */
  simulateError(error) {
    this.error.mockImplementation(() => {
      throw error;
    });
  }
  
  /**
   * Restaura el comportamiento normal del logger
   */
  restore() {
    this.clearLogs();
    this._setupDefaultBehavior();
  }
  
  /**
   * Crea una instancia del mock con configuración específica
   * @param {Object} config - Configuración del mock
   * @returns {MockLogger} Instancia configurada
   */
  static create(config = {}) {
    const mock = new MockLogger();
    
    if (config.silent) {
      // Silenciar todos los logs
      Object.keys(mock).forEach(key => {
        if (typeof mock[key] === 'function' && key.startsWith('log') || 
            ['info', 'error', 'warn', 'debug', 'trace'].includes(key)) {
          mock[key].mockImplementation(() => {});
        }
      });
    }
    
    if (config.throwOnError) {
      mock.error.mockImplementation((message, meta) => {
        throw new Error(`Logger Error: ${message}`);
      });
    }
    
    return mock;
  }
}

export default MockLogger;