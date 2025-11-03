/**
 * @fileoverview Interfaces y contratos para los servicios de Stream.
 * Define los contratos explícitos entre servicios siguiendo Clean Architecture.
 * 
 * @author VeoVeo Development Team
 * @version 1.3.0
 */

/**
 * @typedef {Object} StreamRequestContext
 * @property {string} type - Tipo de contenido (movie, series, tv, anime)
 * @property {string} id - ID del contenido
 * @property {string} idType - Tipo de ID detectado (imdb, kitsu, mal, etc.)
 * @property {number} season - Temporada (opcional)
 * @property {number} episode - Episodio (opcional)
 * @property {number} startTime - Timestamp de inicio de la petición
 * @property {string} requestId - ID único de la petición
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Si la validación fue exitosa
 * @property {string} error - Mensaje de error si la validación falló
 * @property {Object} normalizedData - Datos normalizados después de la validación
 */

/**
 * @typedef {Object} StreamData
 * @property {string} title - Título del stream
 * @property {string} infoHash - Hash del magnet
 * @property {Array<string>} sources - Lista de trackers
 * @property {string} description - Descripción del stream
 * @property {number} fileIdx - Índice del archivo (opcional)
 * @property {Object} behaviorHints - Hints de comportamiento para Stremio
 */

/**
 * @typedef {Object} ProcessingResult
 * @property {Array<StreamData>} streams - Lista de streams procesados
 * @property {Object} metadata - Metadatos del contenido
 * @property {number} processingTime - Tiempo de procesamiento en ms
 * @property {string} source - Fuente de los datos (cache, repository, etc.)
 */

/**
 * @typedef {Object} CacheStrategy
 * @property {string} strategy - Tipo de estrategia (standard, long, short, error)
 * @property {number} ttl - TTL en segundos
 * @property {string} reason - Razón de la estrategia aplicada
 */

/**
 * @typedef {Object} MetricsContext
 * @property {number} startTime - Timestamp de inicio
 * @property {string} type - Tipo de contenido
 * @property {string} id - ID del contenido
 * @property {string} idType - Tipo de ID
 * @property {string} requestId - ID único de la petición
 */

/**
 * Interface para el servicio de validación de streams.
 * Define el contrato para todas las operaciones de validación.
 */
export class IStreamValidationService {
  /**
   * Valida una petición de stream completa.
   * @param {string} type - Tipo de contenido
   * @param {string} id - ID del contenido
   * @returns {Promise<ValidationResult>} Resultado de la validación
   * @abstract
   */
  async validateStreamRequest(type, id) {
    throw new Error('Method validateStreamRequest must be implemented');
  }

  /**
   * Verifica si un tipo de contenido es soportado.
   * @param {string} type - Tipo de contenido
   * @returns {boolean} Si el tipo es soportado
   * @abstract
   */
  isSupportedType(type) {
    throw new Error('Method isSupportedType must be implemented');
  }

  /**
   * Detecta el tipo de ID de contenido.
   * @param {string} id - ID del contenido
   * @returns {Promise<string>} Tipo de ID detectado
   * @abstract
   */
  async detectContentIdType(id) {
    throw new Error('Method detectContentIdType must be implemented');
  }

  /**
   * Extrae temporada y episodio de un ID.
   * @param {string} id - ID del contenido
   * @returns {Object} Objeto con season y episode
   * @abstract
   */
  extractSeasonEpisode(id) {
    throw new Error('Method extractSeasonEpisode must be implemented');
  }
}

/**
 * Interface para el servicio de procesamiento de streams.
 * Define el contrato para todas las operaciones de procesamiento.
 */
export class IStreamProcessingService {
  /**
   * Obtiene magnets para un contenido específico.
   * @param {string} id - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {string} idType - Tipo de ID
   * @returns {Promise<Array>} Lista de magnets encontrados
   * @abstract
   */
  async getMagnets(id, type, idType) {
    throw new Error('Method getMagnets must be implemented');
  }

