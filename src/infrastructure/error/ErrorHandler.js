/**
 * @fileoverview Manejo centralizado de errores para el addon
 * Implementa patrones robustos de manejo de errores
 */

/**
 * Tipos de errores personalizados
 */
export class AddonError extends Error {
  constructor(message, code = 'ADDON_ERROR', statusCode = 500) {
    super(message);
    this.name = 'AddonError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

export class ConfigurationError extends AddonError {
  constructor(message, field = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

export class StreamError extends AddonError {
  constructor(message, streamId = null) {
    super(message, 'STREAM_ERROR', 404);
    this.name = 'StreamError';
    this.streamId = streamId;
  }
}

export class ValidationError extends AddonError {
  constructor(message, validationErrors = []) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

export class MonitoringError extends AddonError {
  constructor(message, monitoringId = null) {
    super(message, 'MONITORING_ERROR', 500);
    this.name = 'MonitoringError';
    this.monitoringId = monitoringId;
  }
}

export class FallbackError extends AddonError {
  constructor(message, channelId = null) {
    super(message, 'FALLBACK_ERROR', 503);
    this.name = 'FallbackError';
    this.channelId = channelId;
  }
}

export class M3UParseError extends AddonError {
  constructor(message, lineNumber = null) {
    super(message, 'M3U_PARSE_ERROR', 422);
    this.name = 'M3UParseError';
    this.lineNumber = lineNumber;
  }
}

export class RepositoryError extends AddonError {
  constructor(message, operation = null) {
    super(message, 'REPOSITORY_ERROR', 500);
    this.name = 'RepositoryError';
    this.operation = operation;
  }
}

/**
 * Clase responsable del manejo centralizado de errores
 */
export class ErrorHandler {
  #logger;
  #config;
  #errorStats;
  static #instance = null;

  constructor(logger, config) {
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
      console.error(`[${context}] Error:`, error.message);
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
    // Manejar promesas rechazadas no capturadas
    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    });

    // Manejar excepciones no capturadas
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Manejar señales de terminación
    process.on('SIGTERM', () => this.handleGracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleGracefulShutdown('SIGINT'));
  }

  /**
   * Maneja errores de promesas no capturadas
   * @param {*} reason - Razón del rechazo
   * @param {Promise} promise - Promesa rechazada
   */
  handleUnhandledRejection(reason, promise) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    
    this.#logger.error('Promesa rechazada no manejada:', {
      error: error.message,
      stack: error.stack,
      promise: promise.toString()
    });

    this.#trackError('unhandledRejection', error);

    // En producción, no terminar el proceso inmediatamente
    if (this.#config.isProduction()) {
      this.#logger.warn('Continuando ejecución en producción después de promesa rechazada');
    } else {
      this.#logger.error('Terminando proceso debido a promesa rechazada en desarrollo');
      process.exit(1);
    }
  }

