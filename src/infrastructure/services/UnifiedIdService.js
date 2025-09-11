/**
 * Servicio unificado para manejo de IDs de contenido
 * Integra detección, conversión y mapeo de IDs de forma autónoma
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { idDetectorService } from './IdDetectorService.js';
import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { CONSTANTS } from '../../config/constants.js';

export class UnifiedIdService {
  constructor(detectorService) {
    this.detectorService = detectorService;
    this.enhancedLogger = new EnhancedLogger('info', true);
    
    // Cache para optimizar conversiones repetidas
    this.conversionCache = new Map();
    this.cacheExpiry = CONSTANTS.CACHE.UNIFIED_ID_CACHE_EXPIRY; // 24 horas
  }

  /**
   * Procesa cualquier tipo de ID y lo convierte al formato requerido
   * @param {string} contentId - ID de contenido (Kitsu o IMDb)
   * @param {string} targetFormat - Formato objetivo ('imdb' o 'kitsu')
   * @returns {Promise<Object>} Resultado de conversión con metadatos
   */
  async processContentId(contentId, targetFormat = 'imdb') {
    try {
      // Detectar tipo de ID de entrada
      const detection = this.detectorService.detectIdType(contentId);
      
      if (!detection.isValid) {
        return this.#createProcessingResult(false, null, contentId, {
          error: 'ID de contenido inválido',
          details: detection.message
        });
      }

      // Si ya está en el formato objetivo, retornar directamente
      if (detection.type === targetFormat) {
        return this.#createProcessingResult(true, detection.id, contentId, {
          message: `ID ya está en formato ${targetFormat}`,
          sourceType: detection.type,
          targetType: targetFormat,
          conversionRequired: false
        });
      }

      // Realizar conversión según el tipo detectado
      const conversionResult = await this.#performConversion(
        detection.id, 
        detection.type, 
        targetFormat
      );

      return this.#createProcessingResult(
        conversionResult.success,
        conversionResult.convertedId,
        contentId,
        {
          sourceType: detection.type,
          targetType: targetFormat,
          conversionRequired: true,
          conversionMethod: conversionResult.method,
          metadata: conversionResult.metadata
        }
      );

    } catch (error) {
      this.enhancedLogger.error('Error procesando ID de contenido:', error);
      return this.#createProcessingResult(false, null, contentId, {
        error: 'Error interno durante el procesamiento',
        details: error.message
      });
    }
  }

  /**
   * Convierte ID de Kitsu a IMDb usando múltiples estrategias
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {Promise<Object>} Resultado de conversión
   */
  async convertKitsuToImdb(kitsuId) {
    const cacheKey = `kitsu:${kitsuId}->imdb`;
    
    // Verificar cache
    const cached = this.#getCachedConversion(cacheKey);
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
      this.enhancedLogger.error(`Error convirtiendo Kitsu ID ${kitsuId}:`, error);
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
    const cached = this.#getCachedConversion(cacheKey);
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
   * Obtiene conversión desde cache
   * @param {string} cacheKey - Clave de cache
   * @returns {Object|null} Datos cacheados o null
   */
  #getCachedConversion(cacheKey) {
    const cached = this.conversionCache.get(cacheKey);
    if (!cached) return null;

    // Verificar expiración
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.conversionCache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * Almacena conversión en cache
   * @param {string} cacheKey - Clave de cache
   * @param {string} id - ID convertido
   * @param {Object} metadata - Metadatos
   */
  #setCachedConversion(cacheKey, id, metadata) {
    this.conversionCache.set(cacheKey, {
      id,
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Limpia cache expirado
   */
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.conversionCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.conversionCache.delete(key);
      }
    }
  }

  /**
   * Valida si un ID es procesable por el servicio
   * @param {string} contentId - ID a validar
   * @returns {boolean} True si es procesable
   */
  isProcessableId(contentId) {
    const detection = this.detectorService.detectIdType(contentId);
    return detection.isValid;
  }
}

// Instancia singleton con dependencias inyectadas
export const unifiedIdService = new UnifiedIdService(idDetectorService);