/**
 * @fileoverview Herramientas auxiliares para ChannelDeduplicationService
 * Contiene funciones puras y utilidades reutilizables que implementan
 * normalización, detección de patrones de calidad y cálculos de similitud.
 * 
 * @author Sistema de Deduplicación de Canales
 * @version 1.0.0
 */

/**
 * Normaliza el nombre de un canal para comparación eliminando caracteres especiales,
 * espacios extra y convirtiendo a minúsculas.
 * 
 * @param {string} name - Nombre del canal a normalizar
 * @returns {string} Nombre normalizado para comparación
 * @example
 * normalizeChannelName("ESPN HD") // "espnhd"
 * normalizeChannelName("CNN-International") // "cnninternational"
 */
export function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .trim();
  
  // Remover SOLO prefijos numéricos que están claramente separados por guión
  // Preservar números que son parte del nombre del canal (ej: "Fox Sports 2")
  normalized = normalized.replace(/^\d+\s*-\s*/, '');
  
  // Remover sufijos de calidad comunes
  normalized = normalized
    .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
    .replace(/\s+\d+hd$/g, '') // Remover variantes como "6hd"
    .replace(/_hd$/g, '');     // Remover "_hd"
  
  // Normalizar números romanos a arábigos para mejor comparación
  const romanToArabic = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
  };
  
  // Reemplazar números romanos al final del nombre
  normalized = normalized.replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x)$/g, (match, roman) => {
    return ' ' + (romanToArabic[roman] || roman);
  });
  
  // Normalizar variaciones de "canal" (ej: "canal 1", "canal uno" -> "canal 1")
  const numberWords = {
    'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
    'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10',
    'once': '11', 'doce': '12', 'trece': '13', 'catorce': '14', 'quince': '15'
  };
  
  Object.entries(numberWords).forEach(([word, number]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, number);
  });
  
  return normalized.trim();
}

/**
 * Normaliza el nombre de un canal específicamente para detección de patrones de calidad,
 * preservando indicadores HD/SD y números asociados.
 * 
 * @param {string} name - Nombre del canal a normalizar
 * @returns {string} Nombre normalizado preservando patrones de calidad
 * @example
 * normalizeChannelNameForQualityPatterns("ESPN 2HD") // "espn2hd"
 * normalizeChannelNameForQualityPatterns("CNN_SD") // "cnnsd"
 */
export function normalizeChannelNameForQualityPatterns(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    // Remueve patrones HD numerados
    .replace(/\b\d+hd\b/g, '')
    .replace(/\bhd\s*\d+\b/g, '')
    // Remueve patrones SD numerados
    .replace(/\b\d+sd\b/g, '')
    .replace(/\bsd\s*\d+\b/g, '')
    // Remueve indicadores de calidad HD
    .replace(/_hd\b/g, '')       // Remover _hd
    .replace(/\bhd\b/g, '')      // Remover hd como palabra completa
    .replace(/\buhd\b/g, '')     // Remover uhd
    .replace(/\bfhd\b/g, '')     // Remover fhd
    .replace(/\b4k\b/g, '')      // Remover 4k
    // Remueve indicadores de calidad SD y variantes
    .replace(/\bsd(_\w+)?\b/g, '') // Remover sd y variantes como sd_in, sd_out
    .replace(/_sd\b/g, '')       // Remover _sd
    .replace(/\s+/g, ' ')        // Normalizar espacios nuevamente
    .trim();
}

/**
 * Normaliza una URL para comparación eliminando protocolos, www, parámetros
 * y fragmentos, manteniendo solo el dominio y path esenciales.
 * 
 * @param {string} url - URL a normalizar
 * @returns {string} URL normalizada para comparación
 * @example
 * normalizeUrl("https://www.example.com/path?param=1#section") // "example.com/path"
 * normalizeUrl("http://subdomain.site.org/") // "subdomain.site.org"
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Calcula la similitud entre dos strings usando distancia de Levenshtein normalizada.
 * Retorna un valor entre 0 (completamente diferentes) y 1 (idénticos).
 * 
 * @param {string} str1 - Primer string a comparar
 * @param {string} str2 - Segundo string a comparar
 * @returns {number} Valor de similitud entre 0 y 1
 * @example
 * calculateStringSimilarity("ESPN", "ESPN HD") // ~0.75
 * calculateStringSimilarity("CNN", "CNN") // 1.0
 */