  /**
   * Crea streams a partir de magnets.
   * @param {Array} magnets - Lista de magnets
   * @param {Object} metadata - Metadatos del contenido
   * @returns {Promise<ProcessingResult>} Resultado del procesamiento
   * @abstract
   */
  async createStreamsFromMagnets(magnets, metadata) {
    throw new Error('Method createStreamsFromMagnets must be implemented');
  }

  /**
   * Formatea el título de un stream.
   * @param {Object} magnet - Datos del magnet
   * @param {Object} metadata - Metadatos del contenido
   * @returns {string} Título formateado
   * @abstract
   */
  formatStreamTitle(magnet, metadata) {
    throw new Error('Method formatStreamTitle must be implemented');
  }

  /**
   * Formatea la descripción de un stream.
   * @param {Object} magnet - Datos del magnet
   * @param {Object} metadata - Metadatos del contenido
   * @returns {string} Descripción formateada
   * @abstract
   */
  formatStreamDescription(magnet, metadata) {
    throw new Error('Method formatStreamDescription must be implemented');
  }

  /**
   * Convierte tamaño de string a bytes.
   * @param {string} sizeStr - Tamaño como string
   * @returns {number} Tamaño en bytes
   * @abstract
   */
  convertSizeToBytes(sizeStr) {
    throw new Error('Method convertSizeToBytes must be implemented');
  }
}

/**
 * Interface para el servicio de cache de streams.
 * Define el contrato para todas las operaciones de cache.
 */
export class IStreamCacheService {
  /**
   * Obtiene TTL de cache por tipo de contenido.
   * @param {string} idType - Tipo de ID
   * @param {number} streamCount - Cantidad de streams
   * @returns {number} TTL en segundos
   * @abstract
   */
  getCacheTTLByType(idType, streamCount) {
    throw new Error('Method getCacheTTLByType must be implemented');
  }

  /**
   * Crea respuesta de stream con cache optimizado.
   * @param {Array<StreamData>} streams - Lista de streams
   * @param {Object} metadata - Metadatos opcionales
   * @returns {Object} Respuesta con cache
   * @abstract
   */
  createStreamResponse(streams, metadata) {
    throw new Error('Method createStreamResponse must be implemented');
  }

  /**
   * Crea respuesta vacía con cache optimizado.
   * @param {string} type - Tipo de contenido
   * @returns {Object} Respuesta vacía con cache
   * @abstract
   */
  createEmptyResponse(type) {
    throw new Error('Method createEmptyResponse must be implemented');
  }

  /**
   * Crea respuesta de error con cache adaptativo.
   * @param {Error} error - Error ocurrido
   * @param {string} type - Tipo de contenido
   * @returns {Object} Respuesta de error con cache
   * @abstract
   */
  createErrorResponse(error, type) {
    throw new Error('Method createErrorResponse must be implemented');
  }

  /**
   * Determina estrategia de cache basada en contexto.
   * @param {Object} context - Contexto de la petición
   * @returns {CacheStrategy} Estrategia de cache recomendada
   * @abstract
   */
  determineCacheStrategy(context) {
    throw new Error('Method determineCacheStrategy must be implemented');
  }
}

/**
 * Interface para el servicio de métricas de streams.
 * Define el contrato para todas las operaciones de métricas.
 */
export class IStreamMetricsService {
  /**
   * Registra el inicio de una petición de stream.
   * @param {Object} requestInfo - Información de la petición
   * @returns {MetricsContext} Contexto de métricas
   * @abstract
   */
  logStreamRequestStart(requestInfo) {
    throw new Error('Method logStreamRequestStart must be implemented');
  }

  /**
   * Registra el resultado exitoso de una petición.
   * @param {MetricsContext} context - Contexto de la petición
   * @param {ProcessingResult} result - Resultado de la petición
   * @abstract
   */
  logStreamRequestSuccess(context, result) {
    throw new Error('Method logStreamRequestSuccess must be implemented');
  }

  /**
   * Registra un error en una petición.
   * @param {MetricsContext} context - Contexto de la petición
   * @param {Error} error - Error ocurrido
   * @abstract
   */
  logStreamRequestError(context, error) {
    throw new Error('Method logStreamRequestError must be implemented');
  }

