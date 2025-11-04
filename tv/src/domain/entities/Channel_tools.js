/**
 * @fileoverview Herramientas auxiliares para Channel
 * Centraliza el acceso a variables de entorno para la entidad Channel.
 * 
 * @author Sistema de Entidades de Canal
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
 * Obtiene el logo de respaldo desde variables de entorno
 * @returns {string|null} URL del logo de respaldo o null si no está definido
 */
export function getFallbackLogoFromEnv() {
  ensureEnvLoaded();
  return process.env.FALLBACK_LOGO || null;
}

/**
 * Obtiene los países permitidos desde variables de entorno
 * @returns {string[]|null} Array de países permitidos o null si no está definido
 */
export function getAllowedCountriesFromEnv() {
  ensureEnvLoaded();
  
  if (!process.env.ALLOWED_COUNTRIES) {
    return null;
  }
  
  return process.env.ALLOWED_COUNTRIES
    .split(',')
    .map(country => country.trim())
    .filter(country => country.length > 0);
}