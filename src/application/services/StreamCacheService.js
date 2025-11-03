/**
 * @fileoverview StreamCacheService - Servicio especializado en gestión de cache para streams.
 * Implementa Clean Architecture con Single Responsibility Principle.
 * 
 * Responsabilidades:
 * - Gestión de TTL por tipo de contenido
 * - Creación de respuestas con cache optimizado
 * - Respuestas vacías con cache específico
 * - Respuestas de error con cache adaptativo
 * 
 * @author VeoVeo Development Team
 * @version 1.3.0
 */

import { ERROR_TYPES } from '../../infrastructure/errors/ErrorHandler.js';

/**
 * Servicio de cache para streams de Stremio.
 * Maneja toda la lógica de cache y creación de respuestas optimizadas.
 */
export class StreamCacheService {
  #config;
  #logger;

  /**
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Sistema de logging
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Obtiene el TTL de cache específico por tipo de ID y cantidad de streams.
   * @param {string} idType - Tipo de ID detectado
   * @param {number} streamCount - Cantidad de streams encontrados
   * @returns {number} TTL en segundos
   */
  getCacheTTLByType(idType, streamCount = 0) {
    let baseTTL = this.#config.cache.streamCacheMaxAge;
    
    // Ajustar TTL según el tipo de ID
    switch (idType) {
      case 'kitsu':
      case 'mal':
      case 'anilist':
      case 'anidb':
        baseTTL = this.#config.cache.animeCacheMaxAge;
        break;
      case 'imdb':
      case 'imdb_series':
        baseTTL = this.#config.cache.streamCacheMaxAge;
        break;
      default:
        baseTTL = this.#config.cache.streamCacheMaxAge;
    }
    
    // Ajustar según la cantidad de streams encontrados
    if (streamCount === 0) {
      // Cache más corto para respuestas vacías
      return Math.min(baseTTL, 300); // Máximo 5 minutos
    } else if (streamCount > 10) {
      // Cache más largo para respuestas con muchos streams
      return Math.max(baseTTL, 1800); // Mínimo 30 minutos
    }
    
    return baseTTL;
  }

  /**
   * Crea respuesta de stream con metadatos opcionales y cache optimizado.
   * @param {Array} streams - Lista de streams
   * @param {Object} metadata - Metadatos opcionales del contenido
   * @returns {Object} Respuesta formateada con cache
   */
  createStreamResponse(streams, metadata = null) {
    // Determinar cacheMaxAge específico según el tipo de contenido
    let cacheMaxAge = this.#config.cache.streamCacheMaxAge;
    
    if (metadata?.type) {
      switch (metadata.type) {
        case 'anime':
          cacheMaxAge = this.#config.cache.animeCacheMaxAge;
          break;
        case 'tv':
          cacheMaxAge = this.#config.cache.tvCacheMaxAge;
          break;
        case 'movie':
        case 'series':
        default:
          cacheMaxAge = this.#config.cache.streamCacheMaxAge;
          break;
      }
    }
    
    // Ajustar cache según la cantidad de streams encontrados
    if (streams.length === 0) {
      // Cache más corto para respuestas vacías para permitir reintentos
      cacheMaxAge = Math.min(cacheMaxAge, 300); // Máximo 5 minutos
    } else if (streams.length > 10) {
      // Cache más largo para respuestas con muchos streams
      cacheMaxAge = Math.max(cacheMaxAge, 1800); // Mínimo 30 minutos
    }
    
    // Headers de cache avanzados para optimización de rendimiento
    const response = {
      streams,
      cacheMaxAge,
      // Headers HTTP adicionales para mejor control de cache
      staleRevalidate: cacheMaxAge * 2, // Permitir contenido stale mientras revalida
      staleError: cacheMaxAge * 4, // Servir contenido stale en caso de error
      // Metadatos de respuesta para debugging y monitoreo
      ...(process.env.NODE_ENV === 'development' && {
        _metadata: {
          streamCount: streams.length,
          contentType: metadata?.type || 'unknown',
          idType: metadata?.idType || 'unknown',
          cacheStrategy: streams.length === 0 ? 'short' : streams.length > 10 ? 'long' : 'standard',
          timestamp: new Date().toISOString()
        }
      })
    };
    
    return response;
  }

