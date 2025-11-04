/**
 * @fileoverview Herramientas auxiliares para AutomaticChannelRepository
 * Centraliza el acceso a las variables de entorno para evitar múltiples llamadas a EnvLoader
 */

import { EnvLoader } from '../config/EnvLoader.js';

// Variable global para controlar si ya se cargaron las variables de entorno
let envLoaded = false;

/**
 * Carga las variables de entorno una sola vez para todo el módulo
 * @returns {void}
 */
function ensureEnvLoaded() {
  if (!envLoaded && !EnvLoader.isLoaded()) {
    try {
      EnvLoader.getInstance();
      envLoaded = true;
    } catch (error) {
      console.warn('[AUTOMATIC_CHANNEL_REPOSITORY_TOOLS] No se pudieron cargar variables de entorno:', error.message);
    }
  }
}

/**
 * Obtiene la configuración de logging desde variables de entorno
 * @returns {Object} Configuración de logging
 */
export function getLoggingConfigFromEnv() {
  ensureEnvLoaded();
  
  return {
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

/**
 * Verifica si se debe hacer logging detallado basado en el número de canales y nivel de log
 * @param {number} channelCount - Número de canales
 * @returns {boolean} True si se debe hacer logging detallado
 */
export function shouldLogDetailed(channelCount) {
  const config = getLoggingConfigFromEnv();
  return channelCount <= 100 || config.logLevel === 'debug';
}