  /**
   * Maneja excepciones no capturadas
   * @param {Error} error - Error no capturado
   */
  handleUncaughtException(error) {
    this.#logger.error('Excepción no capturada:', {
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    });

    this.#trackError('uncaughtException', error);

    // Intentar cerrar gracefully
    this.#logger.error('Terminando proceso debido a excepción no capturada');
    process.exit(1);
  }

  /**
   * Maneja cierre graceful del proceso
   * @param {string} signal - Señal recibida
   */
  handleGracefulShutdown(signal) {
    this.#logger.info(`Señal ${signal} recibida. Cerrando addon...`);
    
    // Dar tiempo para que las operaciones en curso terminen
    setTimeout(() => {
      this.#logger.info('Addon cerrado correctamente');
      process.exit(0);
    }, 5000);
  }

  /**
   * Maneja errores de operaciones asíncronas
   * @param {Error} error - Error a manejar
   * @param {string} context - Contexto donde ocurrió el error
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Respuesta de error formateada
   */
  handleAsyncError(error, context = 'unknown', metadata = {}) {
    const errorInfo = this.#formatError(error, context, metadata);
    
    this.#logger.error(`Error en ${context}:`, errorInfo);
    this.#trackError(context, error);

    return this.#createErrorResponse(error, context);
  }

  /**
   * Maneja errores de validación
   * @param {ValidationError} error - Error de validación
   * @returns {Object} Respuesta de error de validación
   */
  handleValidationError(error) {
    this.#logger.warn('Error de validación:', {
      message: error.message,
      validationErrors: error.validationErrors,
      timestamp: error.timestamp
    });

    return {
      error: 'Validation Error',
      message: error.message,
      details: error.validationErrors,
      code: error.code,
      timestamp: error.timestamp
    };
  }

  /**
   * Maneja errores de configuración
   * @param {ConfigurationError} error - Error de configuración
   * @returns {Object} Respuesta de error de configuración
   */
  handleConfigurationError(error) {
    this.#logger.error('Error de configuración:', {
      message: error.message,
      field: error.field,
      timestamp: error.timestamp
    });

    return {
      error: 'Configuration Error',
      message: error.message,
      field: error.field,
      code: error.code,
      timestamp: error.timestamp
    };
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
    
    this.#logger.error(`${handlerType} request failed in ${duration}ms:`, {
      error: error.message,
      stack: this.#config.isDevelopment() ? error.stack : undefined,
      args: args
    });
    
    this.#trackError(handlerType, error);
    
    // Respuestas seguras según especificaciones del SDK de Stremio
    switch (handlerType) {
      case 'catalog':
        return {
          metas: [],
          cacheMaxAge: Math.min(this.#config.cache.catalogCacheMaxAge, 300)
        };
      case 'meta':
        return {
          meta: null,
          cacheMaxAge: Math.min(this.#config.cache.metaCacheMaxAge, 300)
        };
      case 'stream':
        return {
          streams: [],
          cacheMaxAge: Math.min(this.#config.cache.streamCacheMaxAge || 300, 300)
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

        this.#logger.debug(`${handlerType} request: ${JSON.stringify(args)}`);
        
        const result = await handler(args);
        
        const duration = Date.now() - startTime;
        this.#logger.debug(`${handlerType} request completed in ${duration}ms`);
        
        // Validar respuesta antes de enviar
        this.#validateAddonResponse(result, handlerType);
        
        return result;
        
      } catch (error) {
        return this.handleAddonError(error, handlerType, args, startTime);
      }
    };
  }

  /**
   * Obtiene estadísticas de errores
   * @returns {Object} Estadísticas de errores
   */
  getErrorStats() {
    const stats = {};
    for (const [context, count] of this.#errorStats.entries()) {
      stats[context] = count;
    }
    return stats;
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
    return {
      message: error.message,
      name: error.name,
      code: error.code || 'UNKNOWN_ERROR',
      stack: this.#config.isDevelopment() ? error.stack : undefined,
      context,
      metadata,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Crea respuesta de error estandarizada
   * @private
   * @param {Error} error - Error original
   * @param {string} context - Contexto del error
   * @returns {Object} Respuesta de error
   */
  #createErrorResponse(error, context) {
    const isAddonError = error instanceof AddonError;
    
    return {
      error: isAddonError ? error.name : 'Internal Server Error',
      message: isAddonError ? error.message : 'Ha ocurrido un error interno',
      code: error.code || 'INTERNAL_ERROR',
      context,
      timestamp: new Date().toISOString(),
      ...(this.#config.isDevelopment() && { stack: error.stack })
    };
  }

  /**
   * Valida respuestas del addon según especificaciones del SDK
   * @private
   * @param {Object} result - Resultado a validar
   * @param {string} handlerType - Tipo de handler
   * @throws {ValidationError} Si la respuesta es inválida
   */
  #validateAddonResponse(result, handlerType) {
    if (!result || typeof result !== 'object') {
      throw new ValidationError(`Respuesta de ${handlerType} inválida: debe ser un objeto`);
    }

    switch (handlerType) {
      case 'catalog':
        if (!Array.isArray(result.metas)) {
          throw new ValidationError('Respuesta de catálogo inválida: metas debe ser un array');
        }
        break;
      case 'meta':
        if (result.meta !== null && typeof result.meta !== 'object') {
          throw new ValidationError('Respuesta de metadatos inválida: meta debe ser objeto o null');
        }
        break;
      case 'stream':
        if (!Array.isArray(result.streams)) {
          throw new ValidationError('Respuesta de stream inválida: streams debe ser un array');
        }
        break;
    }
  }

  /**
   * Rastrea estadísticas de errores
   * @private
   * @param {string} context - Contexto del error
   * @param {Error} error - Error ocurrido
   */
  #trackError(context, error) {
    const key = `${context}:${error.name || 'Unknown'}`;
    const current = this.#errorStats.get(key) || 0;
    this.#errorStats.set(key, current + 1);
  }
}