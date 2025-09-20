/**
 * @fileoverview BitelUidService Tools - Funciones auxiliares PURAS para generación de UIDs
 * Contiene ÚNICAMENTE herramientas puras sin lógica de negocio compleja
 * 
 * Principio: Cada función debe ser pura, sin efectos secundarios y fácil de testear
 * 
 * Responsabilidades LIMITADAS a:
 * - Validaciones simples
 * - Generación de valores
 * - Transformaciones de datos
 * - Utilidades de formateo
 */

/**
 * Configuración por defecto para el servicio BITEL
 */
export const DEFAULT_BITEL_CONFIG = {
  cacheExpiry: 20 * 60 * 1000, // 20 minutos
  uidPrefix: '10',
  uidLength: 8,
  domain: 'tv360.bitel.com.pe'
};

/**
 * HERRAMIENTA PURA: Verifica si una URL pertenece a TV360.BITEL
 * @param {string} streamUrl - URL a verificar
 * @param {string} domain - Dominio BITEL
 * @returns {boolean} True si es canal BITEL
 */
export function isBitelChannel(streamUrl, domain = DEFAULT_BITEL_CONFIG.domain) {
  return streamUrl && typeof streamUrl === 'string' && streamUrl.includes(domain);
}

/**
 * HERRAMIENTA PURA: Genera un UID dinámico
 * @param {string} prefix - Prefijo del UID
 * @returns {string} UID generado (formato: prefixXXXXXX)
 */
export function generateDynamicUid(prefix = DEFAULT_BITEL_CONFIG.uidPrefix) {
  const randomPart = Math.floor(Math.random() * 1000000);
  const paddedRandom = randomPart.toString().padStart(6, '0');
  return `${prefix}${paddedRandom}`;
}

/**
 * HERRAMIENTA PURA: Construye URL con parámetro UID
 * @param {string} originalUrl - URL original
 * @param {string} uid - UID a agregar
 * @returns {string} URL con parámetro uid
 */
export function buildUrlWithUid(originalUrl, uid) {
  if (!originalUrl || !uid) {
    throw new Error('URL original y UID son requeridos');
  }

  if (originalUrl.includes('?uid=')) {
    return originalUrl.replace(/\?uid=[^&]*/, `?uid=${uid}`);
  } else if (originalUrl.includes('?')) {
    return `${originalUrl}&uid=${uid}`;
  } else {
    return `${originalUrl}?uid=${uid}`;
  }
}

/**
 * HERRAMIENTA PURA: Verifica si un timestamp ha expirado
 * @param {number} timestamp - Timestamp a verificar
 * @param {number} expiryMs - Tiempo de expiración en milisegundos
 * @returns {boolean} True si ha expirado
 */
export function isTimestampExpired(timestamp, expiryMs) {
  return (Date.now() - timestamp) > expiryMs;
}

/**
 * HERRAMIENTA PURA: Valida configuración del servicio
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada
 */
export function validateBitelConfig(config = {}) {
  const validatedConfig = { ...DEFAULT_BITEL_CONFIG };
  
  if (config.cacheExpiry !== undefined) {
    if (typeof config.cacheExpiry === 'number' && config.cacheExpiry > 0) {
      validatedConfig.cacheExpiry = config.cacheExpiry;
    } else {
      throw new Error('cacheExpiry debe ser un número positivo');
    }
  }
  
  if (config.uidPrefix !== undefined) {
    if (typeof config.uidPrefix === 'string' && config.uidPrefix.length > 0) {
      validatedConfig.uidPrefix = config.uidPrefix;
    } else {
      throw new Error('uidPrefix debe ser una cadena no vacía');
    }
  }
  
  if (config.domain !== undefined) {
    if (typeof config.domain === 'string' && config.domain.length > 0) {
      validatedConfig.domain = config.domain;
    } else {
      throw new Error('domain debe ser una cadena no vacía');
    }
  }
  
  return validatedConfig;
}

/**
 * HERRAMIENTA PURA: Crea mensaje de log formateado
 * @param {string} operation - Tipo de operación
 * @param {string} channelId - ID del canal
 * @param {string} uid - UID generado
 * @returns {string} Mensaje formateado
 */
export function createUidLogMessage(operation, channelId, uid) {
  return `${operation} UID para ${channelId}: ${uid}`;
}

/**
 * HERRAMIENTA PURA: Genera estadísticas de cache
 * @param {number} cacheSize - Tamaño del cache
 * @param {Array} timestamps - Array de timestamps
 * @param {Object} counters - Contadores adicionales
 * @returns {Object} Estadísticas
 */
export function createCacheStats(cacheSize, timestamps = [], counters = {}) {
  return {
    cachedChannels: cacheSize,
    oldestCacheEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
    newestCacheEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    errors: counters.errors || 0,
    totalGenerations: counters.totalGenerations || 0
  };
}

/**
 * HERRAMIENTA PURA: Incrementa un contador
 * @param {Object} stats - Objeto de estadísticas
 * @param {string} counter - Nombre del contador
 * @param {number} increment - Cantidad a incrementar
 * @returns {Object} Estadísticas actualizadas
 */
export function incrementCounter(stats, counter, increment = 1) {
  const updatedStats = { ...stats };
  updatedStats[counter] = (updatedStats[counter] || 0) + increment;
  return updatedStats;
}