/**
 * @fileoverview Enhanced Logger Service para el addon de TV
 * Servicio principal que orquesta el logging usando herramientas auxiliares
 * 
 * Flujo de datos:
 * 1. Recibe configuración y la valida usando tools
 * 2. Procesa mensajes de log usando formatters de tools
 * 3. Valida niveles de log usando validators de tools
 * 4. Delega operaciones auxiliares a EnhancedLoggerService_tools
 * 
 * Arquitectura:
 * - Lógica principal: validación de servicios y orquestación
 * - Herramientas: funciones puras en _tools.js
 * - Dependency Injection: inyección de herramientas para testing
 */

import {
  LOG_LEVELS,
  DEFAULT_CONFIG,
  extractSourceInfo,
  formatLogMessage,
  isLogLevelEnabled,
  validateLoggerConfig,
  createPerformanceMessage,
  createRequestMessage,
  mergeLoggerConfig,
  createContextualLogFunction
} from './EnhancedLoggerService_tools.js';

/**
 * Servicio de logging mejorado que incluye información del archivo fuente y número de línea
 * Aplica principio de responsabilidad única para el manejo centralizado de logs
 */
export class EnhancedLoggerService {
  #config;
  #logLevel;
  #enableRequestLogging;
  #enablePerformanceMetrics;
  #logFilePath;
  #tools;
  #stats;

  /**
   * Constructor con dependency injection para herramientas
   * @param {Object} config - Configuración del logger
   * @param {string} config.logLevel - Nivel de logging (debug, info, warn, error)
   * @param {boolean} config.enableRequestLogging - Habilitar logging de requests
   * @param {boolean} config.enablePerformanceMetrics - Habilitar métricas de rendimiento
   * @param {string} config.logFilePath - Ruta del archivo de logs
   * @param {Object} tools - Herramientas inyectadas (para testing)
   */
  constructor(config = {}, tools = null) {
    // Inyección de dependencias para testing
    this.#tools = tools || {
      extractSourceInfo,
      formatLogMessage,
      isLogLevelEnabled,
      validateLoggerConfig,
      createPerformanceMessage,
      createRequestMessage,
      mergeLoggerConfig,
      createContextualLogFunction,
      LOG_LEVELS,
      DEFAULT_CONFIG
    };
    
    // Validación de configuración usando herramientas
    this.#config = this.#tools.validateLoggerConfig(config);
    this.#logLevel = this.#config.logLevel;
    this.#enableRequestLogging = this.#config.enableRequestLogging;
    this.#enablePerformanceMetrics = this.#config.enablePerformanceMetrics;
    this.#logFilePath = this.#config.logFilePath;
    
