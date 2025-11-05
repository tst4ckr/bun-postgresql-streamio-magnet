/**
 * @fileoverview IpExtractionService - Servicio para extraer IPs únicas de canales
 * 
 * RESPONSABILIDAD PRINCIPAL: Orquestar la extracción de IPs únicas desde URLs de canales
 * 
 * Arquitectura Clara:
 * - ESTE ARCHIVO: Contiene toda la lógica de negocio y orquestación
 * - _tools.js: Contiene SOLO funciones puras y simples (sin lógica compleja)
 * 
 * Flujo de datos:
 * 1. Recibe lista de canales filtrados
 * 2. Extrae IPs de las URLs usando herramientas puras
 * 3. Aplica filtros de configuración (localhost, privadas, etc.)
 * 4. Retorna Set de IPs únicas listas para validación de latencia
 * 
 * @author Sistema de Validación de Latencia IP
 * @version 1.0.0
 */

import {
  extractIpFromUrl,
  extractUniqueIpsFromChannels,
  isValidIpAddress,
  shouldIncludeIp,
  createIpExtractionStats,
  validateIpExtractionConfig,
  createIpLogMessage,
  DEFAULT_IP_EXTRACTION_CONFIG
} from './IpExtractionService_tools.js';

/**
 * Servicio especializado en la extracción de IPs únicas desde canales IPTV
 * Responsabilidad única: gestionar la extracción y filtrado de IPs para validación posterior
 */
export class IpExtractionService {
  /**
   * @private
   */
  #config;
  #logger;
  #stats;
  #tools;

  /**
   * Constructor con dependency injection para herramientas
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   * @param {Object} tools - Herramientas inyectadas (para testing)
   */
  constructor(config = {}, logger = console, tools = null) {
    // Inyección de dependencias para herramientas PURAS
    this.#tools = tools || {
      extractIpFromUrl,
      extractUniqueIpsFromChannels,
      isValidIpAddress,
      shouldIncludeIp,
      createIpExtractionStats,
      validateIpExtractionConfig,
      createIpLogMessage,
      DEFAULT_IP_EXTRACTION_CONFIG
    };
    
    // Validación de configuración usando herramienta pura
    this.#config = this.#tools.validateIpExtractionConfig(config);
    this.#logger = logger;
    this.#stats = {
      totalChannelsProcessed: 0,
      uniqueIpsFound: 0,
      filteredIpsCount: 0,
      processingTime: 0,
      errors: 0
    };
  }

  /**
   * LÓGICA PRINCIPAL: Extrae IPs únicas de una lista de canales
   * Esta es la lógica de negocio central del servicio
   * @param {Array} channels - Lista de canales filtrados
   * @returns {Object} Resultado con IPs únicas y estadísticas
   */
  extractUniqueIps(channels) {
    const startTime = Date.now();
    
    try {
      this.#logger.info('🔍 Iniciando extracción de IPs únicas...');
      
      // 1. Validar entrada
      if (!Array.isArray(channels)) {
        throw new Error('La entrada debe ser un array de canales');
      }

      // 2. LÓGICA DE NEGOCIO: Extraer IPs usando herramientas puras
      const uniqueIpsSet = this.#tools.extractUniqueIpsFromChannels(channels, this.#config);
      const uniqueIpsArray = Array.from(uniqueIpsSet);

      // 3. LÓGICA DE NEGOCIO: Actualizar estadísticas
      this.#stats.totalChannelsProcessed = channels.length;
      this.#stats.uniqueIpsFound = uniqueIpsArray.length;
      this.#stats.filteredIpsCount = uniqueIpsArray.length; // Ya filtradas por herramientas
      this.#stats.processingTime = Date.now() - startTime;

      // 4. Logging detallado
      this.#logExtractionResults(channels.length, uniqueIpsArray.length);

      // 5. Retornar resultado estructurado
      return {
        success: true,
        uniqueIps: uniqueIpsArray,
        stats: this.#createDetailedStats(),
        config: this.#config
      };

    } catch (error) {
      this.#stats.errors++;
      this.#logger.error('❌ Error en extracción de IPs:', error.message);
      
      return {
        success: false,
        uniqueIps: [],
        stats: this.#createDetailedStats(),
        error: error.message
      };
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Extrae IP de una URL específica
   * @param {string} streamUrl - URL del stream
   * @returns {Object} Resultado de extracción
   */
  extractSingleIp(streamUrl) {
    try {
      const ip = this.#tools.extractIpFromUrl(streamUrl);
      
      if (!ip) {
        return {
          success: false,
          ip: null,
          reason: 'No se pudo extraer IP de la URL o no es una IP directa'
        };
      }

      const shouldInclude = this.#tools.shouldIncludeIp(ip, this.#config);
      
      return {
        success: shouldInclude,
        ip: shouldInclude ? ip : null,
        reason: shouldInclude ? 'IP extraída exitosamente' : 'IP filtrada por configuración'
      };

    } catch (error) {
      return {
        success: false,
        ip: null,
        reason: `Error: ${error.message}`
      };
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Filtra canales que tienen IPs válidas
   * @param {Array} channels - Lista de canales
   * @returns {Array} Canales con IPs válidas
   */
  filterChannelsWithValidIps(channels) {
    if (!Array.isArray(channels)) {
      return [];
    }

    return channels.filter(channel => {
      if (!channel || !channel.stream) {
        return false;
      }

      const result = this.extractSingleIp(channel.stream);
      return result.success;
    });
  }

  /**
   * Logging detallado de resultados de extracción
   * @private
   */
  #logExtractionResults(totalChannels, uniqueIps) {
    const extractionRate = totalChannels > 0 ? ((uniqueIps / totalChannels) * 100).toFixed(1) : '0.0';
    
    this.#logger.info(`📊 Canales procesados: ${totalChannels}`);
    this.#logger.info(`🔢 IPs únicas encontradas: ${uniqueIps}`);
    this.#logger.info(`📈 Tasa de extracción: ${extractionRate}%`);
    
    if (this.#config.excludeLocalhost) {
      this.#logger.info('🚫 Localhost excluido por configuración');
    }
    
    if (this.#config.excludePrivateRanges) {
      this.#logger.info('🚫 Rangos privados excluidos por configuración');
    }
  }

  /**
   * Crea estadísticas detalladas usando herramientas puras
   * @private
   */
  #createDetailedStats() {
    return {
      ...this.#stats,
      ...this.#tools.createIpExtractionStats(
        this.#stats.totalChannelsProcessed,
        this.#stats.uniqueIpsFound,
        this.#stats.filteredIpsCount
      )
    };
  }

  /**
   * Obtiene estadísticas del servicio
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return this.#createDetailedStats();
  }

  /**
   * Obtiene la configuración actual del servicio
   * @returns {Object} Configuración del servicio
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Reinicia las estadísticas del servicio
   */
  resetStats() {
    this.#stats = {
      totalChannelsProcessed: 0,
      uniqueIpsFound: 0,
      filteredIpsCount: 0,
      processingTime: 0,
      errors: 0
    };
  }

  /**
   * Verifica si el servicio está configurado correctamente
   * @returns {boolean} True si la configuración es válida
   */
  isConfigValid() {
    return this.#config.includeIPv4 || this.#config.includeIPv6;
  }
}