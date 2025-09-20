/**
 * @fileoverview Manejo centralizado de errores para el addon
 * Implementa patrones robustos de manejo de errores siguiendo principios SOLID
 * 
 * Principios aplicados:
 * - Single Responsibility: Cada clase tiene una responsabilidad específica
 * - Open/Closed: Extensible para nuevos tipos de error sin modificar código existente
 * - Liskov Substitution: Las clases de error son intercambiables
 * - Interface Segregation: Interfaces específicas para cada tipo de operación
 * - Dependency Inversion: Depende de abstracciones, no de implementaciones concretas
 * 
 * @author Sistema de Manejo de Errores
 * @version 2.0.0
 * @since 1.0.0
 */

import {
  AddonError,
  ConfigurationError,
  StreamError,
  ValidationError,
  MonitoringError,
  FallbackError,
  M3UParseError,
  RepositoryError,
  formatError,
  createErrorResponse,
  validateAddonResponse,
  generateErrorTrackingKey,
  convertStatsMapToObject,
  createSafeStremioResponse,
  createValidationErrorResponse,
  createConfigurationErrorResponse,
  normalizeRejectionReason,
  validateHandlerArgs,
  calculateDuration,
  fallbackErrorLogging
} from './ErrorHandler_tools.js';

// Re-exportar las clases de error para mantener compatibilidad
export {
  AddonError,
  ConfigurationError,
  StreamError,
  ValidationError,
  MonitoringError,
  FallbackError,
  M3UParseError,
  RepositoryError
};

/**
 * Manejador centralizado de errores para el addon
 * Implementa el patrón Singleton para manejo global de errores
 * 
 * @class ErrorHandler
 * @implements {IErrorHandler}
 * @example
 * ```javascript
 * const errorHandler = new ErrorHandler(logger, config);
 * const response = errorHandler.handleValidationError(new ValidationError('Invalid input'));
 * ```
 * 
 * @since 1.0.0
 * @version 2.0.0
 */
export class ErrorHandler {
  /**
   * Logger para registrar errores
   * @private
   * @type {import('../../interfaces/ILogger.js').ILogger}
   * @readonly
   */
  #logger;

  /**
   * Configuración del sistema
   * @private
   * @type {import('../../interfaces/IConfig.js').IConfig}
   * @readonly
   */
  #config;

  /**
   * Estadísticas de errores por contexto
   * @private
   * @type {Map<string, number>}
   * @readonly
   */
  #errorStats;

  /**
   * Instancia singleton del manejador de errores
   * @private
   * @static
   * @type {ErrorHandler|null}
   */
  static #instance = null;

  /**
   * Constructor del manejador de errores
   * 
   * @param {import('../../interfaces/ILogger.js').ILogger} logger - Logger para registrar errores
   * @param {import('../../interfaces/IConfig.js').IConfig} config - Configuración del sistema
   * @throws {TypeError} Si logger o config son null/undefined
   * @throws {ValidationError} Si logger o config no implementan las interfaces requeridas
   * 
   * @example
   * ```javascript
   * const errorHandler = new ErrorHandler(logger, config);
   * ```
   */
  constructor(logger, config) {
    if (!logger || !config) {
      throw new TypeError('Logger y config son requeridos');
    }
    
    this.#logger = logger;
    this.#config = config;
    this.#errorStats = new Map();
    this.#setupGlobalHandlers();
    ErrorHandler.#instance = this;
  }

