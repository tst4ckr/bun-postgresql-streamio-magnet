/**
 * @fileoverview MemoryOptimizationService_tools - Herramientas auxiliares para optimización de memoria
 * 
 * RESPONSABILIDAD: Funciones utilitarias para pooling, referencias compartidas y lazy loading
 * 
 * Funciones principales:
 * - String pooling y gestión de pools
 * - Creación de referencias compartidas
 * - Aplicación de lazy loading
 * - Medición de memoria y estadísticas
 * 
 * @author Sistema de Optimización de Memoria
 * @version 1.0.0
 */

/**
 * Obtiene un string del pool o lo agrega si no existe
 * @param {string} str - String a poolear
 * @param {Map} stringPool - Pool de strings
 * @param {Object} stats - Estadísticas de pooling
 * @param {Object} config - Configuración del pool
 * @returns {string} String del pool
 */
export function getPooledString(str, stringPool, stats, config) {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }

  if (stringPool.has(str)) {
    stats.stringPoolHits++;
    return stringPool.get(str);
  }

  // Limitar tamaño del pool
  if (stringPool.size >= config.maxStringPoolSize) {
    // Limpiar strings menos usados (implementación simple FIFO)
    const firstKey = stringPool.keys().next().value;
    stringPool.delete(firstKey);
  }

  stringPool.set(str, str);
  stats.stringPoolMisses++;
  return str;
}

/**
 * Optimiza strings duplicados usando string pooling
 * @param {Array<Channel>} channels - Canales a optimizar
 * @param {Map} stringPool - Pool de strings
 * @param {Object} stats - Estadísticas de pooling
 * @param {Object} config - Configuración del servicio
 * @returns {Array<Channel>} Canales con strings optimizados
 */
export function optimizeChannelStrings(channels, stringPool, stats, config) {
  if (!config.enableStringPooling) {
    return channels;
  }

  return channels.map(channel => {
    const optimizedChannel = { ...channel };

    // Optimizar strings comunes
    if (channel.name) {
      optimizedChannel.name = getPooledString(channel.name, stringPool, stats, config);
    }
    if (channel.streamUrl) {
      optimizedChannel.streamUrl = getPooledString(channel.streamUrl, stringPool, stats, config);
    }
    if (channel.genre) {
      optimizedChannel.genre = getPooledString(channel.genre, stringPool, stats, config);
    }
    if (channel.country) {
      optimizedChannel.country = getPooledString(channel.country, stringPool, stats, config);
    }
    if (channel.language) {
      optimizedChannel.language = getPooledString(channel.language, stringPool, stats, config);
    }
    if (channel.logo) {
      optimizedChannel.logo = getPooledString(channel.logo, stringPool, stats, config);
    }

    return optimizedChannel;
  });
}

/**
 * Crea una clave única para objetos similares
 * @param {Channel} channel - Canal para crear la clave
 * @returns {string} Clave única basada en propiedades similares
 */
export function createObjectKey(channel) {
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
 * Crea referencias compartidas para objetos similares
 * @param {Array<Channel>} channels - Canales a optimizar
 * @param {Object} stats - Estadísticas de pooling
 * @param {Object} config - Configuración del servicio
 * @returns {Array<Channel>} Canales con referencias compartidas
 */
export function createSharedReferences(channels, stats, config) {
  if (!config.enableObjectPooling) {
    return channels;
  }

  const sharedObjects = new Map();
  
  return channels.map(channel => {
    // Crear clave para objetos similares basada en propiedades inmutables
    const objectKey = createObjectKey(channel);
    
    if (sharedObjects.has(objectKey)) {
      stats.objectPoolHits++;
      const sharedChannel = sharedObjects.get(objectKey);
      
      // Mantener propiedades únicas pero compartir objetos comunes
      return {
        ...sharedChannel,
        id: channel.id, // ID siempre único
        metadata: channel.metadata // Metadata puede ser única
      };
    }

    sharedObjects.set(objectKey, channel);
    stats.objectPoolMisses++;
    return channel;
  });
}

/**
 * Aplica lazy loading para propiedades pesadas
 * @param {Array<Channel>} channels - Canales a optimizar
 * @param {Object} config - Configuración del servicio
 * @returns {Array<Channel>} Canales con lazy loading aplicado
 */
export function applyLazyLoading(channels, config) {
  if (!config.enableLazyLoading) {
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
 * @returns {number} Memoria en bytes
 */
export function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  
  // Fallback para entornos sin process
  return 0;
}

/**
 * Valida si un array de canales es válido para optimización
 * @param {Array<Channel>} channels - Canales a validar
 * @returns {boolean} True si es válido para optimización
 */
export function validateChannelsForOptimization(channels) {
  return Array.isArray(channels) && channels.length > 0;
}

/**
 * Calcula estadísticas optimizadas de memoria
 * @param {Object} stats - Estadísticas base
 * @param {Map} stringPool - Pool de strings
 * @param {Map} objectPool - Pool de objetos
 * @returns {Object} Estadísticas completas y optimizadas
 */
export function createOptimizedMemoryStats(stats, stringPool, objectPool) {
  return {
    ...stats,
    stringPoolSize: stringPool.size,
    objectPoolSize: objectPool.size,
    stringPoolHitRate: stats.stringPoolHits / (stats.stringPoolHits + stats.stringPoolMisses) || 0,
    objectPoolHitRate: stats.objectPoolHits / (stats.objectPoolHits + stats.objectPoolMisses) || 0,
    memoryFreedMB: (stats.memoryFreed / 1024 / 1024).toFixed(2)
  };
}

/**
 * Limpia pools de memoria de forma segura
 * @param {Map} stringPool - Pool de strings a limpiar
 * @param {Map} objectPool - Pool de objetos a limpiar
 * @param {Object} logger - Logger para registrar la operación
 * @returns {Object} Información sobre la limpieza realizada
 */
export function clearMemoryPools(stringPool, objectPool, logger) {
  const stringPoolSize = stringPool.size;
  const objectPoolSize = objectPool.size;
  
  stringPool.clear();
  objectPool.clear();
  
  const cleanupInfo = {
    stringsCleared: stringPoolSize,
    objectsCleared: objectPoolSize,
    totalCleared: stringPoolSize + objectPoolSize
  };

  logger.debug(`[MemoryOptimization] Pools limpiados: ${stringPoolSize} strings, ${objectPoolSize} objetos`);
  
  return cleanupInfo;
}

/**
 * Resetea estadísticas de memoria a valores iniciales
 * @returns {Object} Estadísticas reseteadas
 */
export function resetMemoryStats() {
  return {
    stringPoolHits: 0,
    stringPoolMisses: 0,
    objectPoolHits: 0,
    objectPoolMisses: 0,
    memoryFreed: 0,
    duplicatesReduced: 0
  };
}

/**
 * Verifica si las optimizaciones están habilitadas
 * @param {Object} config - Configuración del servicio
 * @returns {boolean} True si alguna optimización está habilitada
 */
export function isOptimizationEnabled(config) {
  return config.enableStringPooling || 
         config.enableObjectPooling || 
         config.enableLazyLoading;
}