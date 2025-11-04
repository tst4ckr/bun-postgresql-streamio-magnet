/**
 * @fileoverview M3UTvRepository_tools - Herramientas auxiliares para M3UTvRepository.
 * Funciones puras y utilitarias para el manejo de archivos M3U y utilidades.
 */

import { existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';

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