export function calculateStringSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // Verificar si ambas cadenas contienen números al final
  const hasNumber1 = /\d+$/.test(str1.trim());
  const hasNumber2 = /\d+$/.test(str2.trim());
  
  // Si ambas tienen números al final, deben ser exactamente iguales para ser consideradas duplicadas
  if (hasNumber1 && hasNumber2) {
    return str1 === str2 ? 1.0 : 0.0;
  }

  // Verificar si uno es subcadena del otro (para casos como "CNN" vs "105-CNN")
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  if (longer.includes(shorter) && shorter.length >= 3) {
    // Si la cadena más corta tiene números al final, ser más estricto
    if (hasNumber1 || hasNumber2) {
      // Solo considerar duplicado si la diferencia es solo prefijos numéricos
      const withoutPrefix = longer.replace(/^\d+/, '');
      if (withoutPrefix === shorter) {
        const lengthRatio = shorter.length / longer.length;
        return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
      }
      return 0.0;
    }
    
    // Bonus por subcadena, pero penalizar por diferencia de longitud
    const lengthRatio = shorter.length / longer.length;
    return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
  }

  // Algoritmo de distancia de Levenshtein normalizada
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  
  return 1 - (distance / maxLength);
}

/**
 * Calcula la distancia de Levenshtein entre dos strings.
 * Representa el número mínimo de operaciones (inserción, eliminación, sustitución)
 * necesarias para transformar un string en otro.
 * 
 * @param {string} str1 - Primer string
 * @param {string} str2 - Segundo string
 * @returns {number} Distancia de Levenshtein (número de operaciones)
 * @example
 * levenshteinDistance("kitten", "sitting") // 3
 * levenshteinDistance("ESPN", "ESPN HD") // 3
 */
export function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Detecta si un canal tiene patrones de calidad (HD, SD, 4K, etc.).
 * 
 * @param {string} name - Nombre del canal a analizar
 * @returns {boolean} true si tiene patrones de calidad, false en caso contrario
 * @example
 * hasQualityPatterns("ESPN HD") // true
 * hasQualityPatterns("CNN") // false
 */
export function hasQualityPatterns(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const lowerName = name.toLowerCase();
  
  // Patrones de calidad específicos (HD y SD)
  const qualityPatterns = [
    /_hd\b/,           // _hd
    /\bhd\b/,          // hd como palabra completa
    /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
    /\buhd\b/,         // uhd
    /\bfhd\b/,         // fhd
    /\b4k\b/,          // 4k
    /\bsd\b/,          // sd como palabra completa
    /_sd\b/,           // _sd
    /\bsd_\w+\b/,      // sd_in, sd_out, etc.
    /\b\d+sd\b/        // variantes numéricas SD (1sd, 2sd, etc.)
  ];
  
  return qualityPatterns.some(pattern => pattern.test(lowerName));
}

/**
 * Detecta si un canal es de alta calidad (HD, 4K, UHD, FHD).
 * 
 * @param {string} name - Nombre del canal a analizar
 * @returns {boolean} true si es de alta calidad, false en caso contrario
 * @example
 * isHighQuality("ESPN HD") // true
 * isHighQuality("CNN SD") // false
 */
export function isHighQuality(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const lowerName = name.toLowerCase();
  
  // Patrones de alta calidad
  const highQualityPatterns = [
    /_hd\b/,           // _hd
    /\bhd\b/,          // hd como palabra completa
    /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
    /\buhd\b/,         // uhd
    /\bfhd\b/,         // fhd
    /\b4k\b/           // 4k
  ];
  
  return highQualityPatterns.some(pattern => pattern.test(lowerName));
}

