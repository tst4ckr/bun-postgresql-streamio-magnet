/**
 * @fileoverview HybridChannelRepository Tools - Funciones auxiliares y herramientas
 * Contiene funciones puras y utilitarias para el HybridChannelRepository
 * 
 * Responsabilidades:
 * - Validación de URLs y direcciones IP
 * - Generación de URLs de playlist
 * - Deduplicación de canales
 * - Filtrado de canales por criterios específicos
 * - Gestión de estadísticas de errores
 */

import { URL } from 'url';
import fetch from 'node-fetch';

/**
 * Verifica si una dirección IP es pública
 * Implementa la lógica exacta del modo automático para consistencia funcional
 * 
 * @param {string} hostname - Hostname a verificar
 * @returns {boolean} true si es IP pública válida
 * 
 * @example
 * isPublicIP('8.8.8.8') // true
 * isPublicIP('192.168.1.1') // false
 * isPublicIP('127.0.0.1') // false
 */
export function isPublicIP(hostname) {
  // Verificar que sea una IP válida
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(hostname)) {
    return false;
  }

  const parts = hostname.split('.').map(Number);
  const [a, b, c, d] = parts;

  // Verificar que NO sea IP privada
  // 10.0.0.0/8
  if (a === 10) return false;
  
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return false;
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return false;
  
  // 127.0.0.0/8 (localhost)
  if (a === 127) return false;
  
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return false;
  
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return false;
  
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return false;

  return true;
}

/**
 * Determina si una fuente es una URL remota o un archivo local
 * 
 * @param {string} source - Fuente a evaluar
 * @returns {boolean} true si es URL remota, false si es archivo local
 * 
 * @example
 * isRemoteUrl('http://example.com/playlist.m3u') // true
 * isRemoteUrl('https://example.com/playlist.m3u') // true
 * isRemoteUrl('/path/to/local/file.m3u') // false
 * isRemoteUrl('file.m3u') // false
 */
export function isRemoteUrl(source) {
  return source.startsWith('http://') || source.startsWith('https://');
}

/**
 * Genera URLs únicas de playlist en formato http://IP:PUERTO/playlist.m3u
 * Implementa la lógica exacta del modo automático para consistencia funcional
 * 
 * @param {Array<Channel>} channels - Canales filtrados con /play/ e IP pública
 * @param {Object} logger - Logger para registrar errores (opcional)
 * @returns {string[]} URLs de playlist únicas
 * 
 * @example
 * const channels = [{ streamUrl: 'http://192.168.1.1:8080/play/channel1' }];
 * generatePlaylistUrls(channels) // ['http://192.168.1.1:8080/playlist.m3u']
 */
export function generatePlaylistUrls(channels, logger = null) {
  const playlistUrls = new Set();
  
  for (const channel of channels) {
    try {
      const url = new URL(channel.streamUrl);
      const ip = url.hostname;
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      
      // Generar URL de playlist en formato requerido: http://IP:PUERTO/playlist.m3u
      const playlistUrl = `http://${ip}:${port}/playlist.m3u`;
      playlistUrls.add(playlistUrl);
      
    } catch (error) {
      if (logger) {
        logger.debug(`Error generando playlist URL para: ${channel.streamUrl}`);
      }
    }
  }
  
  return Array.from(playlistUrls);
}

/**
 * Elimina canales duplicados basándose en el ID del canal
 * Implementa la lógica exacta del modo automático para consistencia funcional
 * 
 * @param {Array<Channel>} channels - Canales a deduplicar
 * @returns {Array<Channel>} Canales únicos
 * 
 * @example
 * const channels = [
 *   { id: 'ch1', name: 'Channel 1' },
 *   { id: 'ch1', name: 'Channel 1 Duplicate' },
 *   { id: 'ch2', name: 'Channel 2' }
 * ];
 * removeDuplicateChannels(channels) // [{ id: 'ch1', name: 'Channel 1' }, { id: 'ch2', name: 'Channel 2' }]
 */
export function removeDuplicateChannels(channels) {
  const uniqueChannels = new Map();
  
  for (const channel of channels) {
    const key = channel.id;
    if (!uniqueChannels.has(key)) {
      uniqueChannels.set(key, channel);
    }
  }
  
  return Array.from(uniqueChannels.values());
}

