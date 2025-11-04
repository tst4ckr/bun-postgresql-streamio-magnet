/**
 * Servicio unificado para manejo de IDs de contenido
 * Integra detección, conversión y mapeo de IDs de forma autónoma
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { idDetectorService } from './IdDetectorService.js';
import { cacheService } from './CacheService.js';
import { addonConfig } from '../../config/addonConfig.js';
import { CONSTANTS } from '../../config/constants.js';

export class UnifiedIdService {
  
  constructor({ idDetectorService, logger, cacheService, config } = {}) {
    this.idDetectorService = idDetectorService;
    this.logger = logger || new EnhancedLogger('UnifiedIdService');
    this.cacheService = cacheService;
    this.config = config;
    
    this.CONVERSION_CACHE_TTL = config?.cache?.conversionTtl || 86400;
    this.SUPPORTED_SERVICES = ['imdb', 'kitsu', 'mal', 'anilist', 'anidb'];
    this.SERVICE_PRIORITIES = {
      imdb: 1,
      kitsu: 2,
      mal: 3,
      anilist: 4,
      anidb: 5
    };
    
    this.logger.debug('UnifiedIdService inicializado', {
      supportedServices: this.SUPPORTED_SERVICES,
      cacheTtl: this.CONVERSION_CACHE_TTL,
      priorities: this.SERVICE_PRIORITIES
    });
  }

  /**
   * Convierte un ID entre diferentes servicios
   * @param {string} contentId - ID a convertir
   * @param {string} targetService - Servicio destino (imdb, kitsu, mal, anilist, anidb)
   * @param {Object} options - Opciones de conversión
   * @returns {Promise<Object>} Resultado de la conversión
   */
  async convertId(contentId, targetService, options = {}) {
    this.#validateConversionInput(contentId, targetService);
    
    targetService = targetService.toLowerCase();
    const detectionResult = this.idDetectorService.detectIdType(contentId);
    
    if (!detectionResult.isValid) {
      throw new Error(`ID inválido: ${detectionResult.error}`);
    }

    const sourceService = detectionResult.type;
    
    if (sourceService === targetService) {
      return {
        success: true,
        convertedId: contentId,
        sourceService,
        targetService,
        cached: false,
        message: 'ID ya es del servicio destino'
      };
    }

    const cacheKey = `conversion:${sourceService}:${targetService}:${contentId}`;
    const cached = await this.#getCachedConversion(cacheKey);
    
    if (cached) {
      return { ...cached, cached: true };
    }

    const convertedId = await this.#performConversion(contentId, sourceService, targetService, options);
    const result = {
      success: true,
      convertedId,
      sourceService,
      targetService,
      cached: false,
      timestamp: Date.now()
    };

    await this.#cacheConversion(cacheKey, result);
    return result;
  }

  /**
   * Convierte ID de Kitsu a IMDb usando múltiples estrategias
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {Promise<Object>} Resultado de conversión
   */
  async convertKitsuToImdb(kitsuId) {
    const cacheKey = `kitsu:${kitsuId}->imdb`;
    
    // Verificar cache
    const cached = await this.#getCachedConversion(cacheKey);
    if (cached) {
      return {
        success: true,
        convertedId: cached.id,
        method: 'cache',
        metadata: cached.metadata
      };
    }

    try {
      // Servicios Kitsu eliminados - conversión no disponible
      return {
        success: false,
        convertedId: null,
        method: 'not_supported',
        metadata: { error: 'Conversión Kitsu->IMDb no disponible - servicios Kitsu eliminados' }
      };

    } catch (error) {
      this.logger.error(`Error convirtiendo Kitsu ID ${kitsuId}:`, error);
      return {
        success: false,
        convertedId: null,
        method: 'error',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Realiza conversión entre tipos de ID
   * @param {string} sourceId - ID fuente
   * @param {string} sourceType - Tipo fuente
   * @param {string} targetType - Tipo objetivo
   * @returns {Promise<Object>} Resultado de conversión
   */
  async #performConversion(sourceId, sourceType, targetType) {
    if (sourceType === 'kitsu' && targetType === 'imdb') {
      return await this.convertKitsuToImdb(sourceId);
    }
    
    if ((sourceType === 'mal' || sourceType === 'anilist' || sourceType === 'anidb') && targetType === 'imdb') {
      return await this.convertAnimeIdToImdb(sourceId, sourceType);
    }
    
    if (sourceType === 'imdb' && targetType === 'kitsu') {
      // Conversión IMDb->Kitsu no implementada actualmente
      return {
        success: false,
        convertedId: null,
        method: 'not_supported',
        metadata: { error: 'Conversión IMDb->Kitsu no soportada actualmente' }
      };
    }

    return {
      success: false,
      convertedId: null,
      method: 'invalid_conversion',
      metadata: { error: `Conversión ${sourceType}->${targetType} no válida` }
    };
  }

  /**
   * Convierte ID de anime (MAL, AniList, AniDB) a IMDb usando mapeo unificado
   * @param {string} animeId - ID numérico del servicio de anime
   * @param {string} sourceType - Tipo de servicio (mal, anilist, anidb)
   * @returns {Promise<Object>} Resultado de conversión
   */
  async convertAnimeIdToImdb(animeId, sourceType) {
    // Construir ID completo con prefijo
    const fullId = `${sourceType}:${animeId}`;
    const cacheKey = `${fullId}->imdb`;
    
    // Verificar cache
    const cached = await this.#getCachedConversion(cacheKey);
    if (cached) {
      return {
        success: true,
        convertedId: cached.id,
        method: 'cache',
        metadata: cached.metadata
      };
    }
    
    // Conversión directa no disponible - servicios de mapeo no implementados
    return {
      success: false,
      convertedId: null,
      method: 'not_supported',
      metadata: { 
        error: `Conversión ${sourceType.toUpperCase()}→IMDb no disponible`,
        note: 'Servicios de mapeo unificado no implementados'
      }
    };
  }

  /**
   * Crea resultado estandarizado de procesamiento
   * @param {boolean} success - Si el procesamiento fue exitoso
   * @param {string|null} processedId - ID procesado
   * @param {string} originalId - ID original
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Resultado de procesamiento
   */
  #createProcessingResult(success, processedId, originalId, metadata = {}) {
    return {
      success,
      processedId,
      originalId,
      timestamp: new Date().toISOString(),
      ...metadata
    };
  }

  /**
   * Valida los parámetros de entrada para la conversión
   * @param {string} contentId - ID a convertir
   * @param {string} targetService - Servicio destino
   */
  #validateConversionInput(contentId, targetService) {
    if (!contentId || typeof contentId !== 'string') {
      throw new Error('contentId debe ser una cadena no vacía');
    }
    
    if (!targetService || typeof targetService !== 'string') {
      throw new Error('targetService debe ser una cadena no vacía');
    }
    
    const validServices = ['imdb', 'kitsu', 'mal', 'anilist', 'anidb'];
    if (!validServices.includes(targetService.toLowerCase())) {
      throw new Error(`targetService debe ser uno de: ${validServices.join(', ')}`);
    }
  }

  /**
   * Almacena conversión en cache
   * @param {string} cacheKey - Clave de cache
   * @param {Object} result - Resultado de conversión
   */
  async #cacheConversion(cacheKey, result) {
    try {
      await this.cacheService.set(cacheKey, result, this.CONVERSION_CACHE_TTL);
    } catch (error) {
      this.logger.warn('Error almacenando conversión en cache:', error);
    }
  }

  /**
   * Obtiene conversión desde cache
   * @param {string} cacheKey - Clave de cache
   * @returns {Object|null} Datos cacheados o null
   */
  async #getCachedConversion(cacheKey) {
    try {
      const cached = await this.cacheService.get(cacheKey);
      return cached || null;
    } catch (error) {
      this.logger.warn('Error obteniendo conversión desde cache:', error);
      return null;
    }
  }

}

// Crear instancia singleton con dependencias
const unifiedIdService = new UnifiedIdService({
  idDetectorService,
  cacheService,
  config: addonConfig
});

export { unifiedIdService };