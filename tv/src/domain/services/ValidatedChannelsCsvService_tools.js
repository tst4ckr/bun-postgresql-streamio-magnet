/**
 * @fileoverview Herramientas para ValidatedChannelsCsvService
 * Centraliza el acceso a variables de entorno y funciones auxiliares
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
 * Obtiene canales prioritarios desde variables de entorno
 * @returns {string[]} Array de nombres de canales prioritarios
 */
export function getPriorityChannelsFromEnv() {
  ensureEnvLoaded();
  const priorityChannelsEnv = process.env.PRIORITY_CHANNELS || '';
  return priorityChannelsEnv
    .split(',')
    .map(name => name.trim().toUpperCase())
    .filter(name => name.length > 0);
}

/**
 * Obtiene orden de categorías desde variables de entorno
 * @returns {string[]} Array de categorías en orden de prioridad
 */
export function getCategoryOrderFromEnv() {
  ensureEnvLoaded();
  const categoryOrderEnv = process.env.CATEGORY_ORDER || '';
  return categoryOrderEnv
    .split(',')
    .map(category => category.trim())
    .filter(category => category.length > 0);
}

/**
 * Obtiene la ruta del archivo CSV validado desde configuración o variables de entorno
 * @param {Object} config - Configuración del servicio
 * @returns {string} Ruta del archivo CSV validado
 */
export function getValidatedChannelsCsvPath(config) {
  ensureEnvLoaded();
  const defaultPath = 'data/tv.csv';
  return config?.csv?.validatedChannelsCsv || 
         process.env.VALIDATED_CHANNELS_CSV || 
         defaultPath;
}