/**
 * Filtra canales que contengan '/play/' en la URL y tengan IP pública como hostname
 * Implementa la lógica exacta del modo automático para consistencia funcional
 * 
 * @param {Array<Channel>} channels - Canales a filtrar
 * @param {Object} logger - Logger para registrar errores (opcional)
 * @returns {Array<Channel>} Canales filtrados
 * 
 * @example
 * const channels = [
 *   { streamUrl: 'http://8.8.8.8:8080/play/channel1' }, // válido
 *   { streamUrl: 'http://192.168.1.1:8080/play/channel2' }, // IP privada
 *   { streamUrl: 'http://8.8.8.8:8080/stream/channel3' } // sin /play/
 * ];
 * filterChannelsByPlayAndPublicIP(channels) // [{ streamUrl: 'http://8.8.8.8:8080/play/channel1' }]
 */
export function filterChannelsByPlayAndPublicIP(channels, logger = null) {
  return channels.filter(channel => {
    try {
      const url = new URL(channel.streamUrl);
      
      // Verificar que la URL sea válida y accesible
      if (!url.protocol || (!url.protocol.startsWith('http') && !url.protocol.startsWith('https'))) {
        return false;
      }

      // Verificar que tenga un hostname válido
      if (!url.hostname || url.hostname.trim().length === 0) {
        return false;
      }

      // Verificar que contenga '/play/' en la ruta (requisito del modo automático)
      if (!url.pathname.includes('/play/')) {
        return false;
      }

      // Verificar que el hostname sea una IP pública (requisito del modo automático)
      if (!isPublicIP(url.hostname)) {
        return false;
      }

      return true;
    } catch (error) {
      if (logger) {
        logger.debug(`URL inválida ignorada: ${channel.streamUrl}`);
      }
      return false;
    }
  });
}

/**
 * Crea un objeto de estadísticas de errores de playlist vacío
 * 
 * @returns {Object} Objeto de estadísticas inicializado
 * 
 * @example
 * const stats = createEmptyPlaylistErrorStats();
 * // { totalPlaylists: 0, successfulPlaylists: 0, failedPlaylists: 0, errors: [], errorsByType: Map }
 */
export function createEmptyPlaylistErrorStats() {
  return {
    totalPlaylists: 0,
    successfulPlaylists: 0,
    failedPlaylists: 0,
    errors: [],
    errorsByType: new Map()
  };
}

/**
 * Reinicia las estadísticas de errores de playlist
 * Función pura que crea un nuevo objeto de estadísticas vacío
 * 
 * @returns {Object} Objeto de estadísticas reiniciado
 * 
 * @example
 * const stats = resetPlaylistErrorStats();
 * // { totalPlaylists: 0, successfulPlaylists: 0, failedPlaylists: 0, errors: [], errorsByType: Map }
 */
export function resetPlaylistErrorStats() {
  return {
    totalPlaylists: 0,
    successfulPlaylists: 0,
    failedPlaylists: 0,
    errors: [],
    errorsByType: new Map()
  };
}

/**
 * Registra un error de playlist
 * @param {Object} playlistErrorStats - Objeto de estadísticas de errores
 * @param {number} index - Índice de la playlist
 * @param {string} url - URL de la playlist
 * @param {string} errorMessage - Mensaje de error
 * @param {Object} logger - Logger para registrar el error
 */
export function trackPlaylistError(playlistErrorStats, index, url, errorMessage, logger) {
  playlistErrorStats.failedPlaylists++;
  playlistErrorStats.errors.push({
    index,
    url,
    error: errorMessage,
    timestamp: new Date()
  });
  
  let errorType = 'unknown';
  if (errorMessage.includes('HTTP')) {
    errorType = 'http_error';
  } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    errorType = 'timeout';
  } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
    errorType = 'connection';
  } else if (errorMessage.includes('vacío')) {
    errorType = 'empty_content';
  }
  
  const currentCount = playlistErrorStats.errorsByType.get(errorType) || 0;
  playlistErrorStats.errorsByType.set(errorType, currentCount + 1);
  
  logger.warn(`Error en playlist ${index} (${url}): ${errorMessage}`);
}

/**
 * Registra las estadísticas de errores de playlist en el logger
 * @param {Object} playlistErrorStats - Objeto de estadísticas de errores
 * @param {Object} logger - Logger para registrar las estadísticas
 */
