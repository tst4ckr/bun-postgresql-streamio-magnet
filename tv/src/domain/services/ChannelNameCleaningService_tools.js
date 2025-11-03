/**
 * @fileoverview Herramientas auxiliares para ChannelNameCleaningService
 * Contiene funciones puras y utilidades reutilizables para la limpieza de nombres de canales.
 * Elimina información redundante como "FREE", "EVER", "CESAR", etc.
 * 
 * @author Sistema de Limpieza de Nombres de Canales
 * @version 1.0.0
 */

/**
 * Patrones redundantes comunes encontrados en nombres de canales
 */
export const REDUNDANT_PATTERNS = {
  // Patrones de calidad/formato y resolución
  QUALITY_INDICATORS: [
    /\s*\/\s*FREE\s*/gi,
    /\s*FREE\s*/gi,
    /\s*HD\s*/gi,
    /\s*SD\s*/gi,
    /\s*4K\s*/gi,
    /\s*UHD\s*/gi,
    /\s*FHD\s*/gi,
    /\s*\(720p\)\s*/gi,     // (720p)
    /\s*\(1080p\)\s*/gi,    // (1080p)
    /\s*\(480p\)\s*/gi,     // (480p)
    /\s*\(360p\)\s*/gi,     // (360p)
    /\s*AUTO\s*/gi          // AUTO
  ],
  
  // Patrones de nombres/marcas y sufijos específicos
  BRAND_SUFFIXES: [
    /\s*-?\s*CESAR(\s+APAZA)?\s*/gi,
    /\s*-?\s*CESAR\s+APAZA\s*/gi,
    /\s*-?\s*EVER\s*/gi,
    /\s*-?\s*APAZA\s*/gi,
    /\s*-?\s*LINK\s*/gi,
    /\s*-?\s*CARCASI\s*/gi,
    /\s*\[CARCASI\]\s*/gi,      // [CARCASI]
    /\s*\[MIC-FORZA\]\s*/gi,    // [MIC-FORZA]
    /\s*-?\s*IRD\s*/gi,
    /\s*-?\s*NUPLIN\s*/gi,
    /\s*\/\/\s*NUPLIN\s*/gi,    // // NUPLIN
    /\s*-?\s*nuevo\s*$/gi,      // - nuevo (solo al final)
    /\s*-?\s*NUEVO\s*$/gi,      // - NUEVO (solo al final)
    /\s*-?\s*PBO\s*/gi,         // - PBO
    /\s*-?\s*ESA\s*/gi,         // - ESA
    /\s*-?\s*HON\s*/gi,         // - HON
    /\s*70w\s*/gi,              // 70w
    /\s*"\s*F\s*"\s*/gi,        // " F" (con comillas)
    /\s+F\s*$/gi,               // " F" al final del nombre
    /\s*\[Geo-blocked\]\s*/gi,  // [Geo-blocked]
    /\s*\(NG31\)\s*/gi,         // (NG31)
    /\s*\[\s+\]\s*/gi,          // [ ] (corchetes con espacio)
    /\s*\[\s*\]\s*/gi           // Corchetes vacíos []
  ],
  
  // Patrones de separadores y espacios
  SEPARATORS: [
    /\s*-\s*$/g,        // Guiones al final
    /^\s*-\s*/g,        // Guiones al inicio
    /\s+/g,             // Múltiples espacios
    /\s*\/\s*$/g,       // Barras al final
    /^\s*\/\s*/g,       // Barras al inicio
    /\s*\/\/\s*/g,      // Dobles barras
    /\s*\/\s*/g         // Barras con espacios (más general)
  ]
};

/**
 * Limpia el nombre de un canal eliminando patrones redundantes
 * 
 * @param {string} channelName - Nombre del canal a limpiar
 * @returns {string} Nombre limpio sin información redundante
 * @example
 * cleanChannelName("ESPN HD / FREE") // "ESPN"
 * cleanChannelName("CNN EVER-CESAR") // "CNN"
 * cleanChannelName("FOX Sports LINK") // "FOX Sports"
 */
