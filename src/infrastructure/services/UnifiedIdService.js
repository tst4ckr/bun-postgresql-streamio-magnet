/**
 * Servicio unificado para manejo de IDs de contenido
 * Integra detección, conversión y mapeo de IDs de forma autónoma
 * Sigue principios de arquitectura limpia y responsabilidad única
 */

import { idDetectorService } from './IdDetectorService.js';
import { kitsuApiService } from './KitsuApiService.js';
import { kitsuMappingFallback } from './KitsuMappingFallback.js';

export class UnifiedIdService {
  constructor(detectorService, apiService, fallbackService) {
    this.detectorService = detectorService;
    this.apiService = apiService;
    this.fallbackService = fallbackService;
    
    // Cache para optimizar conversiones repetidas
    this.conversionCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 horas
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
      console.error('Error procesando ID de contenido:', error);
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
      // Estrategia 1: API de Kitsu
      const apiResult = await this.apiService.getImdbIdFromKitsu(kitsuId);
      if (apiResult) {
        const result = {
          success: true,
          convertedId: apiResult,
          method: 'kitsu_api',
          metadata: { source: 'Kitsu API oficial' }
        };
        this.#setCachedConversion(cacheKey, apiResult, result.metadata);
        return result;
      }

      // Estrategia 2: Mapeo manual de fallback
      const fallbackResult = this.fallbackService.getImdbIdFromKitsu(kitsuId);
      if (fallbackResult) {
        const metadata = this.fallbackService.getAnimeMetadata(kitsuId);
        const result = {
          success: true,
          convertedId: fallbackResult,
          method: 'manual_mapping',
          metadata: { 
            source: 'Mapeo manual verificado',
            animeData: metadata
          }
        };
        this.#setCachedConversion(cacheKey, fallbackResult, result.metadata);
        return result;
      }

      // No se encontró mapeo
      return {
        success: false,
        convertedId: null,
        method: 'none',
        metadata: { error: 'No se encontró mapeo Kitsu->IMDb' }
      };

    } catch (error) {
      console.error(`Error convirtiendo Kitsu ID ${kitsuId}:`, error);
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
   * Convierte ID de anime (MAL, AniList, AniDB) a IMDb usando mapeo directo
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
    
    // Intentar mapeo directo con el servicio unificado
    const imdbId = this.fallbackService.getImdbIdFromAny(fullId);
    if (imdbId) {
      const result = {
        success: true,
        convertedId: imdbId,
        method: 'direct_mapping',
        metadata: { source: 'Mapeo unificado', originalId: fullId }
      };
      this.#setCachedConversion(cacheKey, imdbId, result.metadata);
      return result;
    }

    try {
      // Por ahora, usamos mapeo directo a IMDb como fallback
      // En futuras implementaciones, podríamos usar APIs de conversión cruzada
      const directMapping = await this.#getDirectImdbMapping(animeId, sourceType);
      
      if (directMapping) {
        const result = {
          success: true,
          convertedId: directMapping,
          method: `${sourceType}_direct_mapping`,
          metadata: { 
            source: `Mapeo directo ${sourceType.toUpperCase()}→IMDb`,
            originalType: sourceType
          }
        };
        this.#setCachedConversion(cacheKey, directMapping, result.metadata);
        return result;
      }

      // No se encontró mapeo
      return {
        success: false,
        convertedId: null,
        method: 'none',
        metadata: { 
          error: `No se encontró mapeo ${sourceType.toUpperCase()}→IMDb`,
          note: 'Conversión cruzada requiere implementación adicional'
        }
      };

    } catch (error) {
      console.error(`Error convirtiendo ${sourceType.toUpperCase()} ID ${animeId}:`, error);
      return {
        success: false,
        convertedId: null,
        method: 'error',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Obtiene mapeo directo a IMDb para servicios de anime usando conversión cruzada
   * @param {string} animeId - ID del servicio de anime
   * @param {string} sourceType - Tipo de servicio (mal, anilist, anidb)
   * @returns {Promise<string|null>} IMDb ID o null
   */
  async #getDirectImdbMapping(animeId, sourceType) {
    try {
      // Mapeo de tipos de servicio a sitios externos en Kitsu
      const siteMapping = {
        'mal': 'myanimelist',
        'anilist': 'anilist',
        'anidb': 'anidb'
      };

      const externalSite = siteMapping[sourceType];
      if (!externalSite) {
        console.warn(`Tipo de servicio no soportado: ${sourceType}`);
        return null;
      }

      console.info(`Buscando mapeo ${sourceType.toUpperCase()}→Kitsu→IMDb para ID: ${animeId}`);
      
      // Obtener Kitsu ID desde el servicio externo
      const kitsuId = await this.kitsuApiService.getKitsuIdFromExternal(animeId, externalSite);
      if (!kitsuId) {
        console.warn(`No se encontró Kitsu ID para ${sourceType}:${animeId}`);
        return null;
      }

      console.info(`Encontrado mapeo ${sourceType}:${animeId} → ${kitsuId}`);
      
      // Obtener IMDb ID desde Kitsu ID
      const imdbId = await this.kitsuApiService.getImdbIdFromKitsu(kitsuId);
      if (!imdbId) {
        console.warn(`No se encontró IMDb ID para ${kitsuId}`);
        return null;
      }

      console.info(`Conversión exitosa: ${sourceType}:${animeId} → ${kitsuId} → ${imdbId}`);
      return imdbId;

    } catch (error) {
      console.error(`Error en mapeo ${sourceType.toUpperCase()}→IMDb para ${animeId}:`, error.message);
      return null;
    }
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
   * Obtiene estadísticas del servicio
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return {
      cacheSize: this.conversionCache.size,
      supportedTypes: this.detectorService.getSupportedTypes(),
      fallbackMappings: this.fallbackService.getStats()
    };
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
export const unifiedIdService = new UnifiedIdService(
  idDetectorService,
  kitsuApiService,
  kitsuMappingFallback
);