export function logPlaylistErrorStats(playlistErrorStats, logger) {
  if (playlistErrorStats.failedPlaylists > 0) {
    logger.warn(`Resumen de errores: ${playlistErrorStats.failedPlaylists}/${playlistErrorStats.totalPlaylists} playlists fallaron`);
    
    for (const [type, count] of playlistErrorStats.errorsByType) {
      logger.warn(`  - ${type}: ${count}`);
    }
    
    const maxExamples = 3;
    const examples = playlistErrorStats.errors.slice(0, maxExamples);
    if (examples.length > 0) {
      logger.warn(`  Ejemplos:`);
      examples.forEach(error => {
        logger.warn(`    - Playlist ${error.index}: ${error.error}`);
      });
      
      if (playlistErrorStats.errors.length > maxExamples) {
        logger.warn(`    ... y ${playlistErrorStats.errors.length - maxExamples} más`);
      }
    }
  }
}





/**
 * Filtra canales activos excluyendo los desactivados
 * 
 * @param {Array<Channel>} channels - Canales a filtrar
 * @param {Set<string>} deactivatedChannels - Set de IDs de canales desactivados
 * @returns {Array<Channel>} Canales activos
 * 
 * @example
 * const channels = [{ id: 'ch1' }, { id: 'ch2' }, { id: 'ch3' }];
 * const deactivated = new Set(['ch2']);
 * filterActiveChannels(channels, deactivated) // [{ id: 'ch1' }, { id: 'ch3' }]
 */
export function filterActiveChannels(channels, deactivatedChannels) {
  return channels.filter(channel => !deactivatedChannels.has(channel.id));
}

/**
 * Procesa cada URL de playlist como fuente M3U independiente
 * Implementa la lógica exacta del modo automático para consistencia funcional
 * 
 * @param {string[]} playlistUrls - URLs de playlist a procesar
 * @param {Object} config - Configuración del sistema
 * @param {Object} logger - Logger para registrar eventos
 * @param {Object} m3uParser - Parser M3U para procesar contenido
 * @param {Object} playlistErrorStats - Estadísticas de errores de playlist
 * @param {Function} resetPlaylistErrorStats - Función para reiniciar estadísticas
 * @param {Function} trackPlaylistError - Función para registrar errores
 * @param {Function} logPlaylistErrorStats - Función para mostrar estadísticas
 * @returns {Promise<Array<Channel>>} Todos los canales procesados
 * 
 * @example
 * const channels = await processPlaylistUrls(
 *   ['http://example.com/playlist.m3u'],
 *   config,
 *   logger,
 *   m3uParser,
 *   stats,
 *   resetStats,
 *   trackError,
 *   logStats
 * );
 */
export async function processPlaylistUrls(
  playlistUrls,
  config,
  logger,
  m3uParser,
  playlistErrorStats,
  resetPlaylistErrorStats,
  trackPlaylistError,
  logPlaylistErrorStats
) {
  const allChannels = [];
  const maxConcurrent = 5;
  
  resetPlaylistErrorStats();
  playlistErrorStats.totalPlaylists = playlistUrls.length;
  logger.info(`Procesando ${playlistUrls.length} playlists (lotes de ${maxConcurrent})...`);
  
  for (let i = 0; i < playlistUrls.length; i += maxConcurrent) {
    const batch = playlistUrls.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (playlistUrl, index) => {
      const globalIndex = i + index + 1;
      
      try {
        logger.debug(`Procesando ${globalIndex}/${playlistUrls.length}: ${playlistUrl}`);
        
        const playlistTimeout = config.validation?.playlistFetchTimeout || 180000;
        const response = await fetch(playlistUrl, {
          timeout: playlistTimeout,
          headers: {
            'User-Agent': 'TV-IPTV-Addon/1.0.0'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const m3uContent = await response.text();
        
        if (!m3uContent || m3uContent.trim().length === 0) {
          throw new Error('Contenido vacío');
        }
        
        const channels = await m3uParser.parseM3U(m3uContent);
        
        if (channels.length > 0) {
          logger.debug(`Playlist ${globalIndex}: ${channels.length} canales`);
          playlistErrorStats.successfulPlaylists++;
          return channels;
        } else {
          logger.debug(`Playlist ${globalIndex}: sin canales`);
          playlistErrorStats.successfulPlaylists++;
          return [];
        }
        
      } catch (error) {
        trackPlaylistError(playlistErrorStats, globalIndex, playlistUrl, error.message, logger);
        return [];
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const channels of batchResults) {
      allChannels.push(...channels);
    }
    
    if (i + maxConcurrent < playlistUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  logPlaylistErrorStats(playlistErrorStats, logger);
  logger.info(`Procesamiento de playlists finalizado: ${allChannels.length} canales obtenidos`);
  return allChannels;
}