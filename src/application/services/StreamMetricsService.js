/**
 * @fileoverview StreamMetricsService - Servicio especializado en métricas y monitoreo de streams.
 * Implementa Clean Architecture con Single Responsibility Principle.
 * 
 * Responsabilidades:
 * - Logging estructurado de operaciones
 * - Métricas de rendimiento y uso
 * - Monitoreo de errores y patrones
 * - Análisis de comportamiento de streams
 * 
 * @author VeoVeo Development Team
 * @version 1.3.0
 */

/**
 * Servicio de métricas para streams de Stremio.
 * Maneja toda la lógica de logging, métricas y monitoreo.
 */
export class StreamMetricsService {
  #logger;
  #config;
  #metrics;

  /**
   * @param {Object} logger - Sistema de logging
   * @param {Object} config - Configuración del addon
   */
  constructor(logger = console, config = {}) {
    this.#logger = logger;
    this.#config = config;
    this.#metrics = {
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      emptyResponses: 0,
      totalStreamsServed: 0,
      averageStreamsPerRequest: 0,
      responseTimeSum: 0,
      requestsByType: {},
      requestsByIdType: {},
      errorsByType: {},
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Registra el inicio de una petición de stream.
   * @param {Object} requestInfo - Información de la petición
   * @param {string} requestInfo.type - Tipo de contenido
   * @param {string} requestInfo.id - ID del contenido
   * @param {string} requestInfo.idType - Tipo de ID detectado
   * @returns {Object} Contexto de métricas para la petición
   */
  logStreamRequestStart(requestInfo) {
    const { type, id, idType } = requestInfo;
    const startTime = Date.now();
    
    this.#metrics.requests++;
    this.#metrics.requestsByType[type] = (this.#metrics.requestsByType[type] || 0) + 1;
    this.#metrics.requestsByIdType[idType] = (this.#metrics.requestsByIdType[idType] || 0) + 1;
    
    this.#logger.info(`[StreamHandler] Procesando petición: ${type}/${id} (${idType})`);
    
    return {
      startTime,
      type,
      id,
      idType,
      requestId: `${type}-${id}-${startTime}`
    };
  }

  /**
   * Registra el resultado exitoso de una petición de stream.
   * @param {Object} context - Contexto de la petición
   * @param {Object} result - Resultado de la petición
   * @param {Array} result.streams - Streams encontrados
   * @param {Object} result.metadata - Metadatos del contenido
   */
  logStreamRequestSuccess(context, result) {
    const { startTime, type, id, idType } = context;
    const { streams, metadata } = result;
    const responseTime = Date.now() - startTime;
    
    this.#metrics.successfulRequests++;
    this.#metrics.totalStreamsServed += streams.length;
    this.#metrics.responseTimeSum += responseTime;
    this.#metrics.averageStreamsPerRequest = this.#metrics.totalStreamsServed / this.#metrics.successfulRequests;
    
    if (streams.length === 0) {
      this.#metrics.emptyResponses++;
    }
    
    this.#logger.info(
      `[StreamHandler] Petición completada: ${type}/${id} (${idType}) - ` +
      `${streams.length} streams en ${responseTime}ms`
    );
    
    // Log detallado en modo desarrollo
    if (process.env.NODE_ENV === 'development') {
      this.#logger.debug(`[StreamHandler] Detalles de respuesta:`, {
        requestId: context.requestId,
        streamCount: streams.length,
        responseTime,
        metadata: metadata || 'No metadata',
        firstStreamTitle: streams[0]?.title || 'N/A'
      });
    }
  }

  /**
   * Registra un error en una petición de stream.
   * @param {Object} context - Contexto de la petición
   * @param {Error} error - Error ocurrido
   */
  logStreamRequestError(context, error) {
    const { startTime, type, id, idType } = context;
    const responseTime = Date.now() - startTime;
    
    this.#metrics.failedRequests++;
    this.#metrics.responseTimeSum += responseTime;
    
    const errorType = error.type || 'UNKNOWN';
    this.#metrics.errorsByType[errorType] = (this.#metrics.errorsByType[errorType] || 0) + 1;
    
    this.#logger.error(
      `[StreamHandler] Error en petición: ${type}/${id} (${idType}) - ` +
      `${error.message} en ${responseTime}ms`
    );
    
    // Log detallado del error en desarrollo
    if (process.env.NODE_ENV === 'development') {
      this.#logger.debug(`[StreamHandler] Detalles del error:`, {
        requestId: context.requestId,
        errorType,
        errorMessage: error.message,
        stack: error.stack,
        responseTime
      });
    }
  }

  /**
   * Registra operaciones de validación.
   * @param {Object} validationInfo - Información de validación
   * @param {string} validationInfo.type - Tipo de validación
   * @param {boolean} validationInfo.success - Si la validación fue exitosa
   * @param {string} validationInfo.details - Detalles adicionales
   */
  logValidation(validationInfo) {
    const { type, success, details } = validationInfo;
    
    if (success) {
      this.#logger.debug(`[Validation] ${type} - Exitosa: ${details}`);
    } else {
      this.#logger.warn(`[Validation] ${type} - Falló: ${details}`);
    }
  }

  /**
   * Registra operaciones de búsqueda de magnets.
   * @param {Object} searchInfo - Información de búsqueda
   * @param {string} searchInfo.id - ID buscado
   * @param {string} searchInfo.idType - Tipo de ID
   * @param {number} searchInfo.resultCount - Cantidad de magnets encontrados
   * @param {number} searchInfo.searchTime - Tiempo de búsqueda en ms
   */
  logMagnetSearch(searchInfo) {
    const { id, idType, resultCount, searchTime } = searchInfo;
    
    this.#logger.info(
      `[MagnetSearch] ${idType}/${id} - ${resultCount} magnets en ${searchTime}ms`
    );
    
    if (process.env.NODE_ENV === 'development') {
      this.#logger.debug(`[MagnetSearch] Detalles:`, {
        searchId: id,
        searchIdType: idType,
        magnetCount: resultCount,
        searchDuration: searchTime,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Registra conversiones de ID.
   * @param {Object} conversionInfo - Información de conversión
   * @param {string} conversionInfo.fromId - ID original
   * @param {string} conversionInfo.fromType - Tipo de ID original
   * @param {string} conversionInfo.toId - ID convertido
   * @param {string} conversionInfo.toType - Tipo de ID convertido
   * @param {boolean} conversionInfo.success - Si la conversión fue exitosa
   */
  logIdConversion(conversionInfo) {
    const { fromId, fromType, toId, toType, success } = conversionInfo;
    
    if (success) {
      this.#logger.info(`[IDConversion] ${fromType}/${fromId} → ${toType}/${toId}`);
    } else {
      this.#logger.warn(`[IDConversion] Falló: ${fromType}/${fromId} → ${toType}`);
    }
  }

  /**
   * Registra la detección del tipo de ID del contenido.
   * @param {string} contentId - ID del contenido recibido en la petición
   * @param {{ type?: string, confidence?: number, source?: string }|null} idDetection - Resultado de la detección
   */
  logIdDetection(contentId, idDetection) {
    try {
      const detectedType = idDetection?.type || 'unknown';
      const confidence = typeof idDetection?.confidence === 'number' ? idDetection.confidence : 'N/A';
      const source = idDetection?.source || 'N/A';

      this.#logger.info(
        `[StreamHandler] ID detectado: ${contentId} -> Tipo: ${detectedType} (Confianza: ${confidence}, Fuente: ${source})`
      );

      if (process.env.NODE_ENV === 'development') {
        this.#logger.debug('[StreamHandler] Detalles de detección ID:', {
          contentId,
          detectedType,
          confidence,
          source,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      // No romper flujo por logging
      this.#logger.warn('[StreamHandler] Fallo registrando detección de ID', { error: e?.message });
    }
  }

  /**
   * Registra un error de validación en la petición.
   * @param {Error} error - Error de validación capturado
   */
  logValidationError(error) {
    try {
      const message = error?.message || 'Unknown validation error';
      this.#metrics.errorsByType.VALIDATION_ERROR = (this.#metrics.errorsByType.VALIDATION_ERROR || 0) + 1;
      this.#logger.error(`[StreamHandler] Error de validación: ${message}`);

      if (process.env.NODE_ENV === 'development') {
        this.#logger.debug('[StreamHandler] Detalles del error de validación:', {
          errorMessage: message,
          errorType: 'VALIDATION_ERROR',
          stack: error?.stack,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      // Evitar que errores de logging afecten al flujo
      this.#logger.warn('[StreamHandler] Fallo registrando error de validación', { error: e?.message });
    }
  }

  /**
   * Registra operaciones de cache.
   * @param {Object} cacheInfo - Información de cache
   * @param {string} cacheInfo.operation - Tipo de operación (hit/miss/set)
   * @param {string} cacheInfo.key - Clave de cache
   * @param {number} cacheInfo.ttl - TTL aplicado
   */
  logCacheOperation(cacheInfo) {
    const { operation, key, ttl } = cacheInfo;
    
    if (operation === 'hit') {
      this.#metrics.cacheHits++;
    } else if (operation === 'miss') {
      this.#metrics.cacheMisses++;
    }
    
    this.#logger.debug(`[Cache] ${operation.toUpperCase()} - ${key} (TTL: ${ttl}s)`);
  }

  /**
   * Obtiene las métricas actuales del servicio.
   * @returns {Object} Métricas completas
   */
  getMetrics() {
    const averageResponseTime = this.#metrics.requests > 0 
      ? this.#metrics.responseTimeSum / this.#metrics.requests 
      : 0;
    
    const successRate = this.#metrics.requests > 0 
      ? (this.#metrics.successfulRequests / this.#metrics.requests) * 100 
      : 0;
    
    const cacheHitRate = (this.#metrics.cacheHits + this.#metrics.cacheMisses) > 0 
      ? (this.#metrics.cacheHits / (this.#metrics.cacheHits + this.#metrics.cacheMisses)) * 100 
      : 0;
    
    return {
      ...this.#metrics,
      averageResponseTime: Math.round(averageResponseTime),
      successRate: Math.round(successRate * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Genera un reporte de métricas formateado.
   * @returns {string} Reporte de métricas
   */
  generateMetricsReport() {
    const metrics = this.getMetrics();
    
    return `
=== STREAM HANDLER METRICS REPORT ===
Total Requests: ${metrics.requests}
Successful: ${metrics.successfulRequests} (${metrics.successRate}%)
Failed: ${metrics.failedRequests}
Empty Responses: ${metrics.emptyResponses}

Performance:
- Average Response Time: ${metrics.averageResponseTime}ms
- Total Streams Served: ${metrics.totalStreamsServed}
- Average Streams per Request: ${Math.round(metrics.averageStreamsPerRequest * 100) / 100}

Cache Performance:
- Cache Hit Rate: ${metrics.cacheHitRate}%
- Cache Hits: ${metrics.cacheHits}
- Cache Misses: ${metrics.cacheMisses}

Requests by Type:
${Object.entries(metrics.requestsByType)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

Requests by ID Type:
${Object.entries(metrics.requestsByIdType)
  .map(([idType, count]) => `- ${idType}: ${count}`)
  .join('\n')}

Errors by Type:
${Object.entries(metrics.errorsByType)
  .map(([errorType, count]) => `- ${errorType}: ${count}`)
  .join('\n')}

Generated: ${metrics.timestamp}
=====================================
    `.trim();
  }

  /**
   * Resetea todas las métricas.
   */
  resetMetrics() {
    this.#metrics = {
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      emptyResponses: 0,
      totalStreamsServed: 0,
      averageStreamsPerRequest: 0,
      responseTimeSum: 0,
      requestsByType: {},
      requestsByIdType: {},
      errorsByType: {},
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.#logger.info('[StreamMetrics] Métricas reseteadas');
  }

  /**
   * Registra información de debugging específica.
   * @param {string} operation - Operación siendo debuggeada
   * @param {Object} data - Datos de debug
   */
  logDebug(operation, data) {
    if (process.env.NODE_ENV === 'development') {
      this.#logger.debug(`[StreamHandler:${operation}]`, data);
    }
  }

  /**
   * Registra advertencias del sistema.
   * @param {string} message - Mensaje de advertencia
   * @param {Object} context - Contexto adicional
   */
  logWarning(message, context = {}) {
    this.#logger.warn(`[StreamHandler] ${message}`, context);
  }

  /**
   * Registra información general del sistema.
   * @param {string} message - Mensaje informativo
   * @param {Object} context - Contexto adicional
   */
  logInfo(message, context = {}) {
    this.#logger.info(`[StreamHandler] ${message}`, context);
  }
}

export default StreamMetricsService;