/**
 * Sistema de filtrado de canales prohibidos (blacklist)
 * 
 * Este módulo proporciona funcionalidades para filtrar canales basándose en:
 * - Lista de nombres de canal prohibidos
 * - Lista de direcciones IP específicas prohibidas
 * 
 * Se utiliza en conjunto con el sistema de canales permitidos para crear
 * un filtrado de múltiples etapas:
 * 1. Filtrar por canales permitidos (whitelist)
 * 2. Filtrar por canales prohibidos (blacklist) sobre el resultado anterior
 * 3. Filtrar por IPs prohibidas en las URLs de los canales
 */

import { isIP, isIPv4, isIPv6 } from 'net';
import { URL } from 'url';
import { EnvLoader } from '../infrastructure/config/EnvLoader.js';

// Las variables de entorno ya están cargadas desde index.js

/**
 * Carga la lista de canales prohibidos desde variables de entorno
 * @returns {Array<string>} Lista de canales prohibidos
 */
function loadBannedChannelsFromEnv() {
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
  return [
    'ADULT',
    'XXX',
    'PORN',
    'SEX',
    'EROTIC',
    'PLAYBOY',
    'HUSTLER',
    'VIVID',
    'BRAZZERS',
    'NAUGHTY',
    '- Rs',
    'Al',
    'Saudi',
    'Sama',
    'Asharq',
    'Arryadia',
    'Bahrain',
    'Dubai',
    'Ad',
    'Rotana',
    'ksa',
    'libya',
    'tunisia',
    'ien',
    'EXTREME',
    'VIOLENCE',
    'GORE',
    'HORROR',
    'TERROR'
  ];
}

// Lista de canales prohibidos cargada desde variables de entorno
const BANNED_CHANNELS = loadBannedChannelsFromEnv();

