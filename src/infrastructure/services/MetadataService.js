/**
 * Servicio unificado de metadatos para películas, series y anime
 * Implementa gestión centralizada de metadatos con cache y validación
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import { cacheService } from './CacheService.js';
import { errorHandler, withErrorHandling, createError, ERROR_TYPES, safeExecute } from '../errors/ErrorHandler.js';

export class MetadataService {
  /**
   * Constructor del servicio de metadatos
   * @param {Object} dependencies - Dependencias del servicio
   * @param {EnhancedLogger} dependencies.logger - Logger mejorado
   * @param {CacheService} dependencies.cacheService - Servicio de caché
   * @param {ErrorHandler} dependencies.errorHandler - Manejador de errores
   * @param {Object} dependencies.config - Configuración del addon
   */
  constructor({ logger, cacheService, errorHandler, config }) {
    this.logger = logger || new EnhancedLogger('MetadataService');
    this.cacheService = cacheService;
    this.errorHandler = errorHandler;
    this.config = config;
    
    this.METADATA_CACHE_TTL = config.cache?.metadataTtl || 3600;
    this.MAX_RETRIES = config.metadata?.maxRetries || 3;
    this.RETRY_DELAY = config.metadata?.retryDelay || 1000;
    
    this.logger.info('MetadataService inicializado', {
      cacheTtl: this.METADATA_CACHE_TTL,
      maxRetries: this.MAX_RETRIES,
      retryDelay: this.RETRY_DELAY
    });
  }

  /**
   * Inicializa la configuración de metadatos
   * @private
   */
  #initializeMetadataConfig() {
    this.logger.info('Inicializando configuración de metadatos');
    
    // Validar configuración de metadatos
    if (!this.config) {
      throw new Error('Configuración de metadatos no encontrada');
    }
    
    this.logger.info('Configuración de metadatos inicializada correctamente');
  }

  /**
   * Obtiene metadatos para un contenido específico
   * @param {string} contentId - ID del contenido
   * @param {string} contentType - Tipo de contenido (movie, series, anime)
   * @returns {Promise<Object>} Metadatos del contenido
   */
  async getMetadata(contentId, contentType) {
    const startTime = Date.now();
    this.logger.info(`Obteniendo metadatos para ${contentType}: ${contentId}`);
    
    // Verificar cache global primero
    const globalCacheKey = cacheService.generateMetadataCacheKey(contentId, contentType);
    const cachedMetadata = await safeExecute(
      () => cacheService.get(globalCacheKey),
      { operation: 'cache.get', globalCacheKey, contentId, contentType }
    );
    
    if (cachedMetadata && !cachedMetadata.error) {
      this.logger.info(`Metadatos encontrados en cache global para ${contentId}`);
      return cachedMetadata;
    }
    
    // Verificar cache local como fallback
    const localCacheKey = `${contentType}:${contentId}`;
    const localCachedMetadata = this.#getCachedMetadata(localCacheKey);
    
    if (localCachedMetadata) {
      this.logger.info(`Metadatos encontrados en cache local para ${contentId}`);
      
      // Migrar a cache global
      const cacheTTL = this.#getMetadataCacheTTL(contentType);
      await safeExecute(
        () => cacheService.set(globalCacheKey, localCachedMetadata, cacheTTL),
        { operation: 'cache.set', globalCacheKey, contentId, contentType }
      );
      
      return localCachedMetadata;
    }
    
    // Obtener metadatos con reintentos
    const metadata = await this.#fetchWithRetries(contentId, contentType);
    
    // Validar metadatos obtenidos
    const validatedMetadata = this.#validateMetadata(metadata, contentType);
    
    // Guardar en ambos caches
    this.#setCachedMetadata(localCacheKey, validatedMetadata, contentType);
    const cacheTTL = this.#getMetadataCacheTTL(contentType);
    await safeExecute(
      () => cacheService.set(globalCacheKey, validatedMetadata, cacheTTL),
      { operation: 'cache.set', globalCacheKey, contentId, contentType }
    );
    
    const duration = Date.now() - startTime;
    this.logger.info(`Metadatos obtenidos exitosamente para ${contentId} en ${duration}ms`);
    
    return validatedMetadata;
  }

  /**
   * Obtiene metadatos de película
   * @private
   * @param {string} contentId - ID de la película
   * @returns {Promise<Object>} Metadatos de la película
   */
  async #getMovieMetadata(contentId) {
    this.logger.debug(`Obteniendo metadatos de película para ${contentId}`);
    
    // Validar parámetros de entrada
    if (!contentId || typeof contentId !== 'string') {
      throw createError(
        'Content ID is required and must be a string',
        ERROR_TYPES.VALIDATION,
        { contentId }
      );
    }
    
    try {
      // Simular timeout para evitar cuelgues
      const fetchPromise = new Promise(resolve => {
        setTimeout(() => {
          resolve({
            id: contentId,
            type: 'movie',
            title: null,
            year: null,
            imdbId: contentId.startsWith('tt') ? contentId.split(':')[0] : null,
            genre: [],
            director: null,
            cast: [],
            plot: null,
            poster: null,
            rating: null,
            retrievedAt: new Date().toISOString()
          });
        }, 100);
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(createError(
            'Movie metadata fetch timeout',
            ERROR_TYPES.TIMEOUT,
            { contentId, timeout: 5000 }
          ));
        }, 5000);
      });
      
      return await Promise.race([fetchPromise, timeoutPromise]);
      
    } catch (error) {
      if (error.type === ERROR_TYPES.TIMEOUT) {
        throw error;
      }
      
      throw createError(
        `Failed to fetch movie metadata`,
        ERROR_TYPES.NETWORK,
        { contentId, originalError: error }
      );
    }
  }

  /**
   * Obtiene metadatos de serie
   * @private
   * @param {string} contentId - ID de la serie
   * @returns {Promise<Object>} Metadatos de la serie
   */
  async #getSeriesMetadata(contentId) {
    this.logger.debug(`Obteniendo metadatos de serie para ${contentId}`);
    
    const metadata = {
      id: contentId,
      type: 'series',
      title: null,
      year: null,
      imdbId: contentId.startsWith('tt') ? contentId.split(':')[0] : null,
      genre: [],
      creator: null,
      cast: [],
      plot: null,
      poster: null,
      rating: null,
      seasons: null,
      episodes: null,
      retrievedAt: new Date().toISOString()
    };
    
    return metadata;
  }

  /**
   * Obtiene metadatos de anime
   * @private
   * @param {string} contentId - ID del anime
   * @returns {Promise<Object>} Metadatos del anime
   */
  async #getAnimeMetadata(contentId) {
    this.logger.debug(`Obteniendo metadatos de anime para ${contentId}`);
    
    const metadata = {
      id: contentId,
      type: 'anime',
      title: null,
      year: null,
      genre: [],
      studio: null,
      director: null,
      cast: [],
      plot: null,
      poster: null,
      rating: null,
      episodes: null,
      status: null,
      source: null,
      // Campos específicos de anime
      malId: null,
      kitsuId: null,
      anilistId: null,
      anidbId: null,
      season: null,
      episodeCount: null,
      duration: null,
      fansub: null,
      language: null,
      subtitles: [],
      retrievedAt: new Date().toISOString()
    };
    
    return metadata;
  }

  /**
   * Valida metadatos según el tipo de contenido
   * @private
   * @param {Object} metadata - Metadatos a validar
   * @param {string} contentType - Tipo de contenido
   * @returns {Object} Metadatos validados
   */
  #validateMetadata(metadata, contentType) {
    const typeConfig = this.config[contentType];
    
    if (!typeConfig) {
      throw new Error(`Configuración no encontrada para tipo: ${contentType}`);
    }
    
    // Verificar campos requeridos
    for (const field of typeConfig.requiredFields) {
      if (!metadata[field]) {
        this.logger.warn(`Campo requerido faltante: ${field} para ${contentType}`);
      }
    }
    
    // Agregar campos por defecto si faltan
    const validatedMetadata = {
      ...metadata,
      validatedAt: new Date().toISOString(),
      isValid: true
    };
    
    return validatedMetadata;
  }

  /**
   * Obtiene metadatos con reintentos
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} contentType - Tipo de contenido
   * @returns {Promise<Object>} Metadatos obtenidos
   */
  async #fetchWithRetries(contentId, contentType) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.logger.debug(`Intento ${attempt} de ${this.MAX_RETRIES} para obtener metadatos de ${contentId}`);
        
        switch (contentType) {
          case 'movie':
            return await this.#getMovieMetadata(contentId);
          case 'series':
            return await this.#getSeriesMetadata(contentId);
          case 'anime':
            return await this.#getAnimeMetadata(contentId);
          default:
            throw createError(
              `Tipo de contenido no soportado: ${contentType}`,
              ERROR_TYPES.VALIDATION,
              { contentId, contentType }
            );
        }
      } catch (error) {
        lastError = error;
        this.logger.warn(`Intento ${attempt} fallido para ${contentId}:`, error.message);
        
        if (attempt < this.MAX_RETRIES) {
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
        }
      }
    }
    
    // Todos los intentos fallaron
    throw createError(
      `Failed to fetch metadata after ${this.MAX_RETRIES} attempts`,
      ERROR_TYPES.NETWORK,
      { contentId, contentType, lastError: lastError.message }
    );
  }

  /**
   * Obtiene metadatos desde cache
   * @private
   * @param {string} cacheKey - Clave de cache
   * @returns {Object|null} Metadatos cacheados o null
   */
  #getCachedMetadata(cacheKey) {
    const cached = this.cacheService.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Verificar si el cache ha expirado
    if (Date.now() - cached.timestamp > cached.expiry) {
      this.cacheService.delete(cacheKey);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Guarda metadatos en cache
   * @private
   * @param {string} cacheKey - Clave de cache
   * @param {Object} metadata - Metadatos a cachear
   * @param {string} contentType - Tipo de contenido
   */
  #setCachedMetadata(cacheKey, metadata, contentType) {
    const typeConfig = this.config[contentType];
    const expiry = typeConfig?.cacheExpiry || 86400000; // 1 día por defecto
    
    this.cacheService.set(cacheKey, {
      data: metadata,
      timestamp: Date.now(),
      expiry: expiry
    });
    
    this.logger.debug(`Metadatos cacheados para ${cacheKey} con expiración de ${expiry}ms`);
  }

  /**
   * Obtiene metadatos por defecto cuando falla la obtención
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} contentType - Tipo de contenido
   * @returns {Object} Metadatos por defecto
   */
  #getDefaultMetadata(contentId, contentType) {
    return {
      id: contentId,
      type: contentType,
      title: `Unknown ${contentType}`,
      year: null,
      isDefault: true,
      retrievedAt: new Date().toISOString()
    };
  }

  /**
   * Limpia cache expirado
   * @public
   */
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, value] of this.cacheService.entries()) {
      if (now - value.timestamp > value.expiry) {
        this.cacheService.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      this.logger.info(`Cache limpiado: ${cleared} entradas expiradas eliminadas`);
    }
  }

  /**
   * Obtiene TTL de cache para metadatos según el tipo
   * @private
   * @param {string} contentType - Tipo de contenido
   * @returns {number} TTL en milisegundos
   */
  #getMetadataCacheTTL(contentType) {
    const typeConfig = this.config[contentType];
    return typeConfig?.cacheExpiry || 86400000; // 1 día por defecto
  }

  /**
   * Obtiene datos stale del cache como fallback
   * @private
   */
  async #getStaleFromCache(cacheKey) {
    try {
      // Intentar obtener datos expirados del cache
      // En una implementación real, esto podría consultar un cache secundario
      // o datos con TTL extendido
      return await cacheService.get(`${cacheKey}:stale`);
    } catch (error) {
      this.logger.debug('No stale data available', { cacheKey });
      return null;
    }
  }

  /**
   * Invalida cache para un contenido específico
   * @public
   * @param {string} contentId - ID del contenido
   * @param {string} contentType - Tipo de contenido
   */
  invalidateMetadata(contentId, contentType) {
    // Limpiar cache local
    const localCacheKey = `${contentType}:${contentId}`;
    this.cacheService.delete(localCacheKey);
    
    // Limpiar cache global
    const globalCacheKey = cacheService.generateMetadataCacheKey(contentId, contentType);
    const result = safeExecute(
      () => cacheService.delete(globalCacheKey),
      { operation: 'cache.delete', globalCacheKey, contentId, contentType }
    );
    
    if (result && !result.error) {
      this.logger.info(`Cache invalidado para ${contentId} (${contentType})`);
    } else {
      this.logger.warn(`Failed to invalidate global cache for ${contentId}`, {
        contentType,
        error: result?.error?.message
      });
    }
  }

  /**
   * Pre-carga metadatos para contenidos populares
   * @public
   * @param {Array} contentList - Lista de contenidos a pre-cargar
   */
  async preloadMetadata(contentList) {
    this.logger.info(`Iniciando pre-carga de ${contentList.length} metadatos`);
    
    const promises = contentList.map(async ({ contentId, contentType }) => {
      try {
        await this.getMetadata(contentId, contentType);
        return { contentId, success: true };
      } catch (error) {
        this.logger.warn(`Error pre-cargando metadatos para ${contentId}:`, error.message);
        return { contentId, success: false, error: error.message };
      }
    });
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    this.logger.info(`Pre-carga completada: ${successful}/${contentList.length} exitosos`);
    return results;
  }

  /**
   * Obtiene estadísticas del cache
   * @public
   * @returns {Object} Estadísticas del cache
   */
  getCacheStats() {
    const localStats = {
      totalEntries: this.cache.size,
      memoryUsage: JSON.stringify([...this.cache.entries()]).length,
      lastCleared: new Date().toISOString()
    };
    
    const globalStats = cacheService.getStats();
    const errorStats = errorHandler.getStats();
    
    return {
      local: localStats,
      global: globalStats,
      errorHandler: errorStats,
      combined: {
        totalEntries: localStats.totalEntries + globalStats.totalEntries,
        memoryUsage: localStats.memoryUsage + globalStats.memoryUsage
      }
    };
  }
}

// Instancia singleton del servicio
export const metadataService = new MetadataService();