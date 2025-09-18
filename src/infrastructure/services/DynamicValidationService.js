/**
 * Servicio de validación dinámica de IDs de contenido
 * Se adapta automáticamente al tipo de ID detectado
 * Implementa validación contextual y reglas de negocio flexibles
 */

import { idDetectorService } from './IdDetectorService.js';
import { unifiedIdService } from './UnifiedIdService.js';
import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { CONSTANTS } from '../../config/constants.js';

export class DynamicValidationService {
  constructor({ idDetectorService, unifiedIdService, logger, config }) {
    this.idDetectorService = idDetectorService;
    this.unifiedIdService = unifiedIdService;
    this.logger = logger || new EnhancedLogger('DynamicValidationService');
    this.config = config;
    
    this.validationRules = this.#initializeValidationRules();
    
    this.logger.info('DynamicValidationService inicializado', {
      rulesCount: this.validationRules.size,
      contexts: Array.from(this.validationRules.keys())
    });
  }

  #initializeValidationRules() {
    return new Map([
      ['imdb', {
        minLength: 9, // tt + 7 dígitos mínimo
        maxLength: 15,
        requiredPrefix: 'tt',
        allowedChars: /^tt\d+$/,
        businessRules: [
          this.#validateImdbBusinessRules.bind(this)
        ]
      }],
      ['imdb_series', {
        minLength: 11, // tt + dígitos + :season:episode
        maxLength: 25,
        allowedChars: /^tt\d+:\d+:\d+$/,
        businessRules: [
          this.#validateImdbSeriesBusinessRules.bind(this)
        ]
      }],
      ['kitsu', {
        minLength: 1,
        maxLength: 10,
        allowedChars: /^(kitsu:)?\d+$/,
        businessRules: [
          this.#validateKitsuBusinessRules.bind(this)
        ]
      }],
      ['kitsu_series', {
        minLength: 3,
        maxLength: 25,
        allowedChars: /^kitsu:\d+:\d+$/,
        businessRules: [
          this.#validateKitsuSeriesBusinessRules.bind(this)
        ]
      }],
      ['mal', {
        minLength: 1,
        maxLength: 10,
        allowedChars: /^(mal:)?\d+$/,
        businessRules: [
          this.#validateAnimeIdBusinessRules.bind(this, 'mal')
        ]
      }],
      ['anilist', {
        minLength: 1,
        maxLength: 10,
        allowedChars: /^(anilist:)?\d+$/,
        businessRules: [
          this.#validateAnimeIdBusinessRules.bind(this, 'anilist')
        ]
      }],
      ['anidb', {
        minLength: 1,
        maxLength: 10,
        allowedChars: /^(anidb:)?\d+$/,
        businessRules: [
          this.#validateAnimeIdBusinessRules.bind(this, 'anidb')
        ]
      }],
      ['mal_series', {
        minLength: 3,
        maxLength: 25,
        allowedChars: /^(mal:)?\d+:\d+:\d+$/,
        businessRules: [
          this.#validateAnimeSeriesBusinessRules.bind(this, 'mal')
        ]
      }],
      ['anilist_series', {
        minLength: 3,
        maxLength: 25,
        allowedChars: /^(anilist:)?\d+:\d+:\d+$/,
        businessRules: [
          this.#validateAnimeSeriesBusinessRules.bind(this, 'anilist')
        ]
      }],
      ['anidb_series', {
        minLength: 3,
        maxLength: 25,
        allowedChars: /^(anidb:)?\d+:\d+:\d+$/,
        businessRules: [
          this.#validateAnimeSeriesBusinessRules.bind(this, 'anidb')
        ]
      }]
    ]);
    
