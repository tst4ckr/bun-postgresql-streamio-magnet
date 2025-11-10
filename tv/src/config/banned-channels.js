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
import { BannedChannelsFilterService, BannedChannelsFilterConfig } from '../domain/services/BannedChannelsFilterService.js';
import { 
  parseEnvArray, 
  loadBannedChannelsFromEnv, 
  getDefaultBannedChannels,
  isBannedChannelsFilterEnabled as isBannedChannelsFilterEnabledTool
} from './banned-channels_tools.js';

// Lista de canales prohibidos cargada desde variables de entorno (lazy loading)
let BANNED_CHANNELS = null;

function getBannedChannelsLazy() {
  if (BANNED_CHANNELS === null) {
    BANNED_CHANNELS = loadBannedChannelsFromEnv();
  }
  return BANNED_CHANNELS;
}

// Función para parsear variables de entorno separadas por comas
// Ahora usa la función centralizada de banned-channels_tools.js

// Variables para carga lazy de IPs baneadas
let BANNED_IPS = null;
let BANNED_IP_RANGES = null;

/**
 * Obtiene la lista de IPs baneadas (carga lazy)
 * @returns {Array} Lista de IPs baneadas
 */
function getBannedIPsLazy() {
  if (BANNED_IPS === null) {
    BANNED_IPS = parseEnvArray('BANNED_IPS', []);
  }
  return BANNED_IPS;
}

/**
 * Obtiene la lista de rangos CIDR baneados (carga lazy)
 * @returns {Array} Lista de rangos CIDR baneados
 */
function getBannedIPRangesLazy() {
  if (BANNED_IP_RANGES === null) {
    BANNED_IP_RANGES = parseEnvArray('BANNED_IP_RANGES', []);
  }
  return BANNED_IP_RANGES;
}

// Lista de URLs específicas prohibidas (configurable desde app.conf) - lazy loading
let BANNED_URLS = null;

function getBannedURLsLazy() {
  if (BANNED_URLS === null) {
    BANNED_URLS = parseEnvArray('BANNED_URLS', []);
  }
  return BANNED_URLS;
}

// Lista de dominios prohibidos (configurable desde app.conf) - lazy loading
let BANNED_DOMAINS = null;

function getBannedDomainsLazy() {
  if (BANNED_DOMAINS === null) {
    BANNED_DOMAINS = parseEnvArray('BANNED_DOMAINS', []);
  }
  return BANNED_DOMAINS;
}

// Variables de entorno para listas de ignore específicas (lazy loading)
let IGNORE_IPS_FOR_FILTERING = null;
let IGNORE_URLS_FOR_FILTERING = null;
let IGNORE_CHANNEL_NAMES_FOR_FILTERING = null;

/**
 * Obtiene la lista de IPs a ignorar para filtrado (lazy loading)
 * @returns {string[]}
 */
function getIgnoreIPsForFilteringLazy() {
  if (IGNORE_IPS_FOR_FILTERING === null) {
    IGNORE_IPS_FOR_FILTERING = parseEnvArray('IGNORE_IPS_FOR_FILTERING', []);
  }
  return IGNORE_IPS_FOR_FILTERING;
}

/**
 * Obtiene la lista de URLs a ignorar para filtrado (lazy loading)
 * @returns {string[]}
 */
function getIgnoreURLsForFilteringLazy() {
  if (IGNORE_URLS_FOR_FILTERING === null) {
    IGNORE_URLS_FOR_FILTERING = parseEnvArray('IGNORE_URLS_FOR_FILTERING', []);
  }
  return IGNORE_URLS_FOR_FILTERING;
}

/**
 * Obtiene la lista de nombres de canales a ignorar para filtrado (lazy loading)
 * @returns {string[]}
 */
function getIgnoreChannelNamesForFilteringLazy() {
  if (IGNORE_CHANNEL_NAMES_FOR_FILTERING === null) {
    IGNORE_CHANNEL_NAMES_FOR_FILTERING = parseEnvArray('IGNORE_CHANNEL_NAMES_FOR_FILTERING', []);
  }
  return IGNORE_CHANNEL_NAMES_FOR_FILTERING;
}

