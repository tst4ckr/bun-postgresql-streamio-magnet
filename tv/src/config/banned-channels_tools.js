/**
 * @fileoverview Herramientas auxiliares para el sistema de filtrado de canales prohibidos
 * Centraliza la carga de variables de entorno para evitar múltiples llamadas a EnvLoader
 */

import { EnvLoader } from '../infrastructure/config/EnvLoader.js';

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
      console.warn('[BANNED_CHANNELS_TOOLS] No se pudieron cargar variables de entorno:', error.message);
    }
  }
}

/**
 * Parsea una variable de entorno separada por comas
 * @param {string} envVar - Nombre de la variable de entorno
 * @param {Array} defaultValue - Valor por defecto si la variable no existe
 * @returns {Array} Array parseado de la variable de entorno
 */
function parseEnvArray(envVar, defaultValue = []) {
  ensureEnvLoaded();
  
  const value = process.env[envVar];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Carga la lista de canales prohibidos desde variables de entorno
 * @returns {Array<string>} Lista de canales prohibidos
 */
function loadBannedChannelsFromEnv() {
  ensureEnvLoaded();
  
  const envValue = process.env.BANNED_CHANNELS;
  
  if (!envValue || envValue.trim() === '') {
    console.log('[BANNED_CHANNELS] Variable de entorno no encontrada, usando lista por defecto');
    return getDefaultBannedChannels();
  }
  
  try {
    const channels = envValue.split(',').map(channel => channel.trim()).filter(channel => channel.length > 0);
    console.log(`[BANNED_CHANNELS] Cargados ${channels.length} canales desde variable de entorno`);
    return channels;
  } catch (error) {
    console.error('[BANNED_CHANNELS] Error al parsear variable de entorno:', error.message);
    console.log('[BANNED_CHANNELS] Usando lista por defecto como fallback');
    return getDefaultBannedChannels();
  }
}

/**
 * Obtiene la lista por defecto de canales prohibidos
 * @returns {Array<string>} Lista por defecto de canales prohibidos
 */
function getDefaultBannedChannels() {
  return [];
}

/**
 * Verifica si el filtrado de canales prohibidos está habilitado
 * @returns {boolean} true si está habilitado, false en caso contrario
 */
function isBannedChannelsFilterEnabled() {
  ensureEnvLoaded();
  
  const enabledValue = process.env.ENABLE_BANNED_CHANNELS_FILTER;
  
  if (enabledValue === undefined || enabledValue === null) {
    return true; // Por defecto habilitado
  }
  
  const normalizedValue = enabledValue.toString().toLowerCase().trim();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
}

export {
  ensureEnvLoaded,
  parseEnvArray,
  loadBannedChannelsFromEnv,
  getDefaultBannedChannels,
  isBannedChannelsFilterEnabled
};