/**
 * @fileoverview StreamHealthService Tools - Herramientas auxiliares para validación de streams
 * 
 * Este módulo contiene funciones puras y utilitarias que implementan la lógica de validación
 * de streams, separadas de la lógica principal del servicio para promover reutilización
 * y facilitar testing.
 */

import axios from 'axios';

/**
 * Calcula el timeout progresivo optimizado para alta latencia
 * @param {number} baseTimeout - Timeout base en segundos
 * @param {number} retryCount - Número de reintentos actuales
 * @returns {number} Timeout en milisegundos
 */
export function calculateProgressiveTimeout(baseTimeout, retryCount) {
  return (baseTimeout + (retryCount * 15)) * 1000;
}

/**
 * Valida si un código de estado HTTP es válido para streams
 * @param {number} status - Código de estado HTTP
 * @returns {boolean} True si el estado es válido para streams
 */
export function isValidStreamStatus(status) {
  return status === 200;
}

/**
 * Valida si un content-type es válido para streams m3u8
 * @param {string} contentType - Content-type del response
 * @returns {boolean} True si el content-type es válido para m3u8
 */
export function isValidM3U8ContentType(contentType) {
  if (!contentType) return false;
  const normalizedType = contentType.toLowerCase();
  return normalizedType.includes('application/vnd.apple.mpegurl') ||
         normalizedType.includes('application/x-mpegurl') ||
         normalizedType.includes('video/mp2t') ||
         normalizedType.includes('text/plain') || // Algunos servidores usan text/plain para m3u8
         normalizedType.includes('application/octet-stream'); // Fallback común
}

/**
 * Determina si un error es reintentable
 * @param {Error} error - Error a evaluar
 * @returns {boolean} True si el error es reintentable
 */
export function isRetryableError(error) {
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
  return retryableCodes.includes(error.code) || 
         (error.response && [502, 503, 504, 408, 429].includes(error.response.status));
}

/**
 * Calcula el tiempo de backoff exponencial optimizado para alta latencia
 * @param {number} retryCount - Número de reintentos
 * @returns {number} Tiempo de backoff en milisegundos
 */
export function calculateBackoffTime(retryCount) {
  return Math.min(2000 * Math.pow(2, retryCount), 10000);
}

/**
 * Crea headers HTTP estándar para validación de streams
 * @returns {Object} Headers HTTP
 */
export function createStreamValidationHeaders() {
  return { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' };
}

/**
 * Realiza una petición HEAD para validar un stream
 * @param {string} url - URL del stream
 * @param {number} timeoutMs - Timeout en milisegundos
 * @param {Object} headers - Headers HTTP
 * @returns {Promise<Object>} Response de axios
 */
export async function performHeadRequest(url, timeoutMs, headers) {
  return axios.head(url, { 
    timeout: timeoutMs, 
    headers, 
    validateStatus: () => true // Permitir todos los códigos para validación manual
  });
}

/**
 * Realiza una petición GET parcial para validar un stream
 * @param {string} url - URL del stream
 * @param {number} timeoutMs - Timeout en milisegundos
 * @param {Object} headers - Headers HTTP
 * @returns {Promise<Object>} Response de axios
 */
export async function performPartialGetRequest(url, timeoutMs, headers) {
  return axios.get(url, {
    timeout: timeoutMs,
    headers: { ...headers, Range: 'bytes=0-1024' },
    responseType: 'arraybuffer',
    validateStatus: () => true // Permitir todos los códigos para validación manual
  });
}

/**
 * Crea un resultado de validación de stream
 * @param {boolean} ok - Si la validación fue exitosa
 * @param {number} status - Código de estado HTTP
 * @param {string} contentType - Content-type del response
 * @param {string} processedUrl - URL procesada
 * @param {number} attempts - Número de intentos realizados
 * @param {string} reason - Razón del fallo (opcional)
 * @returns {Object} Resultado de validación
 */
export function createStreamValidationResult(ok, status, contentType, processedUrl, attempts, reason = undefined) {
  return {
    ok,
    status,
    contentType,
    processedUrl,
    attempts,
    reason
  };
}

/**
 * Crea un resultado de error de validación
 * @param {string} reason - Razón del error
 * @param {string} processedUrl - URL procesada
 * @param {number} attempts - Número de intentos realizados
 * @param {boolean} finalError - Si es un error final
 * @returns {Object} Resultado de error
 */
export function createErrorResult(reason, processedUrl, attempts, finalError = false) {
  return {
    ok: false,
    reason,
    processedUrl,
    attempts,
    finalError
  };
}

/**
 * Calcula el límite de concurrencia adaptativo para alta latencia
 * @param {number} baseConcurrency - Concurrencia base
 * @param {number} channelsLength - Número total de canales
 * @returns {number} Límite de concurrencia calculado
 */
export function calculateConcurrencyLimit(baseConcurrency, channelsLength) {
  return Math.max(2, Math.min(baseConcurrency, Math.ceil(channelsLength / 10)));
}

/**
 * Crea un worker para procesamiento concurrente de canales
 * @param {Function} checkChannelFn - Función para verificar un canal
 * @param {Object} logger - Logger para errores
 * @param {Function} incrementCompleted - Función para incrementar contador
 * @param {number} totalChannels - Total de canales
 * @param {Function} onProgress - Callback de progreso
 * @returns {Function} Función worker
 */
export function createChannelWorker(checkChannelFn, logger, incrementCompleted, totalChannels, onProgress) {
  return async (channel) => {
    try {
      const result = await checkChannelFn(channel);
      const completed = incrementCompleted();
      
      if (onProgress && typeof onProgress === 'function') {
        onProgress({
          completed,
          total: totalChannels,
          percentage: Math.round((completed / totalChannels) * 100),
          current: channel,
          result
        });
      }
      
      return result;
    } catch (error) {
      const completed = incrementCompleted();
      logger.error(`Error validando ${channel.id}: ${error.message}`);
      
      const errorResult = {
        id: channel.id,
        url: channel.url,
        ok: false,
        reason: `VALIDATION_ERROR: ${error.message}`,
        attempts: 1,
        finalError: true
      };
      
      if (onProgress && typeof onProgress === 'function') {
        onProgress({
          completed,
          total: totalChannels,
          percentage: Math.round((completed / totalChannels) * 100),
          current: channel,
          result: errorResult
        });
      }
      
      return errorResult;
    }
  };
}

/**
 * Crea un reporte de validación completo
 * @param {Array} results - Resultados de validación
 * @param {number} totalOk - Total de validaciones exitosas
 * @param {number} totalFail - Total de validaciones fallidas
 * @param {number} batches - Número de lotes procesados (opcional)
 * @returns {Object} Reporte de validación
 */
export function createValidationReport(results, totalOk, totalFail, batches = null) {
  const total = results.length;
  const successRate = total > 0 ? ((totalOk / total) * 100).toFixed(2) : '0.00';
  
  const report = {
    ok: totalOk,
    fail: totalFail,
    total,
    results,
    successRate
  };
  
  if (batches !== null) {
    report.batches = batches;
  }
  
  return report;
}

/**
 * Crea un delay asíncrono
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise<void>} Promise que se resuelve después del delay
 */
export function createDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}