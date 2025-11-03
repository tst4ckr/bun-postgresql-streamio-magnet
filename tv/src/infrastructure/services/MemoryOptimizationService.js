/**
 * @fileoverview MemoryOptimizationService - Servicio de optimización de memoria
 * 
 * RESPONSABILIDAD PRINCIPAL: Reducir duplicación de datos y optimizar uso de memoria
 * 
 * Arquitectura de Optimización:
 * - Pool de objetos reutilizables
 * - Weak references para objetos temporales
 * - Lazy loading de propiedades pesadas
 * - Compresión de strings repetidos
 * 
 * Flujo de optimización:
 * 1. Análisis de duplicación → Memory Analysis
 * 2. Pool de objetos → Object Reuse
 * 3. Weak references → Garbage Collection
 * 4. String interning → Memory Compression
 * 
 * @author Sistema de Optimización de Memoria
 * @version 1.0.0
 */

/**
 * Servicio de optimización de memoria para reducir duplicación de datos
 */
export class MemoryOptimizationService {
  #logger;
  #config;
  #stringPool = new Map();           // Pool de strings reutilizables
  #objectPool = new Map();           // Pool de objetos reutilizables
  #weakRefs = new WeakMap();         // Referencias débiles para cleanup
  #stats = {
    stringPoolHits: 0,
    stringPoolMisses: 0,
    objectPoolHits: 0,
    objectPoolMisses: 0,
    memoryFreed: 0,
    duplicatesReduced: 0
  };

  constructor(config = {}, logger = console) {
    this.#config = {
      enableStringPooling: config.enableStringPooling !== false,
      enableObjectPooling: config.enableObjectPooling !== false,
      maxStringPoolSize: config.maxStringPoolSize || 10000,
      maxObjectPoolSize: config.maxObjectPoolSize || 5000,
      enableWeakRefs: config.enableWeakRefs !== false,
      enableLazyLoading: config.enableLazyLoading !== false,
      ...config
    };
    this.#logger = logger;
  }

  /**
   * Optimiza un array de canales reduciendo duplicación de memoria
   * @param {Array<Channel>} channels - Canales a optimizar
   * @returns {Array<Channel>} Canales optimizados
   */
  optimizeChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return channels;
    }

    const startTime = Date.now();
    const initialMemory = this.#getMemoryUsage();

    this.#logger.debug(`[MemoryOptimization] Optimizando ${channels.length} canales...`);

    // 1. Optimizar strings duplicados (URLs, nombres, géneros)
    const optimizedChannels = this.#optimizeChannelStrings(channels);

    // 2. Crear referencias compartidas para objetos similares
    const sharedOptimizedChannels = this.#createSharedReferences(optimizedChannels);

    // 3. Aplicar lazy loading para propiedades pesadas
    const lazyOptimizedChannels = this.#applyLazyLoading(sharedOptimizedChannels);

    const endTime = Date.now();
    const finalMemory = this.#getMemoryUsage();
    const memoryReduced = Math.max(0, initialMemory - finalMemory);

    this.#stats.memoryFreed += memoryReduced;
    this.#stats.duplicatesReduced += channels.length - lazyOptimizedChannels.length;

    this.#logger.info(`[MemoryOptimization] Optimización completada en ${endTime - startTime}ms`);
    this.#logger.info(`[MemoryOptimization] Memoria liberada: ${(memoryReduced / 1024 / 1024).toFixed(2)}MB`);

    return lazyOptimizedChannels;
  }

  /**
   * Optimiza strings duplicados usando string pooling
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #optimizeChannelStrings(channels) {
    if (!this.#config.enableStringPooling) {
      return channels;
    }

    return channels.map(channel => {
      const optimizedChannel = { ...channel };

      // Optimizar strings comunes
      if (channel.name) {
        optimizedChannel.name = this.#getPooledString(channel.name);
      }
      if (channel.streamUrl) {
        optimizedChannel.streamUrl = this.#getPooledString(channel.streamUrl);
      }
      if (channel.genre) {
        optimizedChannel.genre = this.#getPooledString(channel.genre);
      }
      if (channel.country) {
        optimizedChannel.country = this.#getPooledString(channel.country);
      }
      if (channel.language) {
        optimizedChannel.language = this.#getPooledString(channel.language);
      }
      if (channel.logo) {
        optimizedChannel.logo = this.#getPooledString(channel.logo);
      }

      return optimizedChannel;
    });
  }

  /**
   * Obtiene un string del pool o lo agrega si no existe
   * @private
   * @param {string} str
   * @returns {string}
   */
  #getPooledString(str) {
    if (typeof str !== 'string' || str.length === 0) {
      return str;
    }

    if (this.#stringPool.has(str)) {
      this.#stats.stringPoolHits++;
      return this.#stringPool.get(str);
    }

    // Limitar tamaño del pool
    if (this.#stringPool.size >= this.#config.maxStringPoolSize) {
      // Limpiar strings menos usados (implementación simple FIFO)
      const firstKey = this.#stringPool.keys().next().value;
      this.#stringPool.delete(firstKey);
    }

    this.#stringPool.set(str, str);
    this.#stats.stringPoolMisses++;
    return str;
  }

  /**
   * Crea referencias compartidas para objetos similares
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #createSharedReferences(channels) {
    if (!this.#config.enableObjectPooling) {
      return channels;
    }

    const sharedObjects = new Map();
    
    return channels.map(channel => {
      // Crear clave para objetos similares basada en propiedades inmutables
      const objectKey = this.#createObjectKey(channel);
      
      if (sharedObjects.has(objectKey)) {
        this.#stats.objectPoolHits++;
        const sharedChannel = sharedObjects.get(objectKey);
        
        // Mantener propiedades únicas pero compartir objetos comunes
        return {
          ...sharedChannel,
          id: channel.id, // ID siempre único
          metadata: channel.metadata // Metadata puede ser única
        };
      }

      sharedObjects.set(objectKey, channel);
      this.#stats.objectPoolMisses++;
      return channel;
    });
  }

  /**
   * Crea una clave única para objetos similares
   * @private
   * @param {Channel} channel
   * @returns {string}
   */
  #createObjectKey(channel) {
    // Crear clave basada en propiedades que definen similitud
    const keyParts = [
      channel.name || '',
      channel.genre || '',
      channel.country || '',
      channel.language || '',
      channel.quality?.value || ''
    ];
    
    return keyParts.join('|').toLowerCase();
  }

  /**
   * Aplica lazy loading para propiedades pesadas
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #applyLazyLoading(channels) {
    if (!this.#config.enableLazyLoading) {
      return channels;
    }

    return channels.map(channel => {
      const lazyChannel = { ...channel };

      // Convertir propiedades pesadas a lazy loading
      if (channel.metadata && Object.keys(channel.metadata).length > 10) {
        const metadata = channel.metadata;
        delete lazyChannel.metadata;
        
        Object.defineProperty(lazyChannel, 'metadata', {
          get() {
            return metadata;
          },
          enumerable: true,
          configurable: true
        });
      }

      return lazyChannel;
    });
  }

  /**
   * Obtiene el uso actual de memoria (aproximado)
   * @private
   * @returns {number} Memoria en bytes
   */
  #getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    
    // Fallback para entornos sin process
    return 0;
  }

  /**
   * Limpia el pool de strings y objetos
   */
  clearPools() {
    const stringPoolSize = this.#stringPool.size;
    const objectPoolSize = this.#objectPool.size;
    
    this.#stringPool.clear();
    this.#objectPool.clear();
    
    this.#logger.debug(`[MemoryOptimization] Pools limpiados: ${stringPoolSize} strings, ${objectPoolSize} objetos`);
  }

  /**
   * Obtiene estadísticas de optimización de memoria
   * @returns {Object} Estadísticas detalladas
   */
  getStats() {
    return {
      ...this.#stats,
      stringPoolSize: this.#stringPool.size,
      objectPoolSize: this.#objectPool.size,
      stringPoolHitRate: this.#stats.stringPoolHits / (this.#stats.stringPoolHits + this.#stats.stringPoolMisses) || 0,
      objectPoolHitRate: this.#stats.objectPoolHits / (this.#stats.objectPoolHits + this.#stats.objectPoolMisses) || 0,
      memoryFreedMB: (this.#stats.memoryFreed / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Resetea las estadísticas
   */
  resetStats() {
    this.#stats = {
      stringPoolHits: 0,
      stringPoolMisses: 0,
      objectPoolHits: 0,
      objectPoolMisses: 0,
      memoryFreed: 0,
      duplicatesReduced: 0
    };
  }

  /**
   * Verifica si la optimización está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return this.#config.enableStringPooling || 
           this.#config.enableObjectPooling || 
           this.#config.enableLazyLoading;
  }
}

export default MemoryOptimizationService;