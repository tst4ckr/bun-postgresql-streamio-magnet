/**
 * @fileoverview Herramientas auxiliares para el sistema de filtrado de canales permitidos
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
      console.warn('[ALLOWED_CHANNELS_TOOLS] No se pudieron cargar variables de entorno:', error.message);
    }
  }
}

/**
 * Carga la lista de canales permitidos desde variables de entorno
 * @returns {Array<string>} Lista de canales permitidos
 */
function loadAllowedChannelsFromEnv() {
  ensureEnvLoaded();
  
  const envChannels = process.env.ALLOWED_CHANNELS;
  
  if (envChannels) {
    try {
      // Parsear la lista de canales desde la variable de entorno
      // Formato esperado: "HBO,HBO Plus,ESPN,Discovery Channel"
      return envChannels
        .split(',')
        .map(channel => channel.trim())
        .filter(channel => channel.length > 0);
    } catch (error) {
      console.warn('[ALLOWED_CHANNELS] Error parseando ALLOWED_CHANNELS desde app.conf:', error.message);
      return getDefaultAllowedChannels();
    }
  }
  
  return getDefaultAllowedChannels();
}

/**
 * Obtiene la configuración de canales permitidos desde variables de entorno
 * @returns {Object} Configuración de canales permitidos
 */
function getAllowedChannelsConfigFromEnv() {
  ensureEnvLoaded();
  
  return {
    enableAllowedChannels: process.env.ENABLE_ALLOWED_CHANNELS === 'true'
  };
}

/**
 * Obtiene la lista de canales permitidos por defecto
 * @returns {Array<string>} Lista vacía por defecto
 */
function getDefaultAllowedChannels() {
  return [];
}

export {
  ensureEnvLoaded,
  loadAllowedChannelsFromEnv,
  getDefaultAllowedChannels,
  getAllowedChannelsConfigFromEnv
};