    // Estadísticas de logging
    this.#stats = {
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      debugCount: 0
    };
  }

  /**
   * LÓGICA DE NEGOCIO: Procesa y registra un mensaje de log
   * @private
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  #processLogMessage(level, message, ...args) {
    // Verificar si el nivel está habilitado
    if (!this.#tools.isLogLevelEnabled(level, this.#logLevel)) {
      return;
    }

    try {
      // Obtener información del stack trace
      const stack = new Error().stack;
      const sourceInfo = this.#tools.extractSourceInfo(stack);
      
      // Formatear el mensaje completo
      const formattedMessage = this.#tools.formatLogMessage(level, message, sourceInfo);
      
      // Registrar en consola
      this.#writeToConsole(level, formattedMessage, ...args);
      
      // Actualizar estadísticas
      this.#updateStats(level);
      
    } catch (error) {
      console.error('Error en EnhancedLoggerService:', error.message);
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Escribe mensaje en consola según el nivel
   * @private
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje formateado
   * @param {...any} args - Argumentos adicionales
   */
  #writeToConsole(level, message, ...args) {
    switch (level) {
      case 'error':
        console.error(message, ...args);
        break;
      case 'warn':
        console.warn(message, ...args);
        break;
      case 'debug':
        console.debug(message, ...args);
        break;
      default:
        console.log(message, ...args);
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Actualiza estadísticas de logging
   * @private
   * @param {string} level - Nivel del log
   */
  #updateStats(level) {
    this.#stats.totalLogs++;
    
    switch (level) {
      case 'error':
        this.#stats.errorCount++;
        break;
      case 'warn':
        this.#stats.warnCount++;
        break;
      case 'info':
        this.#stats.infoCount++;
        break;
      case 'debug':
        this.#stats.debugCount++;
        break;
    }
  }

  /**
   * Registra un mensaje de información
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    this.#processLogMessage('info', message, ...args);
  }

  /**
   * Registra un mensaje de advertencia
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  warn(message, ...args) {
    this.#processLogMessage('warn', message, ...args);
  }

  /**
   * Registra un mensaje de error
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  error(message, ...args) {
    this.#processLogMessage('error', message, ...args);
  }

  /**
   * Registra un mensaje de debug
   * @param {string} message - Mensaje a registrar
   * @param {...any} args - Argumentos adicionales
   */
  debug(message, ...args) {
    this.#processLogMessage('debug', message, ...args);
  }

  /**
   * LÓGICA DE NEGOCIO: Registra métricas de rendimiento
   * @param {string} operation - Nombre de la operación
   * @param {number} duration - Duración en milisegundos
   * @param {Object} metadata - Metadatos adicionales
   */
  performance(operation, duration, metadata = {}) {
    if (this.#enablePerformanceMetrics) {
      const message = this.#tools.createPerformanceMessage(operation, duration);
      this.info(message, metadata);
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Registra información de requests HTTP
   * @param {string} method - Método HTTP
   * @param {string} url - URL del request
   * @param {number} statusCode - Código de estado
   * @param {number} duration - Duración en milisegundos
   */
  request(method, url, statusCode, duration) {
    if (this.#enableRequestLogging) {
      const message = this.#tools.createRequestMessage(method, url, statusCode, duration);
      this.info(message);
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Crea un logger hijo con contexto específico
   * @param {string} context - Contexto del logger hijo
   * @returns {Object} Logger hijo con métodos contextualizados
   */
  createChildLogger(context) {
    if (!context || typeof context !== 'string') {
      throw new Error('El contexto del logger hijo debe ser un string válido');
    }
    
    try {
      return {
        info: this.#tools.createContextualLogFunction(context, this.info.bind(this)),
        warn: this.#tools.createContextualLogFunction(context, this.warn.bind(this)),
        error: this.#tools.createContextualLogFunction(context, this.error.bind(this)),
        debug: this.#tools.createContextualLogFunction(context, this.debug.bind(this)),
        performance: (operation, duration, metadata) => 
          this.performance(`[${context}] ${operation}`, duration, metadata),
        request: (method, url, statusCode, duration) => 
          this.request(method, url, statusCode, duration)
      };
    } catch (error) {
      console.error('Error creando logger hijo:', error.message);
      return this;
    }
  }

  /**
   * Obtiene la configuración actual del logger
   * @returns {Object} Configuración del logger
   */
  getConfig() {
    return {
      logLevel: this.#logLevel,
      enableRequestLogging: this.#enableRequestLogging,
      enablePerformanceMetrics: this.#enablePerformanceMetrics,
      logFilePath: this.#logFilePath
    };
  }

  /**
   * Obtiene las estadísticas de logging
   * @returns {Object} Estadísticas del logger
   */
  getStats() {
    return { ...this.#stats };
  }

  /**
   * LÓGICA DE NEGOCIO: Actualiza la configuración del logger
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    try {
      const updatedConfig = this.#tools.mergeLoggerConfig(this.#config, newConfig);
      this.#config = updatedConfig;
      this.#logLevel = updatedConfig.logLevel;
      this.#enableRequestLogging = updatedConfig.enableRequestLogging;
      this.#enablePerformanceMetrics = updatedConfig.enablePerformanceMetrics;
      this.#logFilePath = updatedConfig.logFilePath;
    } catch (error) {
      console.error('Error actualizando configuración del logger:', error.message);
    }
  }
}

/**
 * Factory para crear instancias del logger mejorado
 */
export class EnhancedLoggerFactory {
  static #instance = null;

  /**
   * Crea o retorna la instancia singleton del logger
   * @param {Object} config - Configuración del logger
   * @returns {EnhancedLoggerService} Instancia del logger
   */
  static getInstance(config = {}) {
    if (!EnhancedLoggerFactory.#instance) {
      EnhancedLoggerFactory.#instance = new EnhancedLoggerService(config);
    }
    return EnhancedLoggerFactory.#instance;
  }

  /**
   * Reinicia la instancia del logger con nueva configuración
   * @param {Object} config - Nueva configuración
   * @returns {EnhancedLoggerService} Nueva instancia del logger
   */
  static resetInstance(config = {}) {
    EnhancedLoggerFactory.#instance = new EnhancedLoggerService(config);
    return EnhancedLoggerFactory.#instance;
  }

  /**
   * Crea un logger simple compatible con el formato anterior
   * @param {Object} config - Configuración del logger
   * @returns {Object} Logger compatible
   */
  static createCompatibleLogger(config = {}) {
    const enhancedLogger = new EnhancedLoggerService(config);
    
    return {
      info: (message, ...args) => enhancedLogger.info(message, ...args),
      warn: (message, ...args) => enhancedLogger.warn(message, ...args),
      error: (message, ...args) => enhancedLogger.error(message, ...args),
      debug: (message, ...args) => enhancedLogger.debug(message, ...args),
      fatal: (message, ...args) => enhancedLogger.error(message, ...args) // Mapear fatal a error
    };
  }
}