  /**
   * Crea respuesta vacía con cache optimizado.
   * @param {string} type - Tipo de contenido para determinar cache apropiado
   * @returns {Object} Respuesta vacía con cache
   */
  createEmptyResponse(type = 'movie') {
    // Cache más corto para respuestas vacías para permitir reintentos
    let cacheMaxAge = 300; // 5 minutos por defecto
    
    // Ajustar según el tipo de contenido
    switch (type) {
      case 'anime':
        cacheMaxAge = Math.min(this.#config.cache.animeCacheMaxAge, 600); // Máximo 10 min
        break;
      case 'tv':
        cacheMaxAge = Math.min(this.#config.cache.tvCacheMaxAge, 180); // Máximo 3 min para TV
        break;
      case 'movie':
      case 'series':
      default:
        cacheMaxAge = Math.min(this.#config.cache.streamCacheMaxAge, 300); // Máximo 5 min
        break;
    }
    
    // Headers de cache optimizados para respuestas vacías
    return {
      streams: [],
      cacheMaxAge,
      // Cache headers más agresivos para respuestas vacías
      staleRevalidate: cacheMaxAge * 3, // Permitir más tiempo stale para reintentos
      staleError: cacheMaxAge * 6, // Mayor tolerancia a errores en respuestas vacías
      // Metadatos para debugging en desarrollo
      ...(process.env.NODE_ENV === 'development' && {
        _metadata: {
          streamCount: 0,
          contentType: type,
          cacheStrategy: 'empty-response',
          timestamp: new Date().toISOString()
        }
      })
    };
  }

  /**
   * Crea respuesta de error estandarizada con cache adaptativo.
   * @param {Error} error - Error ocurrido
   * @param {string} type - Tipo de contenido para cache específico
   * @returns {Object} Respuesta de error con cache
   */
  createErrorResponse(error, type = 'movie') {
    this.#logger.error(`Error en stream handler: ${error.message}`);
    
    // Determinar el tiempo de cache basado en el tipo de error
    let cacheMaxAge = 300; // 5 minutos por defecto
    
    if (error.type === ERROR_TYPES.VALIDATION) {
      cacheMaxAge = 60; // 1 minuto para errores de validación
    } else if (error.type === ERROR_TYPES.NETWORK || error.type === ERROR_TYPES.TIMEOUT) {
      cacheMaxAge = 30; // 30 segundos para errores de red
    } else if (error.type === ERROR_TYPES.RATE_LIMIT) {
      cacheMaxAge = 900; // 15 minutos para rate limiting
    }
    
    // Ajustar cache según el tipo de contenido
    switch (type) {
      case 'anime':
        cacheMaxAge = Math.min(cacheMaxAge, this.#config.cache.animeCacheMaxAge);
        break;
      case 'tv':
        cacheMaxAge = Math.min(cacheMaxAge, this.#config.cache.tvCacheMaxAge);
        break;
      case 'movie':
      case 'series':
      default:
        cacheMaxAge = Math.min(cacheMaxAge, this.#config.cache.streamCacheMaxAge);
        break;
    }
    
    // Protocolo Stremio: solo streams y cacheMaxAge
    return {
      streams: [],
      cacheMaxAge
    };
  }

  /**
   * Determina la estrategia de cache basada en el contexto.
   * @param {Object} context - Contexto de la petición
   * @param {string} context.type - Tipo de contenido
   * @param {string} context.idType - Tipo de ID
   * @param {number} context.streamCount - Cantidad de streams
   * @param {boolean} context.hasError - Si hubo error
   * @returns {Object} Estrategia de cache recomendada
   */
  determineCacheStrategy(context) {
    const { type, idType, streamCount, hasError } = context;
    
    if (hasError) {
      return {
        strategy: 'error',
        ttl: this.#getErrorCacheTTL(type),
        reason: 'Error occurred, short cache for retry'
      };
    }
    
    if (streamCount === 0) {
      return {
        strategy: 'empty',
        ttl: this.#getEmptyCacheTTL(type),
        reason: 'No streams found, short cache for retry'
      };
    }
    
    if (streamCount > 10) {
      return {
        strategy: 'long',
        ttl: this.#getLongCacheTTL(type, idType),
        reason: 'Many streams found, long cache for performance'
      };
    }
    
    return {
      strategy: 'standard',
      ttl: this.#getStandardCacheTTL(type, idType),
      reason: 'Standard cache for normal response'
    };
  }

  /**
   * Obtiene TTL para errores.
   * @private
   * @param {string} type - Tipo de contenido
   * @returns {number} TTL en segundos
   */
  #getErrorCacheTTL(type) {
    const baseTTL = type === 'tv' ? 30 : 60;
    return Math.min(baseTTL, this.#config.cache.streamCacheMaxAge);
  }

  /**
   * Obtiene TTL para respuestas vacías.
   * @private
   * @param {string} type - Tipo de contenido
   * @returns {number} TTL en segundos
   */
  #getEmptyCacheTTL(type) {
    switch (type) {
      case 'anime':
        return Math.min(600, this.#config.cache.animeCacheMaxAge);
      case 'tv':
        return Math.min(180, this.#config.cache.tvCacheMaxAge);
      default:
        return Math.min(300, this.#config.cache.streamCacheMaxAge);
    }
  }

  /**
   * Obtiene TTL largo para muchos streams.
   * @private
   * @param {string} type - Tipo de contenido
   * @param {string} idType - Tipo de ID
   * @returns {number} TTL en segundos
   */
  #getLongCacheTTL(type, idType) {
    let baseTTL = this.#config.cache.streamCacheMaxAge;
    
    if (['kitsu', 'mal', 'anilist', 'anidb'].includes(idType)) {
      baseTTL = this.#config.cache.animeCacheMaxAge;
    }
    
    return Math.max(baseTTL, 1800); // Mínimo 30 minutos
  }

  /**
   * Obtiene TTL estándar.
   * @private
   * @param {string} type - Tipo de contenido
   * @param {string} idType - Tipo de ID
   * @returns {number} TTL en segundos
   */
  #getStandardCacheTTL(type, idType) {
    if (['kitsu', 'mal', 'anilist', 'anidb'].includes(idType)) {
      return this.#config.cache.animeCacheMaxAge;
    }
    
    switch (type) {
      case 'tv':
        return this.#config.cache.tvCacheMaxAge;
      default:
        return this.#config.cache.streamCacheMaxAge;
    }
  }
}

export default StreamCacheService;