    // Contextos de validación
    this.validationContexts = new Map([
      ['stream_request', {
        description: 'Validación para peticiones de stream',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'kitsu_series', 'mal', 'mal_series', 'anilist', 'anilist_series', 'anidb', 'anidb_series'],
        allowConversion: false,
        strictMode: false
      }],
      ['api_endpoint', {
        description: 'Validación para endpoints de API',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'kitsu_series', 'mal', 'mal_series', 'anilist', 'anilist_series', 'anidb', 'anidb_series'],
        allowConversion: false,
        strictMode: true
      }],
      ['diagnostic', {
        description: 'Validación para herramientas de diagnóstico',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'kitsu_series', 'mal', 'mal_series', 'anilist', 'anilist_series', 'anidb', 'anidb_series'],
        allowConversion: true,
        strictMode: false
      }]
    ]);
  }

  /**
   * Valida un ID según su tipo detectado
   * @param {string} contentId - ID a validar
   * @param {string} context - Contexto de validación (stream_request, api_endpoint, diagnostic)
   * @returns {Object} Resultado de validación
   */
  validateId(contentId, context = 'stream_request') {
    if (!contentId || typeof contentId !== 'string') {
      return {
        isValid: false,
        error: 'ID inválido: debe ser una cadena no vacía',
        context
      };
    }

    const detectionResult = this.idDetectorService.detectIdType(contentId);
    
    if (!detectionResult.isValid) {
      return {
        isValid: false,
        error: detectionResult.error || 'Tipo de ID no reconocido',
        context,
        idType: 'unknown'
      };
    }

    const idType = detectionResult.type;
    const rules = this.validationRules.get(idType);
    
    if (!rules) {
      return {
        isValid: false,
        error: `No hay reglas de validación para el tipo: ${idType}`,
        context,
        idType
      };
    }

    const validation = this.#validateAgainstRules(contentId, rules, idType, context);
    if (!validation.isValid) {
      return validation;
    }

    return {
      isValid: true,
      idType,
      context,
      normalizedId: contentId,
      metadata: {
        service: idType.split('_')[0],
        hasPrefix: contentId.includes(':'),
        length: contentId.length
      }
    };
  }

  /**
   * Valida un ID contra las reglas específicas
   * @param {string} contentId - ID a validar
   * @param {Object} rules - Reglas de validación
   * @param {string} idType - Tipo de ID
   * @param {string} context - Contexto de validación
   * @returns {Object} Resultado de validación
   */
  #validateAgainstRules(contentId, rules, idType, context) {
    if (contentId.length < rules.minLength) {
      return {
        isValid: false,
        error: `ID demasiado corto para ${idType}. Mínimo: ${rules.minLength}, actual: ${contentId.length}`,
        context,
        idType
      };
    }

    if (contentId.length > rules.maxLength) {
      return {
        isValid: false,
        error: `ID demasiado largo para ${idType}. Máximo: ${rules.maxLength}, actual: ${contentId.length}`,
        context,
        idType
      };
    }

    if (rules.allowedChars && !rules.allowedChars.test(contentId)) {
      return {
        isValid: false,
        error: `Formato inválido para ${idType}`,
        context,
        idType
      };
    }

    if (context === 'stream_request' && rules.requiredPrefix && !contentId.includes(':')) {
      return {
        isValid: false,
        error: `ID debe incluir prefijo de servicio para ${idType} (ej: mal:12345)`,
        context,
        idType
      };
    }

    return { isValid: true };
  }

  /**
   * Valida según el tipo detectado
   * @param {Object} detection - Resultado de detección
   * @param {Object} context - Contexto de validación
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación por tipo
   */
  async #validateByType(detection, context, options) {
    // Validación de entrada con early returns
    if (!detection || typeof detection !== 'object') {
      return this.#createValidationResult(false, null, {
        error: 'Resultado de detección requerido y debe ser objeto',
        provided: typeof detection
      });
    }

    if (!detection.type || typeof detection.type !== 'string') {
      return this.#createValidationResult(false, detection.id, {
        error: 'Tipo de detección requerido y debe ser string',
        provided: typeof detection.type
      });
    }

    if (!detection.id || typeof detection.id !== 'string') {
      return this.#createValidationResult(false, detection.id, {
        error: 'ID de detección requerido y debe ser string',
        provided: typeof detection.id
      });
    }

    if (!context || typeof context !== 'object') {
      return this.#createValidationResult(false, detection.id, {
        error: 'Contexto de validación requerido y debe ser objeto',
        provided: typeof context
      });
    }

    if (!options || typeof options !== 'object') {
      return this.#createValidationResult(false, detection.id, {
        error: 'Opciones deben ser un objeto',
        provided: typeof options
      });
    }

    const rules = this.validationRules.get(detection.type);
    if (!rules) {
      return this.#createValidationResult(false, detection.id, {
        error: `No hay reglas de validación para tipo '${detection.type}'`
      });
    }

    // Validar estructura de reglas
    if (!rules.minLength || !rules.maxLength || !rules.allowedChars || !Array.isArray(rules.businessRules)) {
      return this.#createValidationResult(false, detection.id, {
        error: `Reglas de validación malformadas para tipo '${detection.type}'`,
        rulesStructure: Object.keys(rules)
      });
    }

    // Validar longitud
    if (detection.id.length < rules.minLength || detection.id.length > rules.maxLength) {
      return this.#createValidationResult(false, detection.id, {
        error: `Longitud inválida para ${detection.type}`,
        expected: `${rules.minLength}-${rules.maxLength} caracteres`,
        actual: detection.id.length
      });
    }

    // Validar caracteres permitidos
    if (!rules.allowedChars.test(detection.id)) {
      return this.#createValidationResult(false, detection.id, {
        error: `Formato de caracteres inválido para ${detection.type}`,
        pattern: rules.allowedChars.source
      });
    }

    // Aplicar reglas de negocio específicas
    for (const businessRule of rules.businessRules) {
      if (typeof businessRule !== 'function') {
        return this.#createValidationResult(false, detection.id, {
          error: `Regla de negocio inválida para tipo '${detection.type}' - debe ser función`,
          ruleType: typeof businessRule
        });
      }

      const ruleResult = await businessRule(detection, context, options);
      if (!ruleResult.isValid) {
        return ruleResult;
      }
    }

    return this.#createValidationResult(true, detection.id, {
      type: detection.type,
      rulesApplied: rules.businessRules.length
    });
  }

  /**
   * Valida capacidad de conversión
   * @param {Object} detection - Resultado de detección
   * @param {Object} context - Contexto de validación
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación de conversión
   */
  async #validateConversion(detection, context, options) {
    if (!context.allowConversion) {
      return this.#createValidationResult(true, detection.id, {
        conversionRequired: false,
        reason: 'Conversión no requerida en este contexto'
      });
    }

    // Verificar si se puede procesar para conversión
    const targetFormat = options.targetFormat || 'imdb';
    if (detection.type === targetFormat) {
      return this.#createValidationResult(true, detection.id, {
        conversionRequired: false,
        reason: 'ID ya está en formato objetivo'
      });
    }

    // Si no hay servicio de conversión, permitir validación sin conversión
    if (!this.unifiedService) {
      return this.#createValidationResult(true, detection.id, {
        conversionRequired: false,
        reason: 'Servicio de conversión no disponible',
        note: 'Validación continúa sin conversión'
      });
    }

    // Probar conversión si es necesaria
    try {
      const conversionResult = await this.unifiedService.processContentId(
        detection.originalId, 
        targetFormat
      );
      
      return this.#createValidationResult(conversionResult.success, detection.id, {
        conversionRequired: true,
        conversionPossible: conversionResult.success,
        conversionMethod: conversionResult.conversionMethod,
        targetFormat
      });
    } catch (error) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Error validando conversión',
        details: error.message
      });
    }
  }

  /**
   * Reglas de negocio para IDs de IMDb
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateImdbBusinessRules(detection, context, options) {
    // Verificar que el ID numérico sea válido
    const numericPart = detection.id.slice(2);
    const numericValue = parseInt(numericPart);
    
    if (numericValue < 1) {
      return this.#createValidationResult(false, detection.id, {
        error: 'ID numérico de IMDb debe ser mayor a 0',
        numericPart,
        numericValue
      });
    }

    // En modo estricto, verificar formato estándar
    if (context.strictMode && numericPart.length < 7) {
      return this.#createValidationResult(false, detection.id, {
        error: 'En modo estricto, IMDb ID debe tener al menos 7 dígitos',
        actualDigits: numericPart.length
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: 'imdb_format',
      numericValue,
      strictMode: context.strictMode
    });
  }

  /**
   * Reglas de negocio para IDs de Kitsu
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateKitsuBusinessRules(detection, context, options) {
    const cleanId = detection.id.replace(/^kitsu:/, '');
    const numericValue = parseInt(cleanId);
    
    if (numericValue < 1) {
      return this.#createValidationResult(false, detection.id, {
        error: 'ID numérico de Kitsu debe ser mayor a 0',
        cleanId,
        numericValue
      });
    }

    // Verificar rango razonable para IDs de Kitsu
    if (numericValue > 1000000) {
      return this.#createValidationResult(false, detection.id, {
        error: 'ID de Kitsu fuera del rango esperado',
        numericValue,
        maxExpected: 1000000
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: 'kitsu_format',
      numericValue,
      cleanId
    });
  }

  /**
   * Reglas de negocio genéricas para IDs de anime (MAL, AniList, AniDB)
   * @param {string} type - Tipo de anime ID (mal, anilist, anidb)
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateAnimeIdBusinessRules(type, detection, context, options) {
    const prefixMap = {
      mal: 'mal:',
      anilist: 'anilist:',
      anidb: 'anidb:'
    };
    
    const cleanId = detection.id.replace(new RegExp(`^${prefixMap[type]}`), '');
    const numericValue = parseInt(cleanId);
    
    if (numericValue < 1) {
      return this.#createValidationResult(false, detection.id, {
        error: `ID numérico de ${type.toUpperCase()} debe ser mayor a 0`,
        numericPart: cleanId,
        numericValue,
        type
      });
    }

    // Rangos razonables según el servicio
    const maxRanges = {
      mal: CONSTANTS.NETWORK.PROVIDER_TIMEOUTS.MAL,
      anilist: 200000,
      anidb: CONSTANTS.NETWORK.PROVIDER_TIMEOUTS.ANIDB
    };

    if (context.strictMode && numericValue > maxRanges[type]) {
      return this.#createValidationResult(false, detection.id, {
        error: `En modo estricto, ${type.toUpperCase()} ID debe ser razonable`,
        actualValue: numericValue,
        maxExpected: maxRanges[type],
        type
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: `${type}_format`,
      numericValue,
      type,
      strictMode: context.strictMode
    });
  }

  /**
   * Genera recomendaciones basadas en la validación
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @returns {Array} Recomendaciones
   */
  /**
   * Reglas de negocio para IDs de IMDb series
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateImdbSeriesBusinessRules(detection, context, options) {
    const parts = detection.id.split(':');
    if (parts.length !== 3) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Formato de ID de serie inválido',
        expected: 'ttXXXXXXX:season:episode',
        actual: detection.id
      });
    }

    const [imdbPart, seasonPart, episodePart] = parts;
    const numericImdb = imdbPart.slice(2);
    const season = parseInt(seasonPart);
    const episode = parseInt(episodePart);

    // Validar formato IMDb
    if (!/^\d+$/.test(numericImdb)) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Formato IMDb inválido en ID de serie',
        imdbPart
      });
    }

    // Validar rango de temporada y episodio
    if (season < 1 || season > 100) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Número de temporada inválido',
        season,
        validRange: '1-100'
      });
    }

    if (episode < 1 || episode > 999) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Número de episodio inválido',
        episode,
        validRange: '1-999'
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: 'imdb_series_format',
      imdbId: imdbPart,
      season,
      episode,
      context: context.description
    });
  }

  /**
   * Reglas de negocio para IDs de series de anime genérico
   * @param {string} prefix - Prefijo del tipo de anime (mal, anilist, anidb)
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateAnimeSeriesBusinessRules(prefix, detection, context, options) {
    const parts = detection.id.split(':');
    let animeId, season, episode;
    
    // Verificar si tiene prefijo
    if (parts.length === 4 && parts[0] === prefix) {
      // Formato: prefix:id:season:episode
      animeId = parseInt(parts[1]);
      season = parseInt(parts[2]);
      episode = parseInt(parts[3]);
    } else if (parts.length === 3) {
      // Formato: id:season:episode
      animeId = parseInt(parts[0]);
      season = parseInt(parts[1]);
      episode = parseInt(parts[2]);
    } else {
      return this.#createValidationResult(false, detection.id, {
        error: `Formato de ID de serie ${prefix} inválido`,
        expected: `${prefix}:id:season:episode o id:season:episode`,
        actual: detection.id
      });
    }

    // Validar ID de anime
    if (isNaN(animeId) || animeId < 1) {
      return this.#createValidationResult(false, detection.id, {
        error: `ID de anime ${prefix} inválido`,
        animeId: parts[0],
        validRange: 'entero positivo'
      });
    }

    // Validar temporada
    if (isNaN(season) || season < 1 || season > 99) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Número de temporada inválido',
        season: parts[1],
        validRange: '1-99'
      });
    }

    // Validar número de episodio
    if (isNaN(episode) || episode < 1 || episode > 9999) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Número de episodio inválido',
        episode: parts[2],
        validRange: '1-9999'
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: `${prefix}_series_format`,
      animeId,
      season,
      episode,
      context: context.description
    });
  }

  /**
   * Reglas de negocio para IDs de Kitsu series
   * @param {Object} detection - Detección
   * @param {Object} context - Contexto
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateKitsuSeriesBusinessRules(detection, context, options) {
    const parts = detection.id.split(':');
    if (parts.length !== 3) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Formato de ID de serie Kitsu inválido',
        expected: 'kitsu:id:episode',
        actual: detection.id
      });
    }

    const [prefix, kitsuId, episodePart] = parts;
    const animeId = parseInt(kitsuId);
    const episode = parseInt(episodePart);

    // Validar prefijo
    if (prefix !== 'kitsu') {
      return this.#createValidationResult(false, detection.id, {
        error: 'Prefijo inválido para ID de serie Kitsu',
        expected: 'kitsu',
        actual: prefix
      });
    }

    // Validar ID de anime
    if (isNaN(animeId) || animeId < 1) {
      return this.#createValidationResult(false, detection.id, {
        error: 'ID de anime Kitsu inválido',
        kitsuId,
        validRange: 'entero positivo'
      });
    }

    // Validar número de episodio
    if (isNaN(episode) || episode < 1 || episode > 9999) {
      return this.#createValidationResult(false, detection.id, {
        error: 'Número de episodio inválido',
        episode: episodePart,
        validRange: '1-9999'
      });
    }

    return this.#createValidationResult(true, detection.id, {
      businessRule: 'kitsu_series_format',
      kitsuId: animeId,
      episode,
      context: context.description
    });
  }

  #generateRecommendations(detection, context) {
    const recommendations = [];

    if (detection.type === 'kitsu' && context.allowConversion) {
      recommendations.push({
        type: 'conversion',
        message: 'Considere convertir a IMDb ID para mejor compatibilidad',
        action: 'convert_to_imdb'
      });
    }

    if (context.strictMode && detection.confidence < CONSTANTS.CONVERSION.PERFECT_CONFIDENCE) {
      recommendations.push({
        type: 'confidence',
        message: 'Confianza de detección baja en modo estricto',
        action: 'verify_format'
      });
    }

    return recommendations;
  }

  /**
   * Crea resultado de validación estandarizado
   * @param {boolean} isValid - Si la validación fue exitosa
   * @param {string} id - ID validado
   * @param {Object} details - Detalles adicionales
   * @returns {Object} Resultado de validación
   */
  #createValidationResult(isValid, id, details = {}) {
    return {
      isValid,
      id,
      timestamp: new Date().toISOString(),
      details,
      ...details
    };
  }


}

// Instancia singleton
export const dynamicValidationService = new DynamicValidationService(
  idDetectorService,
  unifiedIdService
);