/**
 * Detecta si un canal es de baja calidad (SD y variantes).
 * 
 * @param {string} name - Nombre del canal a analizar
 * @returns {boolean} true si es de baja calidad, false en caso contrario
 * @example
 * isLowQuality("CNN SD") // true
 * isLowQuality("ESPN HD") // false
 */
export function isLowQuality(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const lowerName = name.toLowerCase();
  
  // Patrones de baja calidad
  const lowQualityPatterns = [
    /\bsd\b/,          // sd como palabra completa
    /_sd\b/,           // _sd
    /\bsd_\w+\b/,      // sd_in, sd_out, etc.
    /\b\d+sd\b/        // variantes numéricas SD (1sd, 2sd, etc.)
  ];
  
  return lowQualityPatterns.some(pattern => pattern.test(lowerName));
}

/**
 * Obtiene el tipo específico de patrón de calidad de un canal.
 * Clasifica el canal según sus indicadores de calidad y numeración.
 * 
 * @param {string} name - Nombre del canal a analizar
 * @returns {string} Tipo de patrón: '4k', 'uhd', 'fhd', 'numbered_hd', '_hd', 'hd_word', 'sd_variant', '_sd', 'numbered_sd', 'sd_word', 'none'
 * @example
 * getQualityPatternType("ESPN 2HD") // "numbered_hd"
 * getQualityPatternType("CNN HD") // "hd_word"
 * getQualityPatternType("FOX") // "none"
 */
export function getQualityPatternType(name) {
  if (!name || typeof name !== 'string') {
    return 'none';
  }
  
  const lowerName = name.toLowerCase();
  
  // Patrones de alta calidad (orden de prioridad)
  if (/\b4k\b/.test(lowerName)) return '4k';
  if (/\buhd\b/.test(lowerName)) return 'uhd';
  if (/\bfhd\b/.test(lowerName)) return 'fhd';
  if (/\b\d+hd\b/.test(lowerName)) return 'numbered_hd';
  if (/_hd\b/.test(lowerName)) return '_hd';
  if (/\bhd\b/.test(lowerName)) return 'hd_word';
  
  // Patrones de baja calidad
  if (/\bsd_\w+\b/.test(lowerName)) return 'sd_variant';
  if (/_sd\b/.test(lowerName)) return '_sd';
  if (/\b\d+sd\b/.test(lowerName)) return 'numbered_sd';
  if (/\bsd\b/.test(lowerName)) return 'sd_word';
  
  return 'none';
}

/**
 * Extrae el número asociado a patrones HD en el nombre del canal.
 * Busca números que preceden o siguen a indicadores HD.
 * 
 * @param {string} name - Nombre del canal
 * @returns {number|null} Número extraído o null si no se encuentra
 * @example
 * extractNumberFromHDPattern("ESPN 2HD") // 2
 * extractNumberFromHDPattern("CNN HD") // null
 */
