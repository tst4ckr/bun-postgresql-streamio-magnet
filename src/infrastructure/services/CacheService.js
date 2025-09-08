/**
 * Servicio de cache para optimizar búsquedas frecuentes
 * Implementa cache en memoria con TTL y estrategias de invalidación
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import { CONSTANTS } from '../../config/constants.js';

export class CacheService {
  constructor() {
    this.logger = new EnhancedLogger('CacheService');
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0
    };
    
    // Configuración de cache desde addonConfig
    this.config = {
      defaultTTL: addonConfig.cache?.defaultTTL || 3600000, // 1 hora
      maxSize: addonConfig.cache?.maxSize || CONSTANTS.CACHE.MAX_CACHE_SIZE,
      cleanupInterval: addonConfig.cache?.cleanupInterval || 300000, // 5 minutos
      enableStats: addonConfig.cache?.enableStats !== false
    };
    
    // Inicializar limpieza automática
    this.#startCleanupTimer();
    
    this.logger.info('CacheService inicializado', {
      defaultTTL: this.config.defaultTTL,
      maxSize: this.config.maxSize,
      cleanupInterval: this.config.cleanupInterval
    });
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
    
    // Verificar si ha expirado
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.#incrementStat('misses');
      this.logger.debug(`Cache expirado para clave: ${key}`);
      return null;
    }
    
    // Actualizar último acceso
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    this.#incrementStat('hits');
    this.logger.debug(`Cache hit para clave: ${key}`);
    
    return entry.value;
  }

  /**
   * Establece un valor en el cache
   * @param {string} key - Clave del cache
   * @param {*} value - Valor a cachear
   * @param {number} ttl - Tiempo de vida en milisegundos (opcional)
   * @returns {boolean} true si se estableció correctamente
   */
  set(key, value, ttl = null) {
    try {
      // Verificar límite de tamaño
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
        ttl: actualTTL
      };
      
      this.cache.set(key, entry);
      this.#incrementStat('sets');
      
      this.logger.debug(`Valor cacheado para clave: ${key}, TTL: ${actualTTL}ms`);
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
   * Obtiene información detallada de una entrada del cache
   * @param {string} key - Clave a inspeccionar
   * @returns {Object|null} Información de la entrada o null
   */
  inspect(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    return {
      key,
      hasValue: entry.value !== undefined,
      valueType: typeof entry.value,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      lastAccessed: new Date(entry.lastAccessed).toISOString(),
      accessCount: entry.accessCount,
      ttl: entry.ttl,
      remainingTTL: Math.max(0, entry.expiresAt - now),
      isExpired: now > entry.expiresAt
    };
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
   * Destruye el servicio de cache
   */
  destroy() {
    this.clear();
    this.logger.info('CacheService destruido');
  }

  /**
   * Genera clave de cache para magnets
   * @public
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} options - Opciones adicionales
   * @returns {string} Clave de cache
   */
  generateMagnetCacheKey(contentId, type, options = {}) {
    const optionsHash = this.#generateOptionsHash(options);
    return `magnets:${contentId}:${type}:${optionsHash}`;
  }

  /**
   * Genera hash para opciones de cache
   * @private
   * @param {Object} options - Opciones a hashear
   * @returns {string} Hash de las opciones
   */
  #generateOptionsHash(options) {
    if (!options || Object.keys(options).length === 0) {
      return 'default';
    }
    
    const sortedKeys = Object.keys(options).sort();
    const optionsString = sortedKeys
      .map(key => `${key}:${JSON.stringify(options[key])}`)
      .join('|');
    
    // Generar hash simple basado en el string
    let hash = 0;
    for (let i = 0; i < optionsString.length; i++) {
      const char = optionsString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Genera clave de cache para streams
   * @public
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @returns {string} Clave de cache
   */
  generateStreamCacheKey(contentId, type) {
    return `streams:${contentId}:${type}`;
  }

  /**
   * Genera clave de cache para metadatos
   * @public
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @returns {string} Clave de cache
   */
  generateMetadataCacheKey(contentId, type) {
    return `metadata:${contentId}:${type}`;
  }
}

// Crear instancia singleton
const cacheService = new CacheService();

export { cacheService };