// Función para parsear variables de entorno separadas por comas
function parseEnvArray(envVar, defaultValue = []) {
  const value = process.env[envVar];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

// Lista de IPs específicas prohibidas (configurable desde .env)
const BANNED_IPS = parseEnvArray('BANNED_IPS', [
  '127.0.0.1',  // Localhost
  '0.0.0.0',    // Dirección inválida
  '::1'         // Localhost IPv6
]);

// Lista de rangos CIDR prohibidos (configurable desde .env)
const BANNED_IP_RANGES = parseEnvArray('BANNED_IP_RANGES', [
  '10.0.0.0/8',      // RFC 1918 - Redes privadas clase A
  '172.16.0.0/12',   // RFC 1918 - Redes privadas clase B
  '192.168.0.0/16',  // RFC 1918 - Redes privadas clase C
  '::1/128',         // Localhost IPv6
  'fe80::/10'        // RFC 4291 - Link-local IPv6
]);

// Lista de URLs específicas prohibidas (configurable desde .env)
const BANNED_URLS = parseEnvArray('BANNED_URLS', []);

// Lista de dominios prohibidos (configurable desde .env)
const BANNED_DOMAINS = parseEnvArray('BANNED_DOMAINS', []);

// Términos adicionales prohibidos (configurable desde .env)
const CUSTOM_BANNED_TERMS = parseEnvArray('CUSTOM_BANNED_TERMS', []);

// Patrones regex prohibidos (configurable desde .env)
const BANNED_PATTERNS = parseEnvArray('BANNED_PATTERNS', []).map(pattern => {
  try {
    return new RegExp(pattern, 'i');
  } catch (error) {
    console.warn(`Patrón regex inválido ignorado: ${pattern}`);
    return null;
  }
}).filter(pattern => pattern !== null);

/**
 * Normaliza un nombre de canal para comparación
 * @param {string} channelName - Nombre del canal a normalizar
 * @returns {string} Nombre normalizado
 */
function normalizeChannelName(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return '';
  }
  
  return channelName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales excepto espacios
    .replace(/\s+/g, ' ') // Normalizar espacios
    .trim();
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas
 * @param {string} str1 - Primera cadena
 * @param {string} str2 - Segunda cadena
 * @returns {number} Distancia de Levenshtein
 */
function levenshteinDistance(str1, str2) {
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
 * Calcula la similitud entre dos cadenas usando algoritmo mejorado
 * @param {string} str1 - Primera cadena
 * @param {string} str2 - Segunda cadena
 * @returns {number} Similitud entre 0 y 1
 */
function calculateStringSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  // Verificar si una es subcadena de la otra
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  if (longer.includes(shorter) && shorter.length >= 2) {
    const lengthRatio = shorter.length / longer.length;
    return Math.min(0.95, 0.7 + (lengthRatio * 0.25));
  }

  // Algoritmo de distancia de Levenshtein normalizada
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  
  return 1 - (distance / maxLength);
}

/**
 * Verifica si un canal está prohibido usando similitud de 90%
 * @param {string} channelName - Nombre del canal a verificar
 * @param {number} [threshold=0.9] - Umbral de similitud (0-1)
 * @returns {boolean} - true si el canal está prohibido
 */
function isChannelBanned(channelName, threshold = 0.9) {
  if (!channelName || typeof channelName !== 'string') {
    return false;
  }
  
  const normalizedInput = normalizeChannelName(channelName);
  
  if (!normalizedInput) {
    return false;
  }
  
  // Primero verificar coincidencia exacta
  const exactMatch = BANNED_CHANNELS.some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    return normalizedInput === normalizedBanned;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud y contención
  return BANNED_CHANNELS.some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    const similarity = calculateStringSimilarity(normalizedInput, normalizedBanned);
    
    // Verificar si el término prohibido está contenido en el nombre
    // Para términos cortos (<=3 caracteres), requerir coincidencia como palabra completa
    let isContained = false;
    if (normalizedBanned.length <= 3) {
      // Para términos muy cortos, verificar como palabra completa con separadores
      const wordBoundaryRegex = new RegExp(`\\b${normalizedBanned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      isContained = wordBoundaryRegex.test(normalizedInput);
    } else {
      // Para términos más largos, usar contención normal
      isContained = normalizedInput.includes(normalizedBanned) || normalizedBanned.includes(normalizedInput);
    }
    
    return similarity >= threshold || isContained || isContained;
  });
}

/**
 * Verifica si un canal está prohibido con umbral personalizable
 * @param {string} channelName - Nombre del canal a verificar
 * @param {number} threshold - Umbral de similitud (0-1)
 * @returns {boolean} - true si el canal está prohibido
 */
function isChannelBannedWithThreshold(channelName, threshold = 0.9) {
  if (!channelName) {
    return false;
  }
  
  const normalizedInput = normalizeChannelName(channelName);
  
  // Primero verificar coincidencia exacta
  const exactMatch = BANNED_CHANNELS.some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    return normalizedInput === normalizedBanned;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud con umbral personalizado
  return BANNED_CHANNELS.some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    const similarity = calculateStringSimilarity(normalizedInput, normalizedBanned);
    
    // Verificar si el término prohibido está contenido en el nombre
    // Para términos cortos (<=3 caracteres), requerir coincidencia como palabra completa
    let isContained = false;
    if (normalizedBanned.length <= 3) {
      // Para términos muy cortos, verificar como palabra completa con separadores
      const wordBoundaryRegex = new RegExp(`\\b${normalizedBanned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      isContained = wordBoundaryRegex.test(normalizedInput);
    } else {
      // Para términos más largos, usar contención normal
      isContained = normalizedInput.includes(normalizedBanned) || normalizedBanned.includes(normalizedInput);
    }
    
    return similarity >= threshold || isContained;
  });
}

/**
 * Extrae la dirección IP de una URL
 * @param {string} url - URL a analizar
 * @returns {string|null} Dirección IP extraída o null si no es válida
 */
function extractIPFromURL(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  try {
    const parsedURL = new URL(url);
    const hostname = parsedURL.hostname;
    
    // Verificar si el hostname es una dirección IP válida
    if (isIP(hostname)) {
      return hostname;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Verifica si una IP está en un rango CIDR
 * @param {string} ip - Dirección IP a verificar
 * @param {string} cidr - Rango CIDR (ej: '192.168.1.0/24')
 * @returns {boolean} true si la IP está en el rango
 */
function isIPInCIDRRange(ip, cidr) {
  if (!ip || !cidr || typeof ip !== 'string' || typeof cidr !== 'string') {
    return false;
  }
  
  try {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    if (!isIP(network) || isNaN(prefix)) {
      return false;
    }
    
    // Verificar que ambas IPs sean del mismo tipo (IPv4 o IPv6)
    const ipType = isIP(ip);
    const networkType = isIP(network);
    
    if (ipType !== networkType) {
      return false;
    }
    
    if (ipType === 4) {
      return isIPv4InCIDR(ip, network, prefix);
    } else if (ipType === 6) {
      return isIPv6InCIDR(ip, network, prefix);
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica si una IPv4 está en un rango CIDR IPv4
 * @param {string} ip - Dirección IPv4
 * @param {string} network - Red IPv4
 * @param {number} prefix - Longitud del prefijo
 * @returns {boolean} true si está en el rango
 */
function isIPv4InCIDR(ip, network, prefix) {
  const ipToInt = (ipStr) => {
    return ipStr.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  };
  
  const ipInt = ipToInt(ip);
  const networkInt = ipToInt(network);
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
  
  return (ipInt & mask) === (networkInt & mask);
}

/**
 * Verifica si una IPv6 está en un rango CIDR IPv6 (implementación simplificada)
 * @param {string} ip - Dirección IPv6
 * @param {string} network - Red IPv6
 * @param {number} prefix - Longitud del prefijo
 * @returns {boolean} true si está en el rango
 */
function isIPv6InCIDR(ip, network, prefix) {
  // Implementación simplificada para casos comunes
  // Para una implementación completa se requeriría una librería especializada
  
  if (prefix === 128) {
    return ip === network;
  }
  
  // Para rangos comunes como fe80::/10
  if (network === 'fe80::' && prefix === 10) {
    return ip.toLowerCase().startsWith('fe80:');
  }
  
  // Para ::1/128 (loopback)
  if (network === '::1' && prefix === 128) {
    return ip === '::1';
  }
  
  return false;
}

/**
 * Verifica si una IP está prohibida
 * @param {string} ip - Dirección IP a verificar
 * @returns {boolean} true si la IP está prohibida
 */
function isIPBanned(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  
  // Verificar si es una IP válida
  if (!isIP(ip)) {
    return false;
  }
  
  // Verificar en la lista de IPs prohibidas
  if (BANNED_IPS.includes(ip)) {
    return true;
  }
  
  // Verificar en los rangos CIDR prohibidos
  return BANNED_IP_RANGES.some(range => isIPInCIDRRange(ip, range));
}

/**
 * Extrae el dominio de una URL
 * @param {string} url - URL a procesar
 * @returns {string|null} - Dominio extraído o null si no es válido
 */
function extractDomainFromURL(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch (error) {
    return null;
  }
}

/**
 * Verifica si un dominio está prohibido
 * @param {string} domain - Dominio a verificar
 * @returns {boolean} - true si el dominio está prohibido
 */
function isDomainBanned(domain) {
  if (!domain) return false;
  
  const normalizedDomain = domain.toLowerCase();
  
  // Verificar dominios exactos
  if (BANNED_DOMAINS.includes(normalizedDomain)) {
    return true;
  }
  
  // Verificar subdominios
  return BANNED_DOMAINS.some(bannedDomain => {
    return normalizedDomain.endsWith('.' + bannedDomain) || normalizedDomain === bannedDomain;
  });
}

/**
 * Verifica si una URL específica está prohibida
 * @param {string} url - URL a verificar
 * @returns {boolean} - true si la URL está prohibida
 */
function isURLBanned(url) {
  if (!url) return false;
  
  const normalizedURL = url.toLowerCase();
  
  // Verificar URLs exactas
  return BANNED_URLS.some(bannedURL => {
    return normalizedURL.includes(bannedURL.toLowerCase());
  });
}

/**
 * Verifica si el nombre del canal coincide con patrones regex prohibidos
 * @param {string} channelName - Nombre del canal
 * @returns {boolean} - true si coincide con algún patrón prohibido
 */
function isChannelNameMatchingPatterns(channelName) {
  if (!channelName || BANNED_PATTERNS.length === 0) return false;
  
  return BANNED_PATTERNS.some(pattern => pattern.test(channelName));
}

/**
 * Verifica si el nombre del canal contiene términos personalizados prohibidos
 * @param {string} channelName - Nombre del canal
 * @returns {boolean} - true si contiene términos prohibidos
 */
function isChannelNameContainingCustomTerms(channelName) {
  if (!channelName || CUSTOM_BANNED_TERMS.length === 0) return false;
  
  const normalizedName = normalizeChannelName(channelName);
  
  return CUSTOM_BANNED_TERMS.some(term => {
    const normalizedTerm = normalizeChannelName(term);
    return normalizedName.includes(normalizedTerm);
  });
}

/**
 * Verifica si la URL de un canal contiene una IP prohibida
 * @param {string} url - URL del canal
 * @returns {boolean} true si contiene una IP prohibida
 */
function isChannelURLBanned(url) {
  const ip = extractIPFromURL(url);
  return ip ? isIPBanned(ip) : false;
}

/**
 * Verifica si un canal está prohibido por cualquier criterio
 * @param {Object} channel - Objeto del canal con propiedades name y url
 * @returns {boolean} - true si el canal está prohibido
 */
function isChannelBannedByAnyReason(channel) {
  if (!channel) return false;
  
  const { name, url } = channel;
  
  // Verificar por nombre (sistema original)
  if (name && isChannelBanned(name)) {
    return true;
  }
  
  // Verificar por términos personalizados
  if (name && isChannelNameContainingCustomTerms(name)) {
    return true;
  }
  
  // Verificar por patrones regex
  if (name && isChannelNameMatchingPatterns(name)) {
    return true;
  }
  
  if (url) {
    // Verificar por IP prohibida
    if (isChannelURLBanned(url)) {
      return true;
    }
    
    // Verificar por URL específica prohibida
    if (isURLBanned(url)) {
      return true;
    }
    
    // Verificar por dominio prohibido
    const domain = extractDomainFromURL(url);
    if (domain && isDomainBanned(domain)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Filtra una lista de canales para remover los prohibidos (nombres, IPs, URLs, dominios, etc.)
 * @param {Array} channels - Array de canales a filtrar
 * @returns {Array} Array de canales filtrados (sin los prohibidos)
 */
function filterBannedChannels(channels) {
  if (!Array.isArray(channels)) {
    return [];
  }
  
  return channels.filter(channel => {
    if (!channel || typeof channel !== 'object') {
      return false;
    }
    
    // Usar la función unificada de verificación
    return !isChannelBannedByAnyReason(channel);
  });
}

/**
 * Obtiene la lista actual de canales prohibidos
 * @returns {Array<string>} Lista de canales prohibidos
 */
function getBannedTerms() {
  return [...BANNED_CHANNELS];
}

/**
 * Obtiene la lista actual de canales prohibidos (alias)
 * @returns {Array<string>} Lista de canales prohibidos
 */
function getBannedChannels() {
  return [...BANNED_CHANNELS];
}

/**
 * Establece el umbral de similitud por defecto
 * @param {number} threshold - Nuevo umbral (0-1)
 */
function setSimilarityThreshold(threshold) {
  if (threshold >= 0 && threshold <= 1) {
    console.log(`[BANNED_CHANNELS] Umbral de similitud establecido a: ${threshold}`);
  }
}

/**
 * Obtiene todas las IPs prohibidas
 * @returns {Array} Array de IPs prohibidas
 */
function getBannedIPs() {
  return [...BANNED_IPS];
}

/**
 * Obtiene todos los rangos CIDR prohibidos
 * @returns {Array} Array de rangos CIDR prohibidos
 */
function getBannedIPRanges() {
  return [...BANNED_IP_RANGES];
}

/**
 * Agrega un nuevo término a la lista de prohibidos
 * @param {string} term - Término a agregar
 */
function addBannedTerm(term) {
  if (typeof term === 'string' && term.trim()) {
    const normalizedTerm = normalizeChannelName(term);
    if (!BANNED_CHANNELS.some(banned => normalizeChannelName(banned) === normalizedTerm)) {
      BANNED_CHANNELS.push(term.trim().toUpperCase());
    }
  }
}

/**
 * Agrega una nueva IP a la lista de prohibidas
 * @param {string} ip - Dirección IP a agregar
 * @returns {boolean} true si se agregó exitosamente, false si no es válida
 */
function addBannedIP(ip) {
  if (typeof ip === 'string' && ip.trim()) {
    const trimmedIP = ip.trim();
    
    // Verificar si es una IP válida
    if (!isIP(trimmedIP)) {
      return false;
    }
    
    // Verificar si ya existe
    if (!BANNED_IPS.includes(trimmedIP)) {
      BANNED_IPS.push(trimmedIP);
      return true;
    }
  }
  return false;
}

/**
 * Agrega un nuevo rango CIDR a la lista de prohibidos
 * @param {string} cidr - Rango CIDR a agregar (ej: '192.168.1.0/24')
 * @returns {boolean} true si se agregó exitosamente, false si no es válido
 */
function addBannedIPRange(cidr) {
  if (typeof cidr === 'string' && cidr.trim()) {
    const trimmedCIDR = cidr.trim();
    
    // Verificar formato CIDR básico
    const [network, prefix] = trimmedCIDR.split('/');
    if (!network || !prefix || !isIP(network) || isNaN(parseInt(prefix, 10))) {
      return false;
    }
    
    // Verificar si ya existe
    if (!BANNED_IP_RANGES.includes(trimmedCIDR)) {
      BANNED_IP_RANGES.push(trimmedCIDR);
      return true;
    }
  }
  return false;
}

/**
 * Remueve un término de la lista de prohibidos
 * @param {string} term - Término a remover
 */
function removeBannedTerm(term) {
  if (typeof term === 'string' && term.trim()) {
    const normalizedTerm = normalizeChannelName(term);
    const index = BANNED_CHANNELS.findIndex(banned => normalizeChannelName(banned) === normalizedTerm);
    if (index > -1) {
      BANNED_CHANNELS.splice(index, 1);
    }
  }
}

/**
 * Remueve una IP de la lista de prohibidas
 * @param {string} ip - Dirección IP a remover
 * @returns {boolean} true si se removió exitosamente
 */
function removeBannedIP(ip) {
  if (typeof ip === 'string' && ip.trim()) {
    const trimmedIP = ip.trim();
    const index = BANNED_IPS.indexOf(trimmedIP);
    if (index > -1) {
      BANNED_IPS.splice(index, 1);
      return true;
    }
  }
  return false;
}

/**
 * Remueve un rango CIDR de la lista de prohibidos
 * @param {string} cidr - Rango CIDR a remover
 * @returns {boolean} true si se removió exitosamente
 */
function removeBannedIPRange(cidr) {
  if (typeof cidr === 'string' && cidr.trim()) {
    const trimmedCIDR = cidr.trim();
    const index = BANNED_IP_RANGES.indexOf(trimmedCIDR);
    if (index > -1) {
      BANNED_IP_RANGES.splice(index, 1);
      return true;
    }
  }
  return false;
}

// ===================================
// GESTIÓN DE URLs PROHIBIDAS
// ===================================

/**
 * Obtiene la lista actual de URLs prohibidas
 * @returns {Array} - Array de URLs prohibidas
 */
function getBannedURLs() {
  return [...BANNED_URLS];
}

/**
 * Agrega una URL a la lista de prohibidas
 * @param {string} url - URL a agregar
 * @returns {boolean} - true si se agregó exitosamente
 */
function addBannedURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const normalizedURL = url.trim();
  if (normalizedURL && !BANNED_URLS.includes(normalizedURL)) {
    BANNED_URLS.push(normalizedURL);
    return true;
  }
  return false;
}

/**
 * Remueve una URL de la lista de prohibidas
 * @param {string} url - URL a remover
 * @returns {boolean} - true si se removió exitosamente
 */
function removeBannedURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const index = BANNED_URLS.indexOf(url.trim());
  if (index > -1) {
    BANNED_URLS.splice(index, 1);
    return true;
  }
  return false;
}

// ===================================
// GESTIÓN DE DOMINIOS PROHIBIDOS
// ===================================

/**
 * Obtiene la lista actual de dominios prohibidos
 * @returns {Array} - Array de dominios prohibidos
 */
function getBannedDomains() {
  return [...BANNED_DOMAINS];
}

/**
 * Agrega un dominio a la lista de prohibidos
 * @param {string} domain - Dominio a agregar
 * @returns {boolean} - true si se agregó exitosamente
 */
function addBannedDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const normalizedDomain = domain.trim().toLowerCase();
  if (normalizedDomain && !BANNED_DOMAINS.includes(normalizedDomain)) {
    BANNED_DOMAINS.push(normalizedDomain);
    return true;
  }
  return false;
}

/**
 * Remueve un dominio de la lista de prohibidos
 * @param {string} domain - Dominio a remover
 * @returns {boolean} - true si se removió exitosamente
 */
function removeBannedDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const normalizedDomain = domain.trim().toLowerCase();
  const index = BANNED_DOMAINS.indexOf(normalizedDomain);
  if (index > -1) {
    BANNED_DOMAINS.splice(index, 1);
    return true;
  }
  return false;
}

// ===================================
// GESTIÓN DE TÉRMINOS PERSONALIZADOS
// ===================================

/**
 * Obtiene la lista actual de términos personalizados prohibidos
 * @returns {Array} - Array de términos prohibidos
 */
function getCustomBannedTerms() {
  return [...CUSTOM_BANNED_TERMS];
}

/**
 * Agrega un término personalizado a la lista de prohibidos
 * @param {string} term - Término a agregar
 * @returns {boolean} - true si se agregó exitosamente
 */
function addCustomBannedTerm(term) {
  if (!term || typeof term !== 'string') {
    return false;
  }

  const normalizedTerm = term.trim();
  if (normalizedTerm && !CUSTOM_BANNED_TERMS.includes(normalizedTerm)) {
    CUSTOM_BANNED_TERMS.push(normalizedTerm);
    return true;
  }
  return false;
}

/**
 * Remueve un término personalizado de la lista de prohibidos
 * @param {string} term - Término a remover
 * @returns {boolean} - true si se removió exitosamente
 */
function removeCustomBannedTerm(term) {
  if (!term || typeof term !== 'string') {
    return false;
  }

  const index = CUSTOM_BANNED_TERMS.indexOf(term.trim());
  if (index > -1) {
    CUSTOM_BANNED_TERMS.splice(index, 1);
    return true;
  }
  return false;
}

// ===================================
// GESTIÓN DE PATRONES REGEX
// ===================================

/**
 * Obtiene la lista actual de patrones regex prohibidos
 * @returns {Array} - Array de patrones regex como strings
 */
function getBannedPatterns() {
  return BANNED_PATTERNS.map(pattern => pattern.source);
}

/**
 * Agrega un patrón regex a la lista de prohibidos
 * @param {string} pattern - Patrón regex como string
 * @returns {boolean} - true si se agregó exitosamente
 */
function addBannedPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }

  try {
    const regex = new RegExp(pattern, 'i');
    const patternExists = BANNED_PATTERNS.some(existingPattern => 
      existingPattern.source === regex.source
    );
    
    if (!patternExists) {
      BANNED_PATTERNS.push(regex);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Patrón regex inválido: ${pattern}`);
    return false;
  }
}

/**
 * Remueve un patrón regex de la lista de prohibidos
 * @param {string} pattern - Patrón regex como string
 * @returns {boolean} - true si se removió exitosamente
 */
function removeBannedPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }

  const index = BANNED_PATTERNS.findIndex(regex => regex.source === pattern);
  if (index > -1) {
    BANNED_PATTERNS.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Aplica filtrado de dos etapas: primero allowed, luego banned
 * NOTA: Los repositorios implementan esto directamente importando ambos filtros
 * @param {Array} channels - Array de canales a filtrar
 * @returns {Array} Array de canales filtrados por ambos sistemas
 * @deprecated - Usar filterAllowedChannels y filterBannedChannels directamente
 */
function applyTwoStageFiltering(channels) {
  console.warn('applyTwoStageFiltering está obsoleto. Usar filterAllowedChannels → filterBannedChannels');
  return channels;
}

export {
  // Constantes principales
  BANNED_CHANNELS,
  BANNED_IPS,
  BANNED_IP_RANGES,
  BANNED_URLS,
  BANNED_DOMAINS,
  CUSTOM_BANNED_TERMS,
  BANNED_PATTERNS,
  
  // Funciones de carga y configuración
  loadBannedChannelsFromEnv,
  getDefaultBannedChannels,
  
  // Funciones de normalización y verificación
  normalizeChannelName,
  isChannelBanned,
  isChannelBannedWithThreshold,
  
  // Funciones de similitud
  levenshteinDistance,
  calculateStringSimilarity,
  setSimilarityThreshold,
  
  // Funciones de manejo de IPs
  extractIPFromURL,
  isIPInCIDRRange,
  isIPv4InCIDR,
  isIPv6InCIDR,
  isIPBanned,
  isChannelURLBanned,
  
  // Funciones de manejo de dominios
  extractDomainFromURL,
  isDomainBanned,
  isURLBanned,
  
  // Funciones de patrones y términos personalizados
  isChannelNameMatchingPatterns,
  isChannelNameContainingCustomTerms,
  isChannelBannedByAnyReason,
  
  // Funciones de filtrado
  filterBannedChannels,
  
  // Funciones de gestión de términos prohibidos
  getBannedTerms,
  getBannedChannels,
  addBannedTerm,
  removeBannedTerm,
  
  // Funciones de gestión de IPs prohibidas
  getBannedIPs,
  getBannedIPRanges,
  addBannedIP,
  addBannedIPRange,
  removeBannedIP,
  removeBannedIPRange,
  
  // Funciones de gestión de URLs prohibidas
  getBannedURLs,
  addBannedURL,
  removeBannedURL,
  
  // Funciones de gestión de dominios prohibidos
  getBannedDomains,
  addBannedDomain,
  removeBannedDomain,
  
  // Funciones de gestión de términos personalizados
  getCustomBannedTerms,
  addCustomBannedTerm,
  removeCustomBannedTerm,
  
  // Funciones de gestión de patrones
  getBannedPatterns,
  addBannedPattern,
  removeBannedPattern,
  
  // Funciones de filtrado avanzado
  applyTwoStageFiltering
};