export function cleanChannelName(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return '';
  }

  let cleanedName = channelName.trim();

  // Aplicar limpieza de indicadores de calidad
  REDUNDANT_PATTERNS.QUALITY_INDICATORS.forEach(pattern => {
    cleanedName = cleanedName.replace(pattern, ' ');
  });

  // Aplicar limpieza de sufijos de marca
  REDUNDANT_PATTERNS.BRAND_SUFFIXES.forEach(pattern => {
    cleanedName = cleanedName.replace(pattern, ' ');
  });

  // Aplicar limpieza de separadores y espacios
  REDUNDANT_PATTERNS.SEPARATORS.forEach(pattern => {
    cleanedName = cleanedName.replace(pattern, ' ');
  });

  // Limpieza final: normalizar espacios y trim
  cleanedName = cleanedName
    .replace(/\s+/g, ' ')  // Múltiples espacios a uno solo
    .trim();               // Eliminar espacios al inicio y final

  return cleanedName;
}

/**
 * Limpia múltiples nombres de canales de forma eficiente
 * 
 * @param {string[]} channelNames - Array de nombres de canales
 * @returns {string[]} Array de nombres limpios
 * @example
 * cleanMultipleChannelNames(["ESPN HD", "CNN FREE"]) // ["ESPN", "CNN"]
 */
export function cleanMultipleChannelNames(channelNames) {
  if (!Array.isArray(channelNames)) {
    return [];
  }

  return channelNames.map(name => cleanChannelName(name));
}

/**
 * Verifica si un nombre de canal contiene patrones redundantes
 * 
 * @param {string} channelName - Nombre del canal a verificar
 * @returns {boolean} true si contiene patrones redundantes
 * @example
 * hasRedundantPatterns("ESPN HD FREE") // true
 * hasRedundantPatterns("ESPN") // false
 */
export function hasRedundantPatterns(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return false;
  }

  // Verificar indicadores de calidad
  const hasQualityPatterns = REDUNDANT_PATTERNS.QUALITY_INDICATORS.some(pattern => 
    pattern.test(channelName)
  );

  // Verificar sufijos de marca
  const hasBrandPatterns = REDUNDANT_PATTERNS.BRAND_SUFFIXES.some(pattern => 
    pattern.test(channelName)
  );

  return hasQualityPatterns || hasBrandPatterns;
}

/**
 * Obtiene estadísticas de limpieza para un conjunto de nombres
 * 
 * @param {string[]} channelNames - Array de nombres de canales
 * @returns {Object} Estadísticas de limpieza
 * @example
 * getCleaningStats(["ESPN HD", "CNN", "FOX FREE"])
 * // { total: 3, withRedundantPatterns: 2, cleaningRate: 66.67 }
 */
export function getCleaningStats(channelNames) {
  if (!Array.isArray(channelNames)) {
    return { total: 0, withRedundantPatterns: 0, cleaningRate: 0 };
  }

  const total = channelNames.length;
  const withRedundantPatterns = channelNames.filter(name => hasRedundantPatterns(name)).length;
  const cleaningRate = total > 0 ? (withRedundantPatterns / total) * 100 : 0;

  return {
    total,
    withRedundantPatterns,
    cleaningRate: Math.round(cleaningRate * 100) / 100
  };
}

/**
 * Valida que un nombre limpio sea válido (no vacío después de la limpieza)
 * 
 * @param {string} originalName - Nombre original
 * @param {string} cleanedName - Nombre después de la limpieza
 * @returns {boolean} true si el nombre limpio es válido
 * @example
 * isValidCleanedName("ESPN HD", "ESPN") // true
 * isValidCleanedName("FREE", "") // false
 */
export function isValidCleanedName(originalName, cleanedName) {
  if (!originalName || !cleanedName) {
    return false;
  }

  // El nombre limpio debe tener al menos un carácter alfanumérico
  return /[a-zA-Z0-9]/.test(cleanedName.trim());
}

/**
 * Limpia un nombre de canal con validación de seguridad
 * Si la limpieza resulta en un nombre vacío, retorna el original
 * 
 * @param {string} channelName - Nombre del canal a limpiar
 * @returns {string} Nombre limpio o original si la limpieza falla
 * @example
 * safeCleanChannelName("ESPN HD") // "ESPN"
 * safeCleanChannelName("FREE") // "FREE" (mantiene original)
 */
export function safeCleanChannelName(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return channelName || '';
  }

  const cleanedName = cleanChannelName(channelName);
  
  // Si la limpieza resulta en un nombre inválido, mantener el original
  if (!isValidCleanedName(channelName, cleanedName)) {
    return channelName.trim();
  }

  return cleanedName;
}