export function extractNumberFromHDPattern(name) {
  const match = name.toLowerCase().match(/\b(\d+)hd\b/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extrae el número asociado a patrones SD en el nombre del canal.
 * Busca números que preceden o siguen a indicadores SD.
 * 
 * @param {string} name - Nombre del canal
 * @returns {number|null} Número extraído o null si no se encuentra
 * @example
 * extractNumberFromSDPattern("FOX 1SD") // 1
 * extractNumberFromSDPattern("CNN SD") // null
 */
export function extractNumberFromSDPattern(name) {
  const match = name.toLowerCase().match(/\b(\d+)sd\b/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extrae la variante específica de SD del nombre del canal.
 * Identifica variantes como SD_IN, SD_OUT, etc.
 * 
 * @param {string} name - Nombre del canal
 * @returns {string} Tipo de variante SD encontrada
 * @example
 * extractSDVariant("ESPN_SD_IN") // "sd_in"
 * extractSDVariant("CNN_SD_OUT") // "sd_out"
 */
export function extractSDVariant(name) {
  const lowerName = name.toLowerCase();
  
  if (/\bsd_in\b/.test(lowerName)) return 'sd_in';
  if (/\bsd_out\b/.test(lowerName)) return 'sd_out';
  if (/\bsd_hd\b/.test(lowerName)) return 'sd_hd';
  if (/\bsd_\w+\b/.test(lowerName)) {
    const match = lowerName.match(/\bsd_(\w+)\b/);
    return match ? `sd_${match[1]}` : 'sd_default';
  }
  
  return 'sd_default';
}

/**
 * Detecta si un canal tiene patrones HD específicos.
 * Busca indicadores como HD, 4K, UHD, FHD en el nombre.
 * 
 * @param {string} name - Nombre del canal a analizar
 * @returns {boolean} true si tiene patrones HD, false en caso contrario
 * @example
 * hasHDPatterns("ESPN HD") // true
 * hasHDPatterns("CNN SD") // false
 */
export function hasHDPatterns(name) {
  return hasQualityPatterns(name) && isHighQuality(name);
}

/**
 * Obtiene el tipo específico de patrón HD del canal.
 * Clasifica según el tipo de indicador HD encontrado.
 * 
 * @param {string} name - Nombre del canal
 * @returns {string} Tipo de patrón HD: '4k', 'uhd', 'fhd', 'numbered_hd', '_hd', 'hd_word', 'none'
 * @example
 * getHDPatternType("ESPN 4K") // "4k"
 * getHDPatternType("CNN_HD") // "_hd"
 * getHDPatternType("FOX HD") // "hd_word"
 */
export function getHDPatternType(name) {
  const qualityType = getQualityPatternType(name);
  
  // Solo retornar tipos HD
  if (['4k', 'uhd', 'fhd', 'numbered_hd', '_hd', 'hd_word'].includes(qualityType)) {
    return qualityType;
  }
  
  return 'none';
}

/**
 * Normaliza el nombre del canal específicamente para detección de patrones HD.
 * Preserva indicadores HD y números asociados mientras limpia el resto.
 * 
 * @param {string} name - Nombre del canal a normalizar
 * @returns {string} Nombre normalizado para análisis de patrones HD
 * @example
 * normalizeChannelNameForHDPatterns("ESPN 2HD") // "espn2hd"
 * normalizeChannelNameForHDPatterns("CNN_4K") // "cnn4k"
 */
export function normalizeChannelNameForHDPatterns(name) {
  return normalizeChannelNameForQualityPatterns(name);
}

/**
 * Constantes de prioridad para patrones de calidad.
 * Valores más altos indican mayor prioridad en resolución de conflictos.
 * @readonly
 * @enum {number}
 */
export const QUALITY_PATTERN_PRIORITY = {
  /** Canales 4K - máxima prioridad */
  '4k': 100,
  /** Canales UHD */
  'uhd': 95,
  /** Canales FHD */
  'fhd': 90,
  /** Canales HD numerados (ej: ESPN 4HD, 6HD) */
  'numbered_hd': 85,
  /** Canales con sufijo _HD */
  '_hd': 80,
  /** Canales HD como palabra completa */
  'hd_word': 75,
  
  /** Variantes SD específicas (SD_IN, SD_OUT, etc.) */
  'sd_variant': 25,
  /** Canales con sufijo _SD */
  '_sd': 20,
  /** Canales SD numerados (1SD, 2SD, etc.) */
  'numbered_sd': 15,
  /** Canales SD como palabra completa */
  'sd_word': 10,
  
  /** Sin patrón de calidad identificado */
  'none': 0
};

/**
 * Constantes de prioridad para variantes SD específicas.
 * @readonly
 * @enum {number}
 */
export const SD_VARIANT_PRIORITY = {
  /** Variante SD de entrada */
  'sd_in': 30,
  /** Variante SD de salida */
  'sd_out': 25,
  /** Casos híbridos SD/HD */
  'sd_hd': 20,
  /** Variante SD por defecto */
  'sd_default': 10
};