  /**
   * Método estático para logging de errores
   * @param {string} context - Contexto donde ocurrió el error
   * @param {Error} error - Error a registrar
   */
  static logError(context, error) {
    if (ErrorHandler.#instance) {
      ErrorHandler.#instance.handleAsyncError(error, context);
    } else {
      // Fallback si no hay instancia disponible
      console.error(`[${context}] Error: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Configura manejadores globales de errores
   * @private
   */
  #setupGlobalHandlers() {
    // Handler para rechazos no manejados
    process.on('unhandledRejection', (reason, promise) => {
      const error = normalizeRejectionReason(reason);
      const errorInfo = formatError(error, 'unhandledRejection', { 
        promise: promise.toString()
      });
      
      this.#logger.error('Rechazo no manejado:', errorInfo);
      this.#trackError('unhandledRejection', error);
      
      if (this.#config.shouldExitOnUnhandledRejection()) {
        this.#gracefulShutdown('unhandledRejection');
      }
    });

    // Handler para excepciones no capturadas
    process.on('uncaughtException', (error) => {
      const errorInfo = formatError(error, 'uncaughtException');
      
      this.#logger.fatal('Excepción no capturada:', errorInfo);
      this.#trackError('uncaughtException', error);
      
      this.#gracefulShutdown('uncaughtException');
    });

    // Manejar señales de terminación
    process.on('SIGTERM', () => this.handleGracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleGracefulShutdown('SIGINT'));
  }

  /**
   * Maneja el cierre graceful del proceso
   * 
   * @param {string} signal - Señal del sistema recibida (SIGTERM, SIGINT, etc.)
   * 
   * @throws {TypeError} Si signal no es string
   * 
   * @example
   * ```javascript
   * process.on('SIGTERM', () => {
   *   errorHandler.handleGracefulShutdown('SIGTERM');
   * });
   * ```
   * 
   * @since 1.0.0
   */
  handleGracefulShutdown(signal) {
    if (typeof signal !== 'string') {
      throw new TypeError('La señal debe ser un string');
    }
    
    this.#gracefulShutdown(signal);
  }

  /**
   * Implementa el cierre graceful del proceso
   * @private
   * @param {string} reason - Razón del cierre
   */
  #gracefulShutdown(reason) {
    try {
      this.#logger.info(`Cierre graceful por: ${reason}`);
      
      // Dar tiempo para que las operaciones en curso terminen
      setTimeout(() => {
        this.#logger.info('Addon cerrado correctamente');
        process.exit(reason === 'uncaughtException' ? 1 : 0);
      }, 5000);
    } catch (shutdownError) {
      // Usar logging de fallback si el logger principal falla
      fallbackErrorLogging(`Error en cierre graceful: ${shutdownError.message}`);
      process.exit(1);
    }
  }

  /**
   * Maneja errores asíncronos y operaciones no bloqueantes
   * 
   * @param {Error} error - Error asíncrono capturado
   * @param {string} [context='unknown'] - Contexto donde ocurrió el error
   * @param {Object} [metadata={}] - Metadatos adicionales del error
   * @param {string} [metadata.operation] - Operación específica que falló
   * @param {number} [metadata.duration] - Duración de la operación en ms
   * @param {string} [metadata.requestId] - ID de la petición relacionada
   * 
   * @returns {import('./types/ErrorResponse.js').AsyncErrorResponse} Respuesta estandarizada de error asíncrono
   * 
   * @throws {TypeError} Si error no es instancia de Error
   * 
   * @example
   * ```javascript
   * try {
   *   await someAsyncOperation();
   * } catch (error) {
   *   const response = errorHandler.handleAsyncError(error, 'database-query', {
   *     operation: 'user-fetch',
   *     duration: 1500,
   *     requestId: 'req-123'
   *   });
   * }
   * ```
   * 
   * @since 1.0.0
   */
  handleAsyncError(error, context = 'unknown', metadata = {}) {
    if (!(error instanceof Error)) {
      throw new TypeError('El error debe ser una instancia de Error');
    }
    
    const errorInfo = formatError(error, context, metadata);
    
    this.#logger.error(`Error en ${context}:`, errorInfo);
    this.#trackError(context, error);

    return createErrorResponse(error, context);
  }

  /**
   * Maneja errores de validación de entrada
   * 
   * @param {ValidationError} error - Error de validación específico
   * @param {Object} [context={}] - Contexto adicional del error
   * @param {string} [context.operation] - Operación que causó el error
   * @param {string} [context.userId] - ID del usuario relacionado
   * @param {Object} [context.metadata] - Metadatos adicionales
   * 
   * @returns {import('./types/ErrorResponse.js').ValidationErrorResponse} Respuesta estandarizada de error de validación
   * 
   * @throws {TypeError} Si error no es instancia de ValidationError
   * 
   * @example
   * ```javascript
   * const validationError = new ValidationError('Campo requerido', ['email']);
   * const response = errorHandler.handleValidationError(validationError, {
   *   operation: 'user-registration',
   *   userId: 'user123'
   * });
   * ```
   * 
   * @since 1.0.0
   */
  handleValidationError(error, context = {}) {
    if (!(error instanceof ValidationError)) {
      throw new TypeError('El error debe ser una instancia de ValidationError');
    }
    
    this.#trackError('validation', error);
    
    const errorInfo = formatError(error, context);
    this.#logger.warn('Error de validación:', errorInfo);
    
    return createValidationErrorResponse(error);
  }

  /**
   * Maneja errores de configuración del sistema
   * 
   * @param {ConfigurationError} error - Error de configuración específico
   * @param {Object} [context={}] - Contexto adicional del error
   * @param {string} [context.configFile] - Archivo de configuración afectado
   * @param {string} [context.environment] - Entorno donde ocurrió el error
   * 
   * @returns {import('./types/ErrorResponse.js').ConfigurationErrorResponse} Respuesta estandarizada de error de configuración
   * 
   * @throws {TypeError} Si error no es instancia de ConfigurationError
   * 
   * @example
   * ```javascript
   * const configError = new ConfigurationError('Variable de entorno faltante', 'DATABASE_URL');
   * const response = errorHandler.handleConfigurationError(configError, {
   *   configFile: '.env',
   *   environment: 'production'
   * });
   * ```
   * 
   * @since 1.0.0
   */
  handleConfigurationError(error, context = {}) {
    if (!(error instanceof ConfigurationError)) {
      throw new TypeError('El error debe ser una instancia de ConfigurationError');
    }
    
    this.#trackError('configuration', error);
    
    const errorInfo = formatError(error, context);
    this.#logger.error('Error de configuración:', errorInfo);
    
    return createConfigurationErrorResponse(error);
  }

  /**
   * Maneja errores en handlers del addon de Stremio
   * @param {Error} error - Error ocurrido
   * @param {string} handlerType - Tipo de handler (catalog, meta, stream)
   * @param {Object} args - Argumentos del handler
   * @param {number} startTime - Tiempo de inicio para calcular duración
   * @returns {Object} Respuesta de error segura para Stremio
   */
  handleAddonError(error, handlerType, args, startTime) {
    const duration = Date.now() - startTime;
    
    this.#logger.error(`Fallo en ${handlerType} (${duration}ms):`, {
      error: error.message,
      stack: this.#config.isDevelopment() ? error.stack : undefined,
      args: args
    });
    
    this.#trackError(handlerType, error);
    
    // Respuestas seguras según especificaciones del SDK de Stremio con cache optimizado
    switch (handlerType) {
      case 'catalog':
        // Catalog functionality disabled - return empty response
        return {
          metas: [],
          cacheMaxAge: 300,
          staleRevalidate: 600,
          staleError: 1200
        };
      case 'meta':
        const metaCacheMaxAge = Math.min(this.#config.cache.metaCacheMaxAge, 300);
        return {
          meta: null,
          cacheMaxAge: metaCacheMaxAge,
          staleRevalidate: metaCacheMaxAge * 2,
          staleError: metaCacheMaxAge * 4
        };
      case 'stream':
        const streamCacheMaxAge = Math.min(this.#config.cache.streamCacheMaxAge || 30, 30);
        return {
          streams: [],
          cacheMaxAge: streamCacheMaxAge,
          staleRevalidate: streamCacheMaxAge * 2,
          staleError: streamCacheMaxAge * 10
        };
      default:
        return this.#createErrorResponse(error, handlerType);
    }
  }

  /**
   * Crea un wrapper seguro para handlers del addon
   * @param {Function} handler - Handler original
   * @param {string} handlerType - Tipo de handler
   * @returns {Function} Handler envuelto con manejo de errores
   */
  wrapAddonHandler(handler, handlerType) {
    return async (args) => {
      const startTime = Date.now();
      
      try {
        // Validar argumentos de entrada
        if (!args || typeof args !== 'object') {
          throw new ValidationError(`Argumentos de ${handlerType} inválidos`);
        }

        this.#logger.debug(`Request ${handlerType}: ${JSON.stringify(args)}`);
        
        const result = await handler(args);
        
        const duration = Date.now() - startTime;
        this.#logger.debug(`Request ${handlerType} completado en ${duration}ms`);
        
        // Validar respuesta antes de enviar
        this.#validateAddonResponse(result, handlerType);
        
        return result;
        
      } catch (error) {
        return this.handleAddonError(error, handlerType, args, startTime);
      }
    };
  }

  /**
   * Obtiene estadísticas detalladas de errores del sistema
   * 
   * @returns {import('./types/ErrorStats.js').ErrorStatsReport} Reporte completo de estadísticas de errores
   * 
   * @example
   * ```javascript
   * const stats = errorHandler.getErrorStats();
   * console.log(`Total de errores: ${Object.keys(stats).length}`);
   * ```
   * 
   * @since 1.0.0
   */
  getErrorStats() {
    return convertStatsMapToObject(this.#errorStats);
  }



  /**
   * Rastrea estadísticas de errores
   * @private
   * @param {string} context - Contexto del error
   * @param {Error} error - Error ocurrido
   */
  #trackError(context, error) {
    const key = generateErrorTrackingKey(error, context);
    const current = this.#errorStats.get(key) || 0;
    this.#errorStats.set(key, current + 1);
  }

  /**
   * Formatea información del error
   * @private
   * @param {Error} error - Error a formatear
   * @param {string} context - Contexto del error
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Información formateada del error
   */
  #formatError(error, context, metadata) {
    return formatError(error, context, metadata);
  }

  /**
   * Crea respuesta de error
   * @private
   * @param {Error} error - Error a procesar
   * @param {string} context - Contexto del error
   * @returns {Object} Respuesta de error
   */
  #createErrorResponse(error, context) {
    return createErrorResponse(error, context);
  }

  /**
   * Valida respuesta del addon
   * @private
   * @param {*} result - Resultado a validar
   * @param {string} handlerType - Tipo de handler
   */
  #validateAddonResponse(result, handlerType) {
    return validateAddonResponse(result, handlerType);
  }
}