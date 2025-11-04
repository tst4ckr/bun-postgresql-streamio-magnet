/**
 * @fileoverview ChannelNameCleaningService - Servicio para limpiar nombres de canales
 * Elimina información redundante de los nombres de canales como "FREE", "EVER", "CESAR", etc.
 * Sigue los principios SOLID y la arquitectura del proyecto.
 * 
 * @author Sistema de Limpieza de Nombres de Canales
 * @version 1.0.0
 */

import {
  cleanChannelName,
  cleanMultipleChannelNames,
  hasRedundantPatterns,
  getCleaningStats,
  safeCleanChannelName,
  isValidCleanedName,
  getChannelNameCleaningConfigFromEnv
} from './ChannelNameCleaningService_tools.js';

/**
 * Configuración del servicio de limpieza de nombres
 */
export class ChannelNameCleaningConfig {
  constructor(options = {}) {
    this.enableCleaning = options.enableCleaning ?? true;
    this.preserveOriginalOnFailure = options.preserveOriginalOnFailure ?? true;
    this.logCleaningStats = options.logCleaningStats ?? false;
    this.batchSize = options.batchSize ?? 1000;
  }

  /**
   * Crea configuración desde variables de entorno
   * @returns {ChannelNameCleaningConfig}
   */
  static fromEnvironment() {
    const config = getChannelNameCleaningConfigFromEnv();
    
    return new ChannelNameCleaningConfig({
      enableCleaning: config.enableCleaning,
      preserveOriginalOnFailure: config.preserveOriginalOnFailure,
      logCleaningStats: config.logCleaningStats,
      batchSize: config.batchSize
    });
  }
}

/**
 * Métricas del servicio de limpieza
 */
export class ChannelNameCleaningMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalProcessed = 0;
    this.totalCleaned = 0;
    this.totalPreserved = 0;
    this.processingTime = 0;
    this.startTime = null;
  }

  startProcessing() {
    this.startTime = Date.now();
  }

  endProcessing() {
    if (this.startTime) {
      this.processingTime = Date.now() - this.startTime;
    }
  }

  recordCleaning(wasCleaned) {
    this.totalProcessed++;
    if (wasCleaned) {
      this.totalCleaned++;
    } else {
      this.totalPreserved++;
    }
  }

  getCleaningRate() {
    return this.totalProcessed > 0 ? (this.totalCleaned / this.totalProcessed) * 100 : 0;
  }

  getSummary() {
    return {
      totalProcessed: this.totalProcessed,
      totalCleaned: this.totalCleaned,
      totalPreserved: this.totalPreserved,
      cleaningRate: Math.round(this.getCleaningRate() * 100) / 100,
      processingTimeMs: this.processingTime,
      averageTimePerChannel: this.totalProcessed > 0 ? this.processingTime / this.totalProcessed : 0
    };
  }
}

/**
 * Servicio principal para limpieza de nombres de canales
 * Elimina información redundante manteniendo la integridad de los datos
 */
export class ChannelNameCleaningService {
  #config;
  #metrics;
  #logger;

  constructor(config = null, logger = console) {
    this.#config = config || ChannelNameCleaningConfig.fromEnvironment();
    this.#metrics = new ChannelNameCleaningMetrics();
    this.#logger = logger;
  }

  /**
   * Limpia el nombre de un canal individual
   * @param {Object} channel - Canal con propiedad name
   * @returns {Object} Canal con nombre limpio
   */
  cleanChannelName(channel) {
    if (!channel || !channel.name) {
      return channel;
    }

    if (!this.#config.enableCleaning) {
      return channel;
    }

    const originalName = channel.name;
    const cleanedName = this.#config.preserveOriginalOnFailure 
      ? safeCleanChannelName(originalName)
      : cleanChannelName(originalName);

    const wasCleaned = originalName !== cleanedName;
    this.#metrics.recordCleaning(wasCleaned);

    // SIEMPRE preservar todas las propiedades del canal original
    // Crear una copia completa del canal preservando TODOS los campos
    const preservedChannel = {
      id: channel.id,
      name: wasCleaned ? cleanedName : originalName,
      streamUrl: channel.streamUrl,
      logo: channel.logo,
      genre: channel.genre,
      country: channel.country,
      language: channel.language,
      quality: channel.quality,
      type: channel.type,
      isActive: channel.isActive,
      metadata: channel.metadata,
      // Preservar cualquier otra propiedad adicional
      ...channel
    };

    // Solo agregar originalName si el nombre fue limpiado
    if (wasCleaned) {
      preservedChannel.originalName = originalName;
      preservedChannel.name = cleanedName; // Asegurar que el nombre limpio esté asignado
    }

    return preservedChannel;
  }

