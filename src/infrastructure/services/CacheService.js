/**
 * Servicio de cache optimizado para búsquedas frecuentes
 * Implementa cache en memoria con TTL y estrategias de invalidación
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import { CONSTANTS } from '../../config/constants.js';
import { cacheOptimizer } from './CacheOptimizer.js';

export class CacheService {
  constructor() {
    this.logger = new EnhancedLogger('CacheService');
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, clears: 0 };
    
    this.config = {
      defaultTTL: addonConfig.cache?.defaultTTL || 3600000,
      maxSize: addonConfig.cache?.maxSize || CONSTANTS.CACHE.MAX_CACHE_SIZE,
      cleanupInterval: addonConfig.cache?.cleanupInterval || 300000,
      enableStats: addonConfig.cache?.enableStats !== false
    };
    
    this.#startCleanupTimer();
    this.logger.info('CacheService inicializado', this.config);
  }

  /**
   * Obtiene un valor del cache
   * @param {string} key - Clave del cache
   * @returns {*} Valor cacheado o null si no existe o expiró
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.#incrementStat('misses');
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.#incrementStat('misses');
      this.logger.debug(`Cache expirado para clave: ${key}`);
      return null;
    }
    
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.#incrementStat('hits');
    this.logger.debug(`Cache hit para clave: ${key}`);
    
    // Registrar acceso para optimización predictiva
    if (entry.contentType) {
      cacheOptimizer.recordAccess(key, entry.contentType, entry.metadata);
    }
    
    return entry.value;
  }

  /**
   * Establece un valor en el cache
   * @param {string} key - Clave del cache
   * @param {*} value - Valor a cachear
   * @param {number} ttl - Tiempo de vida en milisegundos (opcional)
   * @param {Object} options - Opciones adicionales (contentType, metadata)
   * @returns {boolean} true si se estableció correctamente
   */
  set(key, value, ttl = null, options = {}) {
    try {
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        this.#evictLeastRecentlyUsed();
      }
      
      const actualTTL = ttl || this.config.defaultTTL;
      const entry = {
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + actualTTL,
        lastAccessed: Date.now(),
        accessCount: 0,
        ttl: actualTTL,
        contentType: options.contentType || null,
        metadata: options.metadata || {}
      };
      
      this.cache.set(key, entry);
      this.#incrementStat('sets');
      this.logger.debug(`Valor cacheado para clave: ${key}, TTL: ${actualTTL}ms`, options);
      return true;
      
    } catch (error) {
      this.logger.error(`Error estableciendo cache para clave ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Elimina una entrada del cache
   * @param {string} key - Clave a eliminar
   * @returns {boolean} true si se eliminó
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.#incrementStat('deletes');
      this.logger.debug(`Cache eliminado para clave: ${key}`);
    }
    return deleted;
  }

  /**
   * Limpia todo el cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.#incrementStat('clears');
    this.logger.info(`Cache limpiado completamente: ${size} entradas eliminadas`);
  }

  /**
   * Verifica si una clave existe en el cache y no ha expirado
   * @param {string} key - Clave a verificar
   * @returns {boolean} true si existe y es válida
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Obtiene estadísticas del cache
   * @returns {Object} Estadísticas del cache
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      totalRequests,
      hitRate: `${hitRate}%`,
      currentSize: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage: this.#calculateMemoryUsage()
    };
  }

  /**
   * Limpia entradas expiradas del cache
   * @returns {number} Número de entradas eliminadas
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Limpieza de cache: ${cleaned} entradas expiradas eliminadas`);
    }
    
    return cleaned;
  }



  /**
   * Genera una clave de cache para búsquedas de magnets
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} options - Opciones adicionales
   * @returns {string} Clave de cache generada
   */
  generateMagnetCacheKey(contentId, type, options = {}) {
    const baseKey = `magnets:${type}:${contentId}`;
    
    if (Object.keys(options).length === 0) {
      return baseKey;
    }
    
    // Incluir opciones relevantes en la clave
    const optionsStr = Object.keys(options)
      .sort()
      .map(key => `${key}:${options[key]}`)
      .join('|');
    
    return `${baseKey}:${optionsStr}`;
  }

  /**
   * Genera una clave de cache para metadatos
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @returns {string} Clave de cache generada
   */
  generateMetadataCacheKey(contentId, type) {
    return `metadata:${type}:${contentId}`;
  }

  /**
   * Invalida cache relacionado con un patrón
   * @param {string} pattern - Patrón para invalidar (ej: 'magnets:movie:*')
   * @returns {number} Número de entradas invalidadas
   */
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    let invalidated = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    
    if (invalidated > 0) {
      this.logger.info(`Cache invalidado por patrón '${pattern}': ${invalidated} entradas`);
    }
    
    return invalidated;
  }

  /**
   * Incrementa una estadística
   * @private
   * @param {string} stat - Nombre de la estadística
   */
  #incrementStat(stat) {
    if (this.config.enableStats && this.stats.hasOwnProperty(stat)) {
      this.stats[stat]++;
    }
  }

  /**
   * Elimina la entrada menos recientemente usada
   * @private
   */
  #evictLeastRecentlyUsed() {
    let lruKey = null;
    let lruTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.logger.debug(`LRU eviction: eliminada clave ${lruKey}`);
    }
  }

  /**
   * Calcula el uso aproximado de memoria
   * @private
   * @returns {string} Uso de memoria formateado
   */
  #calculateMemoryUsage() {
    try {
      const serialized = JSON.stringify([...this.cache.entries()]);
      const bytes = new Blob([serialized]).size;
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } catch (error) {
      return 'N/A';
    }
  }

  /**
   * Inicia el timer de limpieza automática
   * @private
   */
  #startCleanupTimer() {
    if (this.config.cleanupInterval > 0) {
      setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
      
      this.logger.debug(`Timer de limpieza iniciado: cada ${this.config.cleanupInterval}ms`);
    }
  }





  /**
   * Genera clave de cache para streams
   * @public
   * @param {string} contentId - ID del contenido
   * @param {string} contentType - Tipo de contenido (movie, series, anime)
   * @param {Object} options - Opciones adicionales
   * @returns {string} Clave de cache
   */
  generateStreamCacheKey(contentId, contentType, options = {}) {
    const { quality = 'all', language = 'es', season, episode } = options;
    const parts = ['stream', contentType, contentId, quality, language];
    
    if (season !== undefined) parts.push(`s${season}`);
    if (episode !== undefined) parts.push(`e${episode}`);
    
    return parts.join(':');
  }

  /**
   * Calcula TTL adaptativo basado en optimizaciones
   * @param {string} contentType - Tipo de contenido
   * @param {number} resultCount - Número de resultados
   * @param {Object} options - Opciones adicionales
   * @returns {number} TTL en milisegundos
   */
  calculateAdaptiveTTL(contentType, resultCount, options = {}) {
    return cacheOptimizer.calculateAdaptiveTTL(contentType, resultCount, options);
  }


}

// Crear instancia singleton
const cacheService = new CacheService();

export { cacheService };