// Términos adicionales prohibidos (configurable desde app.conf) - lazy loading
let CUSTOM_BANNED_TERMS = null;

function getCustomBannedTermsLazy() {
  if (CUSTOM_BANNED_TERMS === null) {
    CUSTOM_BANNED_TERMS = parseEnvArray('CUSTOM_BANNED_TERMS', []);
  }
  return CUSTOM_BANNED_TERMS;
}

// Patrones regex prohibidos (configurable desde app.conf) - lazy loading
let BANNED_PATTERNS = null;

function getBannedPatternsLazy() {
  if (BANNED_PATTERNS === null) {
    BANNED_PATTERNS = parseEnvArray('BANNED_PATTERNS', []).map(pattern => {
      try {
        return new RegExp(pattern, 'i');
      } catch (error) {
        console.warn(`Patrón regex inválido ignorado: ${pattern}`);
        return null;
      }
    }).filter(pattern => pattern !== null);
  }
  return BANNED_PATTERNS;
}

// Instancia del servicio de filtrado de canales prohibidos
let bannedChannelsFilterService = null;

/**
 * Obtiene la instancia del servicio de filtrado (lazy loading)
 * @returns {BannedChannelsFilterService}
 */
function getBannedChannelsFilterService() {
  if (bannedChannelsFilterService === null) {
    const config = BannedChannelsFilterConfig.fromEnvironment();
    bannedChannelsFilterService = new BannedChannelsFilterService(config);
  }
  return bannedChannelsFilterService;
}

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
 * @param {Object} [channel=null] - Canal para verificar si debe ser ignorado (opcional)
 * @returns {boolean} - true si el canal está prohibido
 */
function isChannelBanned(channelName, threshold = 0.9, channel = null) {
  if (!channelName || typeof channelName !== 'string') {
    return false;
  }
  
  const normalizedInput = normalizeChannelName(channelName);
  
  if (!normalizedInput) {
    return false;
  }
  
  // PRIORIDAD: Verificar si el nombre del canal está en la lista de ignore SOLO si el canal proviene del archivo ignorado
  const isInIgnoreList = getIgnoreChannelNamesForFilteringLazy().some(ignoreName => {
    const normalizedIgnore = normalizeChannelName(ignoreName);
    return normalizedInput === normalizedIgnore || 
           normalizedInput.includes(normalizedIgnore) || 
           normalizedIgnore.includes(normalizedInput);
  });
  
  if (isInIgnoreList && channel) {
     try {
       const filterService = getBannedChannelsFilterService();
       if (filterService.shouldIgnoreChannelForChannels(channel)) {
         return false;
       }
     } catch (error) {
       // Si hay error con el servicio, continuar con la verificación normal (no aplicar ignore)
       console.warn('[BANNED_CHANNELS] Error verificando ignore para canal:', error.message);
     }
   }
  
  // Primero verificar coincidencia exacta
  const exactMatch = getBannedChannelsLazy().some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    return normalizedInput === normalizedBanned;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud y contención
  return getBannedChannelsLazy().some(bannedTerm => {
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
  const exactMatch = getBannedChannelsLazy().some(bannedTerm => {
    const normalizedBanned = normalizeChannelName(bannedTerm);
    return normalizedInput === normalizedBanned;
  });
  
  if (exactMatch) {
    return true;
  }
  
  // Luego verificar similitud con umbral personalizado
  return getBannedChannelsLazy().some(bannedTerm => {
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
 * @param {Object} channel - Canal para verificar si debe ser ignorado (opcional)
 * @returns {boolean} true si la IP está prohibida
 */
function isIPBanned(ip, channel = null) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  
  // Verificar si es una IP válida
  if (!isIP(ip)) {
    return false;
  }
  
  // PRIORIDAD: Verificar si debe aplicarse ignore específico por archivo
  // Solo ignorar si: 1) IP está en IGNORE_IPS_FOR_FILTERING Y 2) canal proviene del archivo ignorado
  if (channel && getIgnoreIPsForFilteringLazy().includes(ip)) {
    try {
      const filterService = getBannedChannelsFilterService();
      if (filterService.shouldIgnoreChannelForIPs(channel)) {
        return false; // Ignorar: IP en lista ignore Y canal del archivo ignorado
      }
    } catch (error) {
      // Si hay error con el servicio, continuar con la verificación normal (no aplicar ignore)
      console.warn('[BANNED_CHANNELS] Error verificando ignore para IP:', error.message);
    }
  }
  
  // Obtener listas de IPs baneadas (carga lazy)
  const bannedIPs = getBannedIPsLazy();
  const bannedIPRanges = getBannedIPRangesLazy();
  
  // Verificar en la lista de IPs prohibidas
  if (bannedIPs.includes(ip)) {
    return true;
  }
  
  // Verificar en los rangos CIDR prohibidos
  return bannedIPRanges.some(range => isIPInCIDRRange(ip, range));
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
  if (getBannedDomainsLazy().includes(normalizedDomain)) {
    return true;
  }
  
  // Verificar subdominios
  return getBannedDomainsLazy().some(bannedDomain => {
    return normalizedDomain.endsWith('.' + bannedDomain) || normalizedDomain === bannedDomain;
  });
}

/**
 * Verifica si una URL específica está prohibida
 * @param {string} url - URL a verificar
 * @param {Object} channel - Canal para verificar si debe ser ignorado (opcional)
 * @returns {boolean} - true si la URL está prohibida
 */
function isURLBanned(url, channel = null) {
  if (!url) return false;
  
  const normalizedURL = url.toLowerCase();
  
  // PRIORIDAD: Verificar si la URL está en la lista de ignore SOLO si el canal proviene del archivo ignorado
   if (getIgnoreURLsForFilteringLazy().some(ignoreURL => normalizedURL.includes(ignoreURL.toLowerCase())) && channel) {
     try {
       const filterService = getBannedChannelsFilterService();
       if (filterService.shouldIgnoreChannelForURLs(channel)) {
         return false;
       }
     } catch (error) {
       // Si hay error con el servicio, continuar con la verificación normal (no aplicar ignore)
       console.warn('[BANNED_CHANNELS] Error verificando ignore para URL:', error.message);
     }
   }
  
  // Verificar URLs exactas
  return getBannedURLsLazy().some(bannedURL => {
    return normalizedURL.includes(bannedURL.toLowerCase());
  });
}

/**
 * Verifica si el nombre del canal coincide con patrones regex prohibidos
 * @param {string} channelName - Nombre del canal
 * @returns {boolean} - true si coincide con algún patrón prohibido
 */
function isChannelNameMatchingPatterns(channelName) {
  if (!channelName || getBannedPatternsLazy().length === 0) return false;
  
  return getBannedPatternsLazy().some(pattern => pattern.test(channelName));
}

/**
 * Verifica si el nombre del canal contiene términos personalizados prohibidos
 * @param {string} channelName - Nombre del canal
 * @returns {boolean} - true si contiene términos prohibidos
 */
function isChannelNameContainingCustomTerms(channelName) {
  if (!channelName || getCustomBannedTermsLazy().length === 0) return false;
  
  const normalizedName = normalizeChannelName(channelName);
  
  return getCustomBannedTermsLazy().some(term => {
    const normalizedTerm = normalizeChannelName(term);
    return normalizedName.includes(normalizedTerm);
  });
}

/**
 * Verifica si la URL de un canal contiene una IP prohibida
 * @param {string} url - URL del canal
 * @param {Object} channel - Canal para verificar si debe ser ignorado (opcional)
 * @returns {boolean} true si contiene una IP prohibida
 */
function isChannelURLBanned(url, channel = null) {
  const ip = extractIPFromURL(url);
  return ip ? isIPBanned(ip, channel) : false;
}

/**
 * Verifica si un canal está prohibido por cualquier criterio
 * Soporta configuraciones específicas de ignore por tipo de filtro
 * @param {Object} channel - Objeto del canal con propiedades name y url
 * @returns {boolean} - true si el canal está prohibido
 */
function isChannelBannedByAnyReason(channel) {
  if (!channel) return false;
  
  const { name } = channel;
  // Unificar obtención de URL para soportar distintos formatos de objeto
  const url = channel.url || channel.streamUrl || channel.stream_url;
  
  let filterService = null;
  try {
    filterService = getBannedChannelsFilterService();
  } catch (error) {
    console.warn('[BANNED_CHANNELS] Error obteniendo servicio de filtrado:', error);
  }
  
  // Verificar filtrado por nombres de canales (la lógica de ignore específico está en isChannelBanned)
  if (name) {
    // Verificar por nombre (sistema original) - pasando el canal para verificación de ignore específico
    if (isChannelBanned(name, 0.9, channel)) {
      return true;
    }
    
    // Verificar por términos personalizados
    if (isChannelNameContainingCustomTerms(name)) {
      return true;
    }
    
    // Verificar por patrones regex
    if (isChannelNameMatchingPatterns(name)) {
      return true;
    }
  }
  
  if (url) {
    // Verificar por IP prohibida (la lógica de ignore específico está en isChannelURLBanned)
    if (isChannelURLBanned(url, channel)) {
      return true;
    }
    
    // Verificar por URL específica prohibida (la lógica de ignore específico está en isURLBanned)
    if (isURLBanned(url, channel)) {
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
 * Verifica si el filtrado de canales prohibidos está habilitado
 * @returns {boolean} true si ENABLE_BANNED_CHANNELS=true
 */
function isBannedChannelsFilterEnabled() {
  return isBannedChannelsFilterEnabledTool();
}

/**
 * Filtra una lista de canales para remover los prohibidos (nombres, IPs, URLs, dominios, etc.)
 * Solo aplica el filtro si ENABLE_BANNED_CHANNELS=true
 * @param {Array} channels - Array de canales a filtrar
 * @returns {Array} Array de canales filtrados (sin los prohibidos)
 */
async function filterBannedChannels(channels) {
  if (!Array.isArray(channels)) {
    return [];
  }
  
  // Si el filtrado de canales prohibidos está deshabilitado, retornar todos los canales
  if (!isBannedChannelsFilterEnabled()) {
    return channels;
  }

  try {
    // Usar el servicio de filtrado para separar canales ignorados
    const filterService = getBannedChannelsFilterService();
    const filterResult = await filterService.filterIgnoredFiles(channels);
    
    // Los canales ignorados no se filtran por banned channels
    const ignoredChannels = filterResult.ignoredChannels;
    const channelsToFilter = filterResult.channels;
    
    // Aplicar filtrado de canales prohibidos solo a los canales no ignorados
    const filteredChannels = channelsToFilter.filter(channel => {
      if (!channel || typeof channel !== 'object') {
        return false;
      }
      
      // Usar la función unificada de verificación
      return !isChannelBannedByAnyReason(channel);
    });
    
    // Combinar canales ignorados (que pasan sin filtrar) con canales filtrados
    const finalChannels = [...ignoredChannels, ...filteredChannels];
    
    if (ignoredChannels.length > 0) {
      console.log(`[BANNED_CHANNELS] ${ignoredChannels.length} canales ignorados en filtrado de prohibidos`);
    }
    
    return finalChannels;
  } catch (error) {
    console.error('[BANNED_CHANNELS] Error en filtrado con archivos ignorados:', error);
    // Fallback al filtrado original
    return channels.filter(channel => {
      if (!channel || typeof channel !== 'object') {
        return false;
      }
      return !isChannelBannedByAnyReason(channel);
    });
  }
}

/**
 * Obtiene la lista actual de canales prohibidos
 * @returns {Array<string>} Lista de canales prohibidos
 */
function getBannedTerms() {
  return [...getBannedChannelsLazy()];
}

/**
 * Obtiene la lista actual de canales prohibidos (alias)
 * @returns {Array<string>} Lista de canales prohibidos
 */
function getBannedChannels() {
  return [...getBannedChannelsLazy()];
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
  return [...getBannedIPsLazy()];
}

/**
 * Obtiene todos los rangos CIDR prohibidos
 * @returns {Array} Array de rangos CIDR prohibidos
 */
function getBannedIPRanges() {
  return [...getBannedIPRangesLazy()];
}

/**
 * Agrega un nuevo término a la lista de prohibidos
 * @param {string} term - Término a agregar
 */
function addBannedTerm(term) {
  if (typeof term === 'string' && term.trim()) {
    const normalizedTerm = normalizeChannelName(term);
    if (!getBannedChannelsLazy().some(banned => normalizeChannelName(banned) === normalizedTerm)) {
      getBannedChannelsLazy().push(term.trim().toUpperCase());
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
    
    // Obtener la lista actual y verificar si ya existe
    const bannedIPs = getBannedIPsLazy();
    if (!bannedIPs.includes(trimmedIP)) {
      bannedIPs.push(trimmedIP);
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
    
    // Obtener la lista actual y verificar si ya existe
    const bannedIPRanges = getBannedIPRangesLazy();
    if (!bannedIPRanges.includes(trimmedCIDR)) {
      bannedIPRanges.push(trimmedCIDR);
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
    const index = getBannedChannelsLazy().findIndex(banned => normalizeChannelName(banned) === normalizedTerm);
    if (index > -1) {
      getBannedChannelsLazy().splice(index, 1);
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
    const bannedIPs = getBannedIPsLazy();
    const index = bannedIPs.indexOf(trimmedIP);
    if (index > -1) {
      bannedIPs.splice(index, 1);
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
    const bannedIPRanges = getBannedIPRangesLazy();
    const index = bannedIPRanges.indexOf(trimmedCIDR);
    if (index > -1) {
      bannedIPRanges.splice(index, 1);
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
  return [...getBannedURLsLazy()];
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
  if (normalizedURL && !getBannedURLsLazy().includes(normalizedURL)) {
    getBannedURLsLazy().push(normalizedURL);
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

  const index = getBannedURLsLazy().indexOf(url.trim());
  if (index > -1) {
    getBannedURLsLazy().splice(index, 1);
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
  return [...getBannedDomainsLazy()];
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
  if (normalizedDomain && !getBannedDomainsLazy().includes(normalizedDomain)) {
    getBannedDomainsLazy().push(normalizedDomain);
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
  const index = getBannedDomainsLazy().indexOf(normalizedDomain);
  if (index > -1) {
    getBannedDomainsLazy().splice(index, 1);
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
  return [...getCustomBannedTermsLazy()];
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
  if (normalizedTerm && !getCustomBannedTermsLazy().includes(normalizedTerm)) {
    getCustomBannedTermsLazy().push(normalizedTerm);
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

  const index = getCustomBannedTermsLazy().indexOf(term.trim());
  if (index > -1) {
    getCustomBannedTermsLazy().splice(index, 1);
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
  return getBannedPatternsLazy().map(pattern => pattern.source);
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
    const patternExists = getBannedPatternsLazy().some(existingPattern => 
      existingPattern.source === regex.source
    );
    
    if (!patternExists) {
      getBannedPatternsLazy().push(regex);
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

  const index = getBannedPatternsLazy().findIndex(regex => regex.source === pattern);
  if (index > -1) {
    getBannedPatternsLazy().splice(index, 1);
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
  BANNED_URLS,
  BANNED_DOMAINS,
  CUSTOM_BANNED_TERMS,
  BANNED_PATTERNS,
  
  // Variables de ignore
  getIgnoreIPsForFilteringLazy,
  getIgnoreURLsForFilteringLazy,
  getIgnoreChannelNamesForFilteringLazy,
  
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
  isBannedChannelsFilterEnabled,
  filterBannedChannels,
  
  // Servicio de filtrado
  getBannedChannelsFilterService,
  
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