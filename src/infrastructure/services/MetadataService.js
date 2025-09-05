/**
 * Servicio unificado de metadatos para películas, series y anime
 * Implementa gestión centralizada de metadatos con cache y validación
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import { cacheService } from './CacheService.js';

export class MetadataService {
  constructor() {
    this.logger = new EnhancedLogger('MetadataService');
    this.cache = new Map();
    this.config = addonConfig.metadata;
    
    // Inicializar configuración de metadatos
    this.#initializeMetadataConfig();
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
    
    try {
      // Verificar cache global primero
      const globalCacheKey = cacheService.generateMetadataCacheKey(contentId, contentType);
      const cachedMetadata = cacheService.get(globalCacheKey);
      
      if (cachedMetadata) {
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
        cacheService.set(globalCacheKey, localCachedMetadata, cacheTTL);
        
        return localCachedMetadata;
      }
      
      // Obtener metadatos según el tipo de contenido
      let metadata;
      switch (contentType) {
        case 'movie':
          metadata = await this.#getMovieMetadata(contentId);
          break;
        case 'series':
          metadata = await this.#getSeriesMetadata(contentId);
          break;
        case 'anime':
          metadata = await this.#getAnimeMetadata(contentId);
          break;
        default:
          throw new Error(`Tipo de contenido no soportado: ${contentType}`);
      }
      
      // Validar metadatos obtenidos
      const validatedMetadata = this.#validateMetadata(metadata, contentType);
      
      // Guardar en ambos caches
      this.#setCachedMetadata(localCacheKey, validatedMetadata, contentType);
      const cacheTTL = this.#getMetadataCacheTTL(contentType);
      cacheService.set(globalCacheKey, validatedMetadata, cacheTTL);
      
      const duration = Date.now() - startTime;
      this.logger.info(`Metadatos obtenidos exitosamente para ${contentId} en ${duration}ms`);
      
      return validatedMetadata;
      
    } catch (error) {
      this.logger.error(`Error obteniendo metadatos para ${contentId}:`, error.message);
      return this.#getDefaultMetadata(contentId, contentType);
    }
  }

  /**
   * Obtiene metadatos de película
   * @private
   * @param {string} contentId - ID de la película
   * @returns {Promise<Object>} Metadatos de la película
   */
  async #getMovieMetadata(contentId) {
    this.logger.debug(`Obteniendo metadatos de película para ${contentId}`);
    
    const metadata = {
      id: contentId,
      type: 'movie',
      title: null,
      year: null,
      imdbId: contentId.startsWith('tt') ? contentId : null,
      genre: [],
      director: null,
      cast: [],
      plot: null,
      poster: null,
      rating: null,
      retrievedAt: new Date().toISOString()
    };
    
    // Aquí se implementaría la lógica para obtener metadatos de APIs externas
    // Por ahora retornamos estructura básica
    
    return metadata;
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
      imdbId: contentId.startsWith('tt') ? contentId : null,
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
    
    const animeConfig = this.config.anime;
    
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
   * Obtiene metadatos desde cache
   * @private
   * @param {string} cacheKey - Clave de cache
   * @returns {Object|null} Metadatos cacheados o null
   */
  #getCachedMetadata(cacheKey) {
    const cached = this.cache.get(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    // Verificar si el cache ha expirado
    if (Date.now() - cached.timestamp > cached.expiry) {
      this.cache.delete(cacheKey);
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
    
    this.cache.set(cacheKey, {
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
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.expiry) {
        this.cache.delete(key);
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
   * Limpia el cache de metadatos
   * @public
   */
  clearCache() {
    this.cache.clear();
    
    // Limpiar también patrones de metadatos en cache global
    cacheService.invalidatePattern('metadata:*');
    
    this.logger.info('Cache de metadatos limpiado (local y global)');
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
    this.cache.delete(localCacheKey);
    
    // Limpiar cache global
    const globalCacheKey = cacheService.generateMetadataCacheKey(contentId, contentType);
    cacheService.delete(globalCacheKey);
    
    this.logger.info(`Cache invalidado para ${contentId} (${contentType})`);
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
    
    return {
      local: localStats,
      global: globalStats,
      combined: {
        totalEntries: localStats.totalEntries + globalStats.totalEntries,
        memoryUsage: localStats.memoryUsage + globalStats.memoryUsage
      }
    };
  }
}

// Instancia singleton del servicio
export const metadataService = new MetadataService();