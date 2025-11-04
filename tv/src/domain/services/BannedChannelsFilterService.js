/**
 * Servicio centralizado de filtrado de canales prohibidos
 * Implementa filtrado con soporte para archivos ignorados
 * siguiendo principios SOLID y Domain-Driven Design
 */

import { getBannedChannelsFilterConfigFromEnv } from './BannedChannelsFilterService_tools.js';

// Logger simple para el servicio
const createLogger = () => ({
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
});

/**
 * Configuración de filtrado de canales prohibidos
 * Soporta configuraciones específicas por tipo de filtro
 */
class BannedChannelsFilterConfig {
  constructor({
    enableBannedChannels = true,
    ignoreFiles = [],
    ignoreFilesForIPs = [],
    ignoreFilesForURLs = [],
    ignoreFilesForChannels = []
  } = {}) {
    this.enableBannedChannels = enableBannedChannels;
    // Configuración legacy (mantener compatibilidad)
    this.ignoreFiles = ignoreFiles;
    // Configuraciones específicas por tipo
    this.ignoreFilesForIPs = ignoreFilesForIPs;
    this.ignoreFilesForURLs = ignoreFilesForURLs;
    this.ignoreFilesForChannels = ignoreFilesForChannels;
  }

  /**
   * Crea configuración desde variables de entorno
   * @static
   * @returns {BannedChannelsFilterConfig}
   */
  static fromEnvironment() {
    const config = getBannedChannelsFilterConfigFromEnv();
    
    return new BannedChannelsFilterConfig({
      enableBannedChannels: config.enableBannedChannels,
      ignoreFiles: config.ignoreFiles,
      ignoreFilesForIPs: config.ignoreFilesForIPs,
      ignoreFilesForURLs: config.ignoreFilesForURLs,
      ignoreFilesForChannels: config.ignoreFilesForChannels
    });
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por IPs
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreForIPs(channel) {
    return this._shouldIgnoreForType(channel, this.ignoreFilesForIPs) || 
           this._shouldIgnoreForType(channel, this.ignoreFiles); // Fallback a configuración legacy
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por URLs
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreForURLs(channel) {
    return this._shouldIgnoreForType(channel, this.ignoreFilesForURLs) || 
           this._shouldIgnoreForType(channel, this.ignoreFiles); // Fallback a configuración legacy
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por nombres de canales
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreForChannels(channel) {
    return this._shouldIgnoreForType(channel, this.ignoreFilesForChannels) || 
           this._shouldIgnoreForType(channel, this.ignoreFiles); // Fallback a configuración legacy
  }

  /**
   * Método helper para verificar si un canal debe ser ignorado para un tipo específico
   * @private
   * @param {Object} channel - Canal a verificar
   * @param {Array} ignoreFilesList - Lista de archivos a ignorar para este tipo
   * @returns {boolean} true si debe ser ignorado
   */
  _shouldIgnoreForType(channel, ignoreFilesList) {
    if (!ignoreFilesList || ignoreFilesList.length === 0) {
      return false;
    }

    if (!channel || !channel.source) {
      return false;
    }

    // Mapear tipos de fuente a extensiones de archivo
    const sourceToExtension = {
      'csv': '.csv',
      'json': '.json',
      'm3u': '.m3u',
      'm3u8': '.m3u8',
      'txt': '.txt'
    };

    const channelExtension = sourceToExtension[channel.source.toLowerCase()];
    if (!channelExtension) {
      return false;
    }

    // Verificar si algún archivo de ignore coincide con la extensión del canal
    return ignoreFilesList.some(ignoreFile => {
      // Soportar tanto nombres completos como extensiones
      return ignoreFile === channelExtension || 
             ignoreFile.endsWith(channelExtension) ||
             channelExtension.endsWith(ignoreFile);
    });
  }
}

/**
 * Métricas de filtrado de canales prohibidos
 */
class BannedChannelsFilterMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalChannels = 0;
    this.ignoredChannels = 0;
    this.filteredChannels = 0;
    this.bannedChannelsRemoved = 0;
    this.processingTimeMs = 0;
  }

  addIgnoredChannel() {
    this.ignoredChannels++;
  }

  addFilteredChannel() {
    this.filteredChannels++;
  }

  addBannedChannelRemoved() {
    this.bannedChannelsRemoved++;
  }

  getStats() {
    return {
      totalChannels: this.totalChannels,
      ignoredChannels: this.ignoredChannels,
      filteredChannels: this.filteredChannels,
      bannedChannelsRemoved: this.bannedChannelsRemoved,
      processingTimeMs: this.processingTimeMs,
      ignoreRate: this.totalChannels > 0 ? (this.ignoredChannels / this.totalChannels * 100).toFixed(2) : 0,
      filterRate: this.totalChannels > 0 ? (this.bannedChannelsRemoved / this.totalChannels * 100).toFixed(2) : 0
    };
  }
}

/**
 * Servicio principal de filtrado de canales prohibidos
 */
export class BannedChannelsFilterService {
  #config;
  #metrics;
  #logger;

