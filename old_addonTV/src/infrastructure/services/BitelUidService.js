/**
 * @fileoverview BitelUidService - Servicio para generar UIDs dinámicos para canales TV360.BITEL
 * 
 * RESPONSABILIDAD PRINCIPAL: Orquestar la generación de UIDs para canales BITEL
 * 
 * Arquitectura Clara:
 * - ESTE ARCHIVO: Contiene toda la lógica de negocio y orquestación
 * - _tools.js: Contiene SOLO funciones puras y simples (sin lógica compleja)
 * 
 * Flujo de datos:
 * 1. Recibe URLs y valida si son BITEL usando herramientas puras
 * 2. Gestiona cache de UIDs con lógica propia del servicio
 * 3. Decide cuándo regenerar UIDs basado en reglas de negocio
 * 4. Construye URLs finales usando herramientas de formateo
 */

import {
  isBitelChannel,
  generateDynamicUid,
  buildUrlWithUid,
  isTimestampExpired,
  validateBitelConfig,
  createUidLogMessage,
  createCacheStats,
  incrementCounter,
  DEFAULT_BITEL_CONFIG
} from './BitelUidService_tools.js';

/**
 * Servicio especializado en la generación de UIDs dinámicos para canales TV360.BITEL
 * Responsabilidad única: gestionar la estabilidad de streams BITEL mediante UIDs generados
 */
export class BitelUidService {
  /**
   * @private
   */
  #config;
  #logger;
  #uidCache;
  #lastGenerationTime;
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
      isBitelChannel,
      generateDynamicUid,
      buildUrlWithUid,
      isTimestampExpired,
      validateBitelConfig,
      createUidLogMessage,
      createCacheStats,
      incrementCounter,
      DEFAULT_BITEL_CONFIG
    };
    
    // Validación de configuración usando herramienta pura
    this.#config = this.#tools.validateBitelConfig(config);
    this.#logger = logger;
    this.#uidCache = new Map();
    this.#lastGenerationTime = new Map();
    this.#stats = {
      totalGenerations: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * LÓGICA PRINCIPAL: Procesa una URL de canal y genera UID dinámico si es necesario
   * Esta es la lógica de negocio central del servicio
   * @param {string} streamUrl - URL original del stream
   * @param {string} channelId - ID del canal para cache
   * @returns {string} URL procesada con UID dinámico
   */
  processStreamUrl(streamUrl, channelId) {
    try {
      // 1. Verificar si es canal BITEL usando herramienta pura
      if (!this.#tools.isBitelChannel(streamUrl, this.#config.domain)) {
        return streamUrl; // No es BITEL, devolver URL original
      }
      
      // 2. LÓGICA DE NEGOCIO: Determinar si necesita nuevo UID
      const lastGeneration = this.#lastGenerationTime.get(channelId) || 0;
      let uid;
      let regenerated = false;
      
      // 3. LÓGICA DE NEGOCIO: Verificar expiración usando herramienta pura
      if (this.#tools.isTimestampExpired(lastGeneration, this.#config.cacheExpiry)) {
        // Generar nuevo UID usando herramienta pura
        uid = this.#tools.generateDynamicUid(this.#config.uidPrefix);
        this.#uidCache.set(channelId, uid);
        this.#lastGenerationTime.set(channelId, Date.now());
        regenerated = true;
      } else {
        // Usar UID existente o generar si no existe
        uid = this.#uidCache.get(channelId);
        if (!uid) {
          uid = this.#tools.generateDynamicUid(this.#config.uidPrefix);
          this.#uidCache.set(channelId, uid);
          this.#lastGenerationTime.set(channelId, Date.now());
          regenerated = true;
        }
      }
      
      // 4. LÓGICA DE NEGOCIO: Actualizar estadísticas
      if (regenerated) {
        this.#stats = this.#tools.incrementCounter(this.#stats, 'totalGenerations');
        this.#stats = this.#tools.incrementCounter(this.#stats, 'cacheMisses');
        
        if (this.#logger.debug) {
          const logMessage = this.#tools.createUidLogMessage('Nuevo', channelId, uid);
          this.#logger.debug(logMessage);
        }
      } else {
        this.#stats = this.#tools.incrementCounter(this.#stats, 'cacheHits');
      }
      
      // 5. Construir URL final usando herramienta pura
      const processedUrl = this.#tools.buildUrlWithUid(streamUrl, uid);
      
      if (this.#logger.debug) {
        this.#logger.debug(`URL BITEL: ${channelId} -> ${processedUrl}`);
      }
      
      return processedUrl;
      
    } catch (error) {
      // LÓGICA DE NEGOCIO: Manejo robusto de errores
      this.#logger.warn(`Error en URL Bitel ${streamUrl}: ${error.message}. Usando original.`);
      this.#stats = this.#tools.incrementCounter(this.#stats, 'errors');
      return streamUrl; // Fallback a URL original
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Limpia el cache de UIDs
   * @param {string} channelId - ID específico del canal (opcional)
   */
  clearCache(channelId = null) {
    if (channelId) {
      // Limpiar canal específico
      const hadChannel = this.#uidCache.has(channelId);
      this.#uidCache.delete(channelId);
      this.#lastGenerationTime.delete(channelId);
      
      if (this.#logger.debug) {
        this.#logger.debug(`Cache limpiado: ${channelId}`);
      }
      
      return {
        success: true,
        action: 'single_channel',
        channelId,
        wasPresent: hadChannel
      };
    } else {
      // Limpiar todo el cache
      const channelCount = this.#uidCache.size;
      this.#uidCache.clear();
      this.#lastGenerationTime.clear();
      
      if (this.#logger.debug) {
        this.#logger.debug(`Cache limpiado: ${channelCount} canales`);
      }
      
      return {
        success: true,
        action: 'all_channels',
        clearedCount: channelCount
      };
    }
  }

  /**
   * Obtiene estadísticas del servicio usando herramienta pura
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    const timestamps = Array.from(this.#lastGenerationTime.values());
    return this.#tools.createCacheStats(
      this.#uidCache.size,
      timestamps,
      this.#stats
    );
  }

  /**
   * Verifica si un canal está en cache
   * @param {string} channelId - ID del canal
   * @returns {boolean}
   */
  isChannelCached(channelId) {
    return this.#uidCache.has(channelId);
  }

  /**
   * Obtiene la configuración actual del servicio
   * @returns {Object} Configuración del servicio
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Actualiza la configuración del servicio usando herramienta pura
   * @param {Object} newConfig - Nueva configuración
   */
  updateConfig(newConfig) {
    this.#config = this.#tools.validateBitelConfig({
      ...this.#config,
      ...newConfig
    });
  }

  /**
   * LÓGICA DE NEGOCIO: Fuerza la regeneración de UID para un canal específico
   * @param {string} channelId - ID del canal
   * @returns {string|null} Nuevo UID generado o null si no existe
   */
  forceRegenerateUid(channelId) {
    if (!this.#uidCache.has(channelId)) {
      return null;
    }
    
    // Generar nuevo UID usando herramienta pura
    const newUid = this.#tools.generateDynamicUid(this.#config.uidPrefix);
    this.#uidCache.set(channelId, newUid);
    this.#lastGenerationTime.set(channelId, Date.now());
    
    // Actualizar estadísticas
    this.#stats = this.#tools.incrementCounter(this.#stats, 'totalGenerations');
    
    if (this.#logger.debug) {
      const logMessage = this.#tools.createUidLogMessage('Regenerado', channelId, newUid);
      this.#logger.debug(logMessage);
    }
    
    return newUid;
  }
}

export default BitelUidService;