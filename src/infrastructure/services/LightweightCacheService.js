/**
 * @fileoverview LightweightCacheService - Servicio de cache en memoria optimizado para recursos limitados
 * Diseñado para funcionar eficientemente con 512MB de RAM
 */

export class LightweightCacheService {
  constructor(options = {}) {
    this.maxMemoryMB = options.maxMemoryMB || 64; // Máximo 64MB para cache
    this.defaultTtl = options.defaultTtl || 1800; // 30 minutos por defecto
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutos
    this.maxEntries = options.maxEntries || 1000; // Máximo 1000 entradas
    
    // Almacén principal
    this.cache = new Map();
    this.accessTimes = new Map(); // Para LRU
    this.sizes = new Map(); // Tamaños estimados
    
    // Estadísticas
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryUsage: 0
    };
    
    // Iniciar limpieza automática
    this.startCleanupTimer();
  }

  /**
   * Obtiene un valor del cache
   * @param {string} key - Clave del cache
   * @returns {*|null}
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Verificar expiración
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Actualizar tiempo de acceso para LRU
    this.accessTimes.set(key, Date.now());
    this.stats.hits++;
    
    return entry.value;
  }

  /**
   * Establece un valor en el cache
   * @param {string} key - Clave del cache
   * @param {*} value - Valor a cachear
   * @param {number} ttl - Tiempo de vida en segundos
   * @returns {boolean}
   */
  set(key, value, ttl = null) {
    try {
      const actualTtl = ttl || this.defaultTtl;
      const expiresAt = Date.now() + (actualTtl * 1000);
      const estimatedSize = this.estimateSize(value);
      
      // Verificar si necesitamos espacio
      if (this.needsEviction(estimatedSize)) {
        this.evictEntries(estimatedSize);
      }
      
      // Verificar límites después de la evicción
      if (this.cache.size >= this.maxEntries) {
        this.evictLRU(1);
      }
      
      const entry = {
        value,
        expiresAt,
        createdAt: Date.now()
      };
      
      // Eliminar entrada anterior si existe
      if (this.cache.has(key)) {
        this.delete(key);
      }
      
      // Agregar nueva entrada
      this.cache.set(key, entry);
      this.accessTimes.set(key, Date.now());
      this.sizes.set(key, estimatedSize);
      
      this.stats.sets++;
      this.updateMemoryUsage();
      
      return true;
    } catch (error) {
      console.warn(`Error estableciendo cache para clave ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Elimina una entrada del cache
   * @param {string} key - Clave a eliminar
   * @returns {boolean}
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessTimes.delete(key);
      this.sizes.delete(key);
      this.stats.deletes++;
      this.updateMemoryUsage();
    }
    return deleted;
  }

  /**
   * Verifica si una clave existe y no ha expirado
   * @param {string} key - Clave a verificar
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Limpia todas las entradas del cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessTimes.clear();
    this.sizes.clear();
    this.stats.deletes += size;
    this.updateMemoryUsage();
  }

  /**
   * Limpia entradas expiradas
   * @returns {number} - Número de entradas eliminadas
   */
  cleanExpired() {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Obtiene estadísticas del cache
   * @returns {Object}
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      entries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsageMB: Math.round(this.stats.memoryUsage / 1024 / 1024 * 100) / 100,
      maxMemoryMB: this.maxMemoryMB
    };
  }

  /**
   * Obtiene información detallada del cache
   * @returns {Object}
   */
  getInfo() {
    const stats = this.getStats();
    const oldestEntry = this.getOldestEntry();
    const newestEntry = this.getNewestEntry();
    
    return {
      ...stats,
      oldestEntry: oldestEntry ? {
        age: Math.round((Date.now() - oldestEntry.createdAt) / 1000),
        ttl: Math.round((oldestEntry.expiresAt - Date.now()) / 1000)
      } : null,
      newestEntry: newestEntry ? {
        age: Math.round((Date.now() - newestEntry.createdAt) / 1000),
        ttl: Math.round((newestEntry.expiresAt - Date.now()) / 1000)
      } : null
    };
  }

  /**
   * Obtiene todas las claves del cache
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Obtiene el tamaño actual del cache
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  // Métodos privados

  /**
   * Verifica si una entrada ha expirado
   * @param {Object} entry - Entrada del cache
   * @returns {boolean}
   */
  isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Estima el tamaño de un valor en bytes
   * @param {*} value - Valor a estimar
   * @returns {number}
   */
  estimateSize(value) {
    try {
      if (value === null || value === undefined) return 8;
      if (typeof value === 'boolean') return 4;
      if (typeof value === 'number') return 8;
      if (typeof value === 'string') return value.length * 2; // UTF-16
      
      // Para objetos, usar JSON.stringify como estimación
      const jsonString = JSON.stringify(value);
      return jsonString.length * 2 + 100; // Overhead adicional
    } catch {
      return 1024; // Estimación conservadora para valores no serializables
    }
  }

  /**
   * Verifica si necesita evicción para hacer espacio
   * @param {number} newEntrySize - Tamaño de la nueva entrada
   * @returns {boolean}
   */
  needsEviction(newEntrySize) {
    const currentMemoryMB = this.stats.memoryUsage / 1024 / 1024;
    const newEntrySizeMB = newEntrySize / 1024 / 1024;
    
    return (currentMemoryMB + newEntrySizeMB) > this.maxMemoryMB;
  }

  /**
   * Evicta entradas para hacer espacio
   * @param {number} requiredSpace - Espacio requerido en bytes
   */
  evictEntries(requiredSpace) {
    const targetMemoryMB = this.maxMemoryMB * 0.8; // Evictar hasta 80% del límite
    const targetMemoryBytes = targetMemoryMB * 1024 * 1024;
    
    // Primero limpiar expiradas
    this.cleanExpired();
    
    // Si aún necesitamos espacio, usar LRU
    while (this.stats.memoryUsage > targetMemoryBytes && this.cache.size > 0) {
      this.evictLRU(1);
    }
  }

  /**
   * Evicta entradas usando algoritmo LRU
   * @param {number} count - Número de entradas a evictar
   */
  evictLRU(count) {
    // Ordenar por tiempo de acceso (más antiguo primero)
    const sortedByAccess = Array.from(this.accessTimes.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, count);
    
    for (const [key] of sortedByAccess) {
      this.delete(key);
      this.stats.evictions++;
    }
  }

  /**
   * Actualiza el uso de memoria
   */
  updateMemoryUsage() {
    let totalSize = 0;
    for (const size of this.sizes.values()) {
      totalSize += size;
    }
    this.stats.memoryUsage = totalSize;
  }

  /**
   * Obtiene la entrada más antigua
   * @returns {Object|null}
   */
  getOldestEntry() {
    let oldest = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldest = entry;
      }
    }
    
    return oldest;
  }

  /**
   * Obtiene la entrada más nueva
   * @returns {Object|null}
   */
  getNewestEntry() {
    let newest = null;
    let newestTime = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt > newestTime) {
        newestTime = entry.createdAt;
        newest = entry;
      }
    }
    
    return newest;
  }

  /**
   * Inicia el timer de limpieza automática
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      try {
        const cleaned = this.cleanExpired();
        if (cleaned > 0) {
          console.log(`Cache cleanup: ${cleaned} entradas expiradas eliminadas`);
        }
        
        // Verificar uso de memoria y evictar si es necesario
        const memoryUsageMB = this.stats.memoryUsage / 1024 / 1024;
        if (memoryUsageMB > this.maxMemoryMB * 0.9) {
          this.evictLRU(Math.ceil(this.cache.size * 0.1)); // Evictar 10%
          console.log(`Cache eviction: memoria reducida a ${Math.round(this.stats.memoryUsage / 1024 / 1024 * 100) / 100}MB`);
        }
      } catch (error) {
        console.warn('Error en limpieza automática del cache:', error.message);
      }
    }, this.cleanupInterval);
  }

  /**
   * Detiene el timer de limpieza automática
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Destructor para limpiar recursos
   */
  destroy() {
    this.stopCleanupTimer();
    this.clear();
  }
}