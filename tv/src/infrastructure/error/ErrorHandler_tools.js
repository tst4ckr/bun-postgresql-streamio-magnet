/**
 * @fileoverview Herramientas y utilidades para el manejo de errores
 * Contiene funciones puras, validadores y formateadores
 */

/**
 * Tipos de errores personalizados
 */
export class AddonError extends Error {
  /**
   * @param {string} message - Mensaje del error
   * @param {string} code - Código del error
   * @param {number} statusCode - Código de estado HTTP
   */
  constructor(message, code = 'ADDON_ERROR', statusCode = 500) {
    super(message);
    this.name = 'AddonError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

export class ConfigurationError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {string|null} field - Campo que causó el error
   */
  constructor(message, field = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

export class StreamError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {string|null} streamId - ID del stream que causó el error
   */
  constructor(message, streamId = null) {
    super(message, 'STREAM_ERROR', 404);
    this.name = 'StreamError';
    this.streamId = streamId;
  }
}

export class ValidationError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {Array} validationErrors - Lista de errores de validación
   */
  constructor(message, validationErrors = []) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

export class MonitoringError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {string|null} monitoringId - ID del monitoreo
   */
  constructor(message, monitoringId = null) {
    super(message, 'MONITORING_ERROR', 500);
    this.name = 'MonitoringError';
    this.monitoringId = monitoringId;
  }
}

export class FallbackError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {string|null} channelId - ID del canal
   */
  constructor(message, channelId = null) {
    super(message, 'FALLBACK_ERROR', 503);
    this.name = 'FallbackError';
    this.channelId = channelId;
  }
}

export class M3UParseError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {number|null} lineNumber - Número de línea donde ocurrió el error
   */
  constructor(message, lineNumber = null) {
    super(message, 'M3U_PARSE_ERROR', 422);
    this.name = 'M3UParseError';
    this.lineNumber = lineNumber;
  }
}

export class RepositoryError extends AddonError {
  /**
   * @param {string} message - Mensaje del error
   * @param {string|null} operation - Operación que causó el error
   */
  constructor(message, operation = null) {
    super(message, 'REPOSITORY_ERROR', 500);
    this.name = 'RepositoryError';
    this.operation = operation;
  }
}

/**
 * Formatea información del error de manera consistente
 * @param {Error} error - Error a formatear
 * @param {string} context - Contexto donde ocurrió el error
 * @param {Object} metadata - Metadatos adicionales
 * @param {boolean} isDevelopment - Si está en modo desarrollo
 * @returns {Object} Información formateada del error
 */
export function formatError(error, context, metadata, isDevelopment = false) {
  return {
    message: error.message,
    name: error.name,
    code: error.code || 'UNKNOWN_ERROR',
    stack: isDevelopment ? error.stack : undefined,
    context,
    metadata,
    timestamp: new Date().toISOString()
  };
}

/**
 * Crea respuesta de error estandarizada
 * @param {Error} error - Error original
 * @param {string} context - Contexto del error
 * @param {boolean} isDevelopment - Si está en modo desarrollo
 * @returns {Object} Respuesta de error
 */
export function createErrorResponse(error, context, isDevelopment = false) {
  const isAddonError = error instanceof AddonError;
  
  return {
    error: isAddonError ? error.name : 'Internal Server Error',
    message: isAddonError ? error.message : 'Ha ocurrido un error interno',
    code: error.code || 'INTERNAL_ERROR',
    context,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: error.stack })
  };
}

/**
 * Valida respuestas del addon según especificaciones del SDK
 * @param {Object} result - Resultado a validar
 * @param {string} handlerType - Tipo de handler
 * @throws {ValidationError} Si la respuesta es inválida
 */
export function validateAddonResponse(result, handlerType) {
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
 * Genera clave para tracking de errores
 * @param {string} context - Contexto del error
 * @param {Error} error - Error ocurrido
 * @returns {string} Clave para el tracking
 */
export function generateErrorTrackingKey(context, error) {
  return `${context}:${error.name || 'Unknown'}`;
}

/**
 * Convierte Map de estadísticas a objeto plano
 * @param {Map} errorStatsMap - Map con estadísticas de errores
 * @returns {Object} Objeto con estadísticas
 */
export function convertStatsMapToObject(errorStatsMap) {
  const stats = {};
  for (const [context, count] of errorStatsMap.entries()) {
    stats[context] = count;
  }
  return stats;
}

/**
 * Crea respuestas seguras para diferentes tipos de handlers de Stremio
 * @param {string} handlerType - Tipo de handler
 * @param {Object} cacheConfig - Configuración de cache
 * @returns {Object} Respuesta segura para Stremio
 */
export function createSafeStremioResponse(handlerType, cacheConfig) {
  switch (handlerType) {
    case 'catalog': {
      // Return safe empty catalog response
      return {
        metas: [],
        cacheMaxAge: 300,
        staleRevalidate: 600,
        staleError: 1200
      };
    }
    case 'meta': {
      const metaCacheMaxAge = Math.min(cacheConfig.metaCacheMaxAge, 300);
      return {
        meta: null,
        cacheMaxAge: metaCacheMaxAge,
        staleRevalidate: metaCacheMaxAge * 2,
        staleError: metaCacheMaxAge * 4
      };
    }
    case 'stream': {
      const streamCacheMaxAge = Math.min(cacheConfig.streamCacheMaxAge || 30, 30);
      return {
        streams: [],
        cacheMaxAge: streamCacheMaxAge,
        staleRevalidate: streamCacheMaxAge * 2,
        staleError: streamCacheMaxAge * 10
      };
    }
    default:
      return null;
  }
}

/**
 * Crea respuesta de error de validación
 * @param {ValidationError} error - Error de validación
 * @returns {Object} Respuesta formateada
 */
export function createValidationErrorResponse(error) {
  return {
    error: 'Validation Error',
    message: error.message,
    details: error.validationErrors,
    code: error.code,
    timestamp: error.timestamp
  };
}

/**
 * Crea respuesta de error de configuración
 * @param {ConfigurationError} error - Error de configuración
 * @returns {Object} Respuesta formateada
 */
export function createConfigurationErrorResponse(error) {
  return {
    error: 'Configuration Error',
    message: error.message,
    field: error.field,
    code: error.code,
    timestamp: error.timestamp
  };
}

/**
 * Normaliza una razón de rechazo a Error
 * @param {*} reason - Razón del rechazo
 * @returns {Error} Error normalizado
 */
export function normalizeRejectionReason(reason) {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Valida argumentos de entrada para handlers
 * @param {*} args - Argumentos a validar
 * @param {string} handlerType - Tipo de handler
 * @throws {ValidationError} Si los argumentos son inválidos
 */
export function validateHandlerArgs(args, handlerType) {
  if (!args || typeof args !== 'object') {
    throw new ValidationError(`Argumentos de ${handlerType} inválidos`);
  }
}

/**
 * Calcula duración de operación
 * @param {number} startTime - Tiempo de inicio
 * @returns {number} Duración en milisegundos
 */
export function calculateDuration(startTime) {
  return Date.now() - startTime;
}

/**
 * Logging de fallback cuando no hay instancia disponible
 * @param {string} context - Contexto del error
 * @param {Error} error - Error a registrar
 */
export function fallbackErrorLogging(context, error) {
  console.error(`[${context}] Error:`, error.message);
  if (error.stack) {
    console.error(error.stack);
  }
}