  /**
   * Limpia los nombres de múltiples canales
   * @param {Array<Object>} channels - Array de canales
   * @returns {Array<Object>} Array de canales con nombres limpios
   */
  cleanChannelNames(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return channels;
    }

    if (!this.#config.enableCleaning) {
      return channels;
    }

    this.#metrics.reset();
    this.#metrics.startProcessing();

    const cleanedChannels = channels.map(channel => this.cleanChannelName(channel));

    this.#metrics.endProcessing();

    if (this.#config.logCleaningStats) {
      this.#logCleaningStats();
    }

    return cleanedChannels;
  }

  /**
   * Procesa canales en lotes para mejor rendimiento
   * @param {Array<Object>} channels - Array de canales
   * @returns {Promise<Array<Object>>} Array de canales procesados
   */
  async processChannelsInBatches(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return channels;
    }

    if (!this.#config.enableCleaning) {
      return channels;
    }

    this.#metrics.reset();
    this.#metrics.startProcessing();

    const processedChannels = [];
    const batchSize = this.#config.batchSize;

    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const cleanedBatch = batch.map(channel => this.cleanChannelName(channel));
      processedChannels.push(...cleanedBatch);

      // Permitir que el event loop procese otras tareas
      if (i + batchSize < channels.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    this.#metrics.endProcessing();

    if (this.#config.logCleaningStats) {
      this.#logCleaningStats();
    }

    return processedChannels;
  }

  /**
   * Obtiene estadísticas de limpieza para un conjunto de canales
   * @param {Array<Object>} channels - Array de canales
   * @returns {Object} Estadísticas de limpieza
   */
  getCleaningStatistics(channels) {
    if (!Array.isArray(channels)) {
      return { total: 0, withRedundantPatterns: 0, cleaningRate: 0 };
    }

    const channelNames = channels
      .filter(channel => channel && channel.name)
      .map(channel => channel.name);

    return getCleaningStats(channelNames);
  }

  /**
   * Verifica si un canal necesita limpieza
   * @param {Object} channel - Canal a verificar
   * @returns {boolean} true si necesita limpieza
   */
  needsCleaning(channel) {
    if (!channel || !channel.name) {
      return false;
    }

    return hasRedundantPatterns(channel.name);
  }

  /**
   * Obtiene las métricas actuales del servicio
   * @returns {Object} Métricas de procesamiento
   */
  getMetrics() {
    return this.#metrics.getSummary();
  }

  /**
   * Reinicia las métricas del servicio
   */
  resetMetrics() {
    this.#metrics.reset();
  }

  /**
   * Registra estadísticas de limpieza
   * @private
   */
  #logCleaningStats() {
    const stats = this.#metrics.getSummary();
    this.#logger.info('📝 Estadísticas de limpieza de nombres:');
    this.#logger.info(`   • Canales procesados: ${stats.totalProcessed}`);
    this.#logger.info(`   • Nombres limpiados: ${stats.totalCleaned}`);
    this.#logger.info(`   • Nombres preservados: ${stats.totalPreserved}`);
    this.#logger.info(`   • Tasa de limpieza: ${stats.cleaningRate}%`);
    this.#logger.info(`   • Tiempo de procesamiento: ${stats.processingTimeMs}ms`);
    
    if (stats.totalProcessed > 0) {
      this.#logger.info(`   • Tiempo promedio por canal: ${Math.round(stats.averageTimePerChannel * 100) / 100}ms`);
    }
  }
}

export default ChannelNameCleaningService;