  constructor(config = new BannedChannelsFilterConfig(), logger = null) {
    this.#config = config;
    this.#metrics = new BannedChannelsFilterMetrics();
    this.#logger = logger || createLogger();
  }

  /**
   * Filtra canales de archivos que deben ser ignorados en el filtrado de canales prohibidos
   * @param {Array<Channel>} channels - Lista de canales a filtrar
   * @returns {Promise<{channels: Array<Channel>, ignoredChannels: Array<Channel>, metrics: Object}>}
   */
  async filterIgnoredFiles(channels) {
    const startTime = Date.now();
    this.#metrics.reset();
    this.#metrics.totalChannels = channels.length;

    if (!this.#config.ignoreFiles || this.#config.ignoreFiles.length === 0) {
      this.#metrics.filteredChannels = channels.length;
      this.#metrics.processingTimeMs = Date.now() - startTime;
      
      return {
        channels: channels,
        ignoredChannels: [],
        metrics: this.#metrics.getStats()
      };
    }

    const filteredChannels = [];
    const ignoredChannels = [];

    for (const channel of channels) {
      if (this.#shouldIgnoreChannel(channel)) {
        ignoredChannels.push(channel);
        this.#metrics.addIgnoredChannel();
      } else {
        filteredChannels.push(channel);
        this.#metrics.addFilteredChannel();
      }
    }

    this.#metrics.processingTimeMs = Date.now() - startTime;
    
    if (ignoredChannels.length > 0) {
      this.#logger.info(`Ignorando ${ignoredChannels.length} canales en filtrado de prohibidos`);
    }

    return {
      channels: filteredChannels,
      ignoredChannels: ignoredChannels,
      metrics: this.#metrics.getStats()
    };
  }

  /**
   * Determina si un canal debe ser ignorado basado en su fuente
   * @private
   * @param {Channel} channel 
   * @returns {boolean}
   */
  #shouldIgnoreChannel(channel) {
    if (!channel.source) return false;
    
    // Mapear tipos de fuente a extensiones de archivo
    const sourceToExtension = {
      'csv': '.csv',
      'm3u': '.m3u',
      'm3u8': '.m3u8'
    };
    
    const channelExtension = sourceToExtension[channel.source.toLowerCase()];
    if (!channelExtension) return false;
    
    // Verificar si algún archivo ignorado tiene la misma extensión
    return this.#config.ignoreFiles.some(ignoreFile => {
      const normalizedIgnoreFile = ignoreFile.replace(/\\/g, '/').toLowerCase();
      return normalizedIgnoreFile.endsWith(channelExtension);
    });
  }

  /**
   * Obtiene configuración actual
   * @returns {BannedChannelsFilterConfig}
   */
  getConfig() {
    return this.#config;
  }

  /**
   * Actualiza configuración
   * @param {BannedChannelsFilterConfig} newConfig
   */
  updateConfig(newConfig) {
    this.#config = newConfig;
    this.#logger.info('Configuración de filtrado de canales prohibidos actualizada');
  }

  /**
   * Obtiene métricas actuales
   * @returns {Object}
   */
  getMetrics() {
    return this.#metrics.getStats();
  }

  /**
   * Verifica si un canal debe ser ignorado en el filtrado de canales prohibidos
   * @public
   * @param {Channel} channel - Canal a verificar
   * @returns {boolean} true si el canal debe ser ignorado
   */
  shouldIgnoreChannel(channel) {
    return this.#shouldIgnoreChannel(channel);
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por IPs
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreChannelForIPs(channel) {
    return this.#config.shouldIgnoreForIPs(channel);
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por URLs
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreChannelForURLs(channel) {
    return this.#config.shouldIgnoreForURLs(channel);
  }

  /**
   * Verifica si un canal debe ser ignorado para filtrado por nombres de canales
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si debe ser ignorado
   */
  shouldIgnoreChannelForChannels(channel) {
    return this.#config.shouldIgnoreForChannels(channel);
  }
}

export { BannedChannelsFilterConfig, BannedChannelsFilterMetrics };