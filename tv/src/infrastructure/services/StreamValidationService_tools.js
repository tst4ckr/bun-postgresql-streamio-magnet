/**
 * @fileoverview StreamValidationService_tools - Herramientas de utilidad para StreamValidationService
 * Contiene funciones auxiliares extraídas para mejorar la organización del código
 */

/**
 * Obtiene un resultado de validación desde el cache
 * @param {Map} validationCache - Cache de validación
 * @param {string} key - Clave del cache
 * @param {number} cacheTimeout - Tiempo de vida del cache en ms
 * @returns {Object|null} Resultado cacheado o null si no existe/expiró
 */
export function getCachedResult(validationCache, key, cacheTimeout) {
  const cached = validationCache.get(key);
  
  if (cached && (Date.now() - cached.timestamp) < cacheTimeout) {
    return cached.result;
  }
  
  return null;
}

/**
 * Establece un resultado de validación en el cache
 * @param {Map} validationCache - Cache de validación
 * @param {string} key - Clave del cache
 * @param {Object} result - Resultado a guardar
 */
export function setCachedResult(validationCache, key, result) {
  validationCache.set(key, {
    result: {
      isValid: result.isValid,
      meta: result.meta
    },
    timestamp: Date.now()
  });

  // Limpiar cache si es muy grande (mantener últimos 1000)
  if (validationCache.size > 1000) {
    const entries = Array.from(validationCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Eliminar los 200 más antiguos
    for (let i = 0; i < 200; i++) {
      validationCache.delete(entries[i][0]);
    }
  }
}

/**
 * Actualiza estadísticas de validación
 * @param {Object} stats - Objeto de estadísticas a actualizar
 * @param {Object} result - Resultado de validación
 * @param {number} processingTime - Tiempo de procesamiento
 */
export function updateStats(stats, result, processingTime) {
  stats.totalProcessed++;
  
  if (result.isValid) {
    stats.validChannels++;
  } else {
    stats.invalidChannels++;
  }
  
  if (result.converted) {
    stats.httpsConverted++;
  }
  
  if (result.isValid && result.converted) {
    stats.httpWorking++;
  }
}

/**
 * Actualiza el estado de validación del canal de manera segura
 * @param {Object} channel - Canal a actualizar
 * @param {boolean} isValid - Estado de validación
 * @returns {Object} Canal con estado actualizado
 */
export function updateChannelValidationStatus(channel, isValid) {
  // Si el canal tiene el método withValidationStatus, usarlo
  if (typeof channel.withValidationStatus === 'function') {
    return channel.withValidationStatus(isValid);
  }
  
  // Si no tiene el método, crear una nueva instancia con las propiedades actualizadas
  return {
    ...channel,
    validationStatus: isValid ? 'valid' : 'invalid',
    isActive: isValid,
    lastValidated: new Date().toISOString()
  };
}

/**
 * Resetea estadísticas de validación
 * @param {Object} stats - Objeto de estadísticas a resetear
 */
export function resetStats(stats) {
  stats.totalProcessed = 0;
  stats.validChannels = 0;
  stats.invalidChannels = 0;
  stats.httpsConverted = 0;
  stats.httpWorking = 0;
  stats.cacheHits = 0;
  stats.processingTime = 0;
}

/**
 * Obtiene estadísticas vacías para un total dado
 * @param {number} total - Total de canales
 * @returns {Object} Objeto de estadísticas inicializado
 */
export function getEmptyStats(total) {
  return {
    totalProcessed: total,
    validChannels: total,
    invalidChannels: 0,
    httpsConverted: 0,
    httpWorking: 0,
    cacheHits: 0,
    processingTime: 0
  };
}

/**
 * Obtiene información detallada del cache de validación
 * @param {Map} validationCache - Cache de validación
 * @param {number} cacheTimeout - Tiempo de vida del cache en ms
 * @returns {Object} Información del cache
 */
export function getCacheInfo(validationCache, cacheTimeout) {
  const entries = Array.from(validationCache.entries());
  const now = Date.now();
  
  const valid = entries.filter(([, data]) => (now - data.timestamp) <= cacheTimeout);
  const expired = entries.length - valid.length;
  
  return {
    totalEntries: entries.length,
    validEntries: valid.length,
    expiredEntries: expired,
    cacheTimeout: cacheTimeout,
    oldestEntry: entries.length > 0 ? Math.min(...entries.map(([, data]) => data.timestamp)) : null,
    newestEntry: entries.length > 0 ? Math.max(...entries.map(([, data]) => data.timestamp)) : null
  };
}

/**
 * Limpia el cache de validación
 * @param {Map} validationCache - Cache de validación
 * @param {Object} logger - Logger para trazabilidad
 */
export function clearCache(validationCache, logger) {
  validationCache.clear();
  logger.info('Cache de validación limpiado');
}