  /**
   * Registra operaciones de validación.
   * @param {Object} validationInfo - Información de validación
   * @abstract
   */
  logValidation(validationInfo) {
    throw new Error('Method logValidation must be implemented');
  }

  /**
   * Registra operaciones de búsqueda de magnets.
   * @param {Object} searchInfo - Información de búsqueda
   * @abstract
   */
  logMagnetSearch(searchInfo) {
    throw new Error('Method logMagnetSearch must be implemented');
  }

  /**
   * Registra conversiones de ID.
   * @param {Object} conversionInfo - Información de conversión
   * @abstract
   */
  logIdConversion(conversionInfo) {
    throw new Error('Method logIdConversion must be implemented');
  }

  /**
   * Registra operaciones de cache.
   * @param {Object} cacheInfo - Información de cache
   * @abstract
   */
  logCacheOperation(cacheInfo) {
    throw new Error('Method logCacheOperation must be implemented');
  }

  /**
   * Obtiene métricas actuales del servicio.
   * @returns {Object} Métricas completas
   * @abstract
   */
  getMetrics() {
    throw new Error('Method getMetrics must be implemented');
  }

  /**
   * Genera reporte de métricas formateado.
   * @returns {string} Reporte de métricas
   * @abstract
   */
  generateMetricsReport() {
    throw new Error('Method generateMetricsReport must be implemented');
  }

  /**
   * Resetea todas las métricas.
   * @abstract
   */
  resetMetrics() {
    throw new Error('Method resetMetrics must be implemented');
  }
}

/**
 * Interface principal para el StreamHandler refactorizado.
 * Define el contrato principal que debe mantener la compatibilidad.
 */
export class IStreamHandler {
  /**
   * Crea el handler de addon para Stremio.
   * @returns {Function} Handler de addon
   * @abstract
   */
  createAddonHandler() {
    throw new Error('Method createAddonHandler must be implemented');
  }

  /**
   * Maneja peticiones de stream de Stremio.
   * @param {Object} args - Argumentos de la petición
   * @returns {Promise<Object>} Respuesta de streams
   * @abstract
   */
  async handleStreamRequest(args) {
    throw new Error('Method handleStreamRequest must be implemented');
  }
}

/**
 * Configuración de dependencias para los servicios.
 * Define qué dependencias necesita cada servicio.
 */
export const SERVICE_DEPENDENCIES = {
  StreamValidationService: [
    'validationService',
    'idDetectorService', 
    'logger'
  ],
  StreamProcessingService: [
    'magnetRepository',
    'unifiedIdService',
    'metadataService',
    'logger',
    'config'
  ],
  StreamCacheService: [
    'config',
    'logger'
  ],
  StreamMetricsService: [
    'logger',
    'config'
  ],
  StreamHandler: [
    'streamValidationService',
    'streamProcessingService',
    'streamCacheService',
    'streamMetricsService',
    'logger',
    'config'
  ]
};

/**
 * Eventos que pueden ser emitidos por los servicios.
 * Define el contrato de eventos para comunicación entre servicios.
 */
export const SERVICE_EVENTS = {
  VALIDATION_STARTED: 'validation:started',
  VALIDATION_COMPLETED: 'validation:completed',
  VALIDATION_FAILED: 'validation:failed',
  
  PROCESSING_STARTED: 'processing:started',
  PROCESSING_COMPLETED: 'processing:completed',
  PROCESSING_FAILED: 'processing:failed',
  
  CACHE_HIT: 'cache:hit',
  CACHE_MISS: 'cache:miss',
  CACHE_SET: 'cache:set',
  
  METRICS_UPDATED: 'metrics:updated',
  METRICS_RESET: 'metrics:reset'
};

/**
 * Tipos de error estándar para los servicios.
 */
export const SERVICE_ERROR_TYPES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  METRICS_ERROR: 'METRICS_ERROR',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR'
};

export default {
  IStreamValidationService,
  IStreamProcessingService,
  IStreamCacheService,
  IStreamMetricsService,
  IStreamHandler,
  SERVICE_DEPENDENCIES,
  SERVICE_EVENTS,
  SERVICE_ERROR_TYPES
};