/**
 * @fileoverview M3UTvRepository_tools - Herramientas auxiliares para M3UTvRepository.
 * Funciones puras y utilitarias para el manejo de archivos M3U y utilidades.
 */

import { existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { M3UParser } from '../utils/M3UParser.js';

/**
 * Detecta si una ruta corresponde a un archivo local.
 * @param {string} path - Ruta a verificar
 * @returns {boolean} True si es un archivo local
 */
export function isLocalFile(path) {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Detectar rutas locales (no URLs)
  return !path.startsWith('http://') && 
         !path.startsWith('https://') && 
         !path.startsWith('ftp://');
}

/**
 * Resuelve la ruta absoluta de un archivo local.
 * @param {string} filePath - Ruta del archivo (relativa o absoluta)
 * @returns {string} Ruta absoluta resuelta
 */
export function resolveLocalPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path provided');
  }
  
  // Si ya es absoluta, devolverla tal cual
  if (isAbsolute(filePath)) {
    return filePath;
  }
  
  // Resolver desde el directorio de trabajo actual
  return resolve(process.cwd(), filePath);
}

/**
 * Valida la existencia de un archivo local.
 * @param {string} filePath - Ruta del archivo a validar
 * @returns {boolean} True si el archivo existe
 */
export function validateLocalFile(filePath) {
  try {
    const absolutePath = resolveLocalPath(filePath);
    return existsSync(absolutePath);
  } catch (error) {
    return false;
  }
}

/**
 * Construye el mensaje de error para archivo no encontrado.
 * @param {string} filePath - Ruta del archivo
 * @returns {string} Mensaje de error formateado
 */
export function buildFileNotFoundError(filePath) {
  return `Local M3U file not found: ${filePath}`;
}

/**
 * Valida y parsea el contenido M3U.
 * @param {string} m3uContent - Contenido M3U a procesar
 * @param {Object} logger - Logger para mensajes
 * @returns {Array} Array de canales TV parseados
 * @throws {Error} Si el formato M3U es inválido
 */
export function processM3UContent(m3uContent, logger) {
  if (!M3UParser.isValidM3U(m3uContent)) {
    throw new Error('Invalid M3U format received');
  }

  const tvs = M3UParser.parse(m3uContent);
  logger.debug(`Loaded ${tvs.length} tvs from M3U source`);
  
  return tvs;
}

/**
 * Obtiene el contenido M3U desde una URL remota.
 * @param {string} url - URL remota del archivo M3U
 * @param {Object} logger - Logger para mensajes
 * @returns {Promise<string>} Contenido M3U descargado
 * @throws {Error} Si hay error en la descarga
 */
export async function fetchM3UFromUrl(url, logger) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Stremio-Addon/1.0',
      'Accept': 'application/x-mpegURL, text/plain, */*'
    },
    timeout: 10000
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const content = await response.text();
  logger.debug(`Loaded M3U content from remote URL`);
  
  return content;
}

/**
 * Valida si el caché es válido basándose en el tiempo de expiración.
 * @param {number|null} lastFetch - Timestamp del último fetch
 * @param {number} cacheTimeout - Tiempo de expiración en milisegundos
 * @returns {boolean} True si el caché es válido
 */
export function isCacheValid(lastFetch, cacheTimeout) {
  if (!lastFetch) {
    return false;
  }
  
  const now = Date.now();
  return (now - lastFetch) < cacheTimeout;
}

/**
 * Genera estadísticas a partir de un Map de canales TV.
 * @param {Map} tvsMap - Map con los canales TV
 * @param {number|null} lastFetch - Timestamp del último fetch
 * @returns {Object} Objeto con estadísticas
 */
export function generateTvStats(tvsMap, lastFetch) {
  const total = tvsMap.size;
  const groups = new Set();
  
  tvsMap.forEach(tv => groups.add(tv.group));
  
  return {
    total,
    groups: groups.size,
    groupNames: Array.from(groups).sort(),
    lastUpdated: lastFetch
  };
}

/**
 * Actualiza el Map de canales TV con nuevos datos.
 * @param {Map} tvsMap - Map existente a actualizar
 * @param {Array} tvsArray - Array de nuevos canales TV
 * @returns {void}
 */
export function updateTvMap(tvsMap, tvsArray) {
  tvsMap.clear();
  tvsArray.forEach(tv => {
    tvsMap.set(tv.id, tv);
  });
}