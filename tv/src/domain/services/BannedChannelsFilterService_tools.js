/**
 * @fileoverview Herramientas auxiliares para BannedChannelsFilterService
 * Centraliza el acceso a variables de entorno para el filtro de canales prohibidos.
 * 
 * @author Sistema de Filtrado de Canales Prohibidos
 * @version 1.0.0
 */

import { EnvLoader } from '../../infrastructure/config/EnvLoader.js';

let envLoaded = false;

/**
 * Asegura que las variables de entorno estén cargadas una sola vez
 */
function ensureEnvLoaded() {
  if (!envLoaded) {
    EnvLoader.getInstance();
    envLoaded = true;
  }
}

/**
 * Obtiene configuración del filtro de canales prohibidos desde variables de entorno
 * @returns {Object} Configuración del filtro de canales prohibidos
 */
export function getBannedChannelsFilterConfigFromEnv() {
  ensureEnvLoaded();
  
  // Función helper para parsear archivos de ignore
  const parseIgnoreFiles = (envVar) => {
    return process.env[envVar] 
      ? process.env[envVar].split(',').map(file => file.trim()).filter(file => file.length > 0)
      : [];
  };

  // Configuración legacy (mantener compatibilidad)
  const ignoreFiles = parseIgnoreFiles('BANNED_CHANNELS_IGNORE_FILES');
  
  // Configuraciones específicas por tipo
  const ignoreFilesForIPs = parseIgnoreFiles('BANNED_IPS_CHANNELS_IGNORE_FILES');
  const ignoreFilesForURLs = parseIgnoreFiles('BANNED_URLS_CHANNELS_IGNORE_FILES');
  const ignoreFilesForChannels = parseIgnoreFiles('BANNED_CHANNELS_CHANNELS_IGNORE_FILES');
  
  return {
    enableBannedChannels: process.env.ENABLE_BANNED_CHANNELS === 'true',
    ignoreFiles: ignoreFiles,
    ignoreFilesForIPs: ignoreFilesForIPs,
    ignoreFilesForURLs: ignoreFilesForURLs,
    ignoreFilesForChannels: ignoreFilesForChannels
  };
}