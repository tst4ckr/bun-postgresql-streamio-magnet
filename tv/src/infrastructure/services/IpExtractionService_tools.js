/**
 * @fileoverview IpExtractionService Tools - Herramientas auxiliares para extracción de IPs
 * 
 * Este módulo contiene funciones puras y utilitarias que implementan la lógica de extracción
 * de IPs desde URLs de canales, separadas de la lógica principal del servicio para promover
 * reutilización y facilitar testing.
 * 
 * @author Sistema de Validación de Latencia IP
 * @version 1.0.0
 */

import { URL } from 'url';

/**
 * Configuración por defecto para extracción de IPs
 */
export const DEFAULT_IP_EXTRACTION_CONFIG = {
  includeIPv4: true,
  includeIPv6: false,
  excludeLocalhost: true,
  excludePrivateRanges: true,
  validateFormat: true
};

/**
 * HERRAMIENTA PURA: Extrae la IP de una URL
 * @param {string} streamUrl - URL del stream
 * @returns {string|null} IP extraída o null si no es válida
 */
export function extractIpFromUrl(streamUrl) {
  if (!streamUrl || typeof streamUrl !== 'string') {
    return null;
  }

  try {
    const url = new URL(streamUrl);
    const hostname = url.hostname;
    
    // Verificar si el hostname es una IP válida
    if (isValidIpAddress(hostname)) {
      return hostname;
    }
    
    return null; // No es una IP directa, es un dominio
  } catch (error) {
    return null; // URL inválida
  }
}

/**
 * HERRAMIENTA PURA: Verifica si una cadena es una dirección IP válida
 * @param {string} ip - Cadena a verificar
 * @returns {boolean} True si es una IP válida
 */
export function isValidIpAddress(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  return isValidIPv4(ip) || isValidIPv6(ip);
}

/**
 * HERRAMIENTA PURA: Verifica si es una IPv4 válida
 * @param {string} ip - IP a verificar
 * @returns {boolean} True si es IPv4 válida
 */
export function isValidIPv4(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

/**
 * HERRAMIENTA PURA: Verifica si es una IPv6 válida
 * @param {string} ip - IP a verificar
 * @returns {boolean} True si es IPv6 válida
 */
export function isValidIPv6(ip) {
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  return ipv6Regex.test(ip);
}

/**
 * HERRAMIENTA PURA: Verifica si una IP es localhost
 * @param {string} ip - IP a verificar
 * @returns {boolean} True si es localhost
 */
export function isLocalhostIp(ip) {
  if (!ip) return false;
  
  const localhostPatterns = [
    '127.0.0.1',
    '::1',
    'localhost'
  ];
  
  return localhostPatterns.includes(ip.toLowerCase());
}

/**
 * HERRAMIENTA PURA: Verifica si una IP está en rangos privados
 * @param {string} ip - IP a verificar
 * @returns {boolean} True si es IP privada
 */
export function isPrivateIp(ip) {
  if (!isValidIPv4(ip)) {
    return false; // Solo verificamos IPv4 por ahora
  }

  const parts = ip.split('.').map(Number);
  
  // Rangos privados IPv4:
  // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  return false;
}

/**
 * HERRAMIENTA PURA: Filtra IP según configuración
 * @param {string} ip - IP a filtrar
 * @param {Object} config - Configuración de filtrado
 * @returns {boolean} True si la IP pasa los filtros
 */
export function shouldIncludeIp(ip, config = DEFAULT_IP_EXTRACTION_CONFIG) {
  if (!ip || !isValidIpAddress(ip)) {
    return false;
  }

  // Filtrar localhost si está configurado
  if (config.excludeLocalhost && isLocalhostIp(ip)) {
    return false;
  }

  // Filtrar IPs privadas si está configurado
  if (config.excludePrivateRanges && isPrivateIp(ip)) {
    return false;
  }

  // Filtrar por tipo de IP
  if (isValidIPv4(ip) && !config.includeIPv4) {
    return false;
  }

  if (isValidIPv6(ip) && !config.includeIPv6) {
    return false;
  }

  return true;
}

/**
 * HERRAMIENTA PURA: Extrae IPs únicas de una lista de canales
 * @param {Array} channels - Lista de canales
 * @param {Object} config - Configuración de extracción
 * @returns {Set} Set de IPs únicas
 */
export function extractUniqueIpsFromChannels(channels, config = DEFAULT_IP_EXTRACTION_CONFIG) {
  if (!Array.isArray(channels)) {
    return new Set();
  }

  const uniqueIps = new Set();

  channels.forEach(channel => {
    if (!channel) {
      return;
    }

    // Intentar extraer IP de diferentes propiedades del canal
    let streamUrl = null;
    
    // Prioridad: url > stream > streamUrl
    if (channel.url) {
      streamUrl = channel.url;
    } else if (channel.stream) {
      streamUrl = channel.stream;
    } else if (channel.streamUrl) {
      streamUrl = channel.streamUrl;
    }

    if (streamUrl) {
      const ip = extractIpFromUrl(streamUrl);
      if (ip && shouldIncludeIp(ip, config)) {
        uniqueIps.add(ip);
      }
    }
  });

  return uniqueIps;
}

/**
 * HERRAMIENTA PURA: Crea estadísticas de extracción de IPs
 * @param {number} totalChannels - Total de canales procesados
 * @param {number} uniqueIps - Número de IPs únicas encontradas
 * @param {number} filteredIps - Número de IPs después del filtrado
 * @returns {Object} Estadísticas de extracción
 */
export function createIpExtractionStats(totalChannels, uniqueIps, filteredIps) {
  return {
    totalChannels,
    uniqueIps,
    filteredIps,
    extractionRate: totalChannels > 0 ? ((uniqueIps / totalChannels) * 100).toFixed(1) : '0.0',
    filterRate: uniqueIps > 0 ? ((filteredIps / uniqueIps) * 100).toFixed(1) : '0.0'
  };
}

/**
 * HERRAMIENTA PURA: Valida configuración de extracción de IPs
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada
 */
export function validateIpExtractionConfig(config = {}) {
  return {
    ...DEFAULT_IP_EXTRACTION_CONFIG,
    ...config,
    // Asegurar que al menos un tipo de IP esté habilitado
    includeIPv4: config.includeIPv4 !== false, // Por defecto true
    includeIPv6: config.includeIPv6 === true   // Por defecto false
  };
}

/**
 * HERRAMIENTA PURA: Crea mensaje de log para extracción de IPs
 * @param {string} ip - IP procesada
 * @param {string} action - Acción realizada
 * @param {Object} details - Detalles adicionales
 * @returns {string} Mensaje de log formateado
 */
export function createIpLogMessage(ip, action, details = {}) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] IP ${ip}: ${action} ${JSON.stringify(details)}`;
}