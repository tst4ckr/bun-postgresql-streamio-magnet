/**
 * Servicio de validación dinámica de IDs de contenido
 * Se adapta automáticamente al tipo de ID detectado
 * Implementa validación contextual y reglas de negocio flexibles
 */

import { idDetectorService } from './IdDetectorService.js';
import { unifiedIdService } from './UnifiedIdService.js';

export class DynamicValidationService {
  constructor(detectorService, unifiedService) {
    this.detectorService = detectorService;
    this.unifiedService = unifiedService;
    
    // Reglas de validación configurables por tipo
    this.validationRules = new Map([
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
      }]
    ]);
    
    // Contextos de validación
    this.validationContexts = new Map([
      ['stream_request', {
        description: 'Validación para peticiones de stream',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'mal', 'anilist', 'anidb'],
        allowConversion: true,
        strictMode: false
      }],
      ['api_endpoint', {
        description: 'Validación para endpoints de API',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'mal', 'anilist', 'anidb'],
        allowConversion: false,
        strictMode: true
      }],
      ['diagnostic', {
        description: 'Validación para herramientas de diagnóstico',
        requiredTypes: ['imdb', 'imdb_series', 'kitsu', 'mal', 'anilist', 'anidb'],
        allowConversion: true,
        strictMode: false
      }]
    ]);
  }

  /**
   * Valida un ID de contenido de forma dinámica
   * @param {string} contentId - ID a validar
   * @param {string} context - Contexto de validación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado de validación
   */
  async validateContentId(contentId, context = 'stream_request', options = {}) {
    try {
      // Obtener contexto de validación
      const validationContext = this.validationContexts.get(context);
      if (!validationContext) {
        return this.#createValidationResult(false, contentId, {
          error: `Contexto de validación '${context}' no reconocido`,
          availableContexts: Array.from(this.validationContexts.keys())
        });
      }

      // Detectar tipo de ID
      const detection = this.detectorService.detectIdType(contentId);
      if (!detection.isValid) {
        return this.#createValidationResult(false, contentId, {
          error: 'Formato de ID inválido',
          detection,
          context: validationContext.description
        });
      }

      // Verificar si el tipo es soportado en este contexto
      if (!validationContext.requiredTypes.includes(detection.type)) {
        return this.#createValidationResult(false, contentId, {
          error: `Tipo '${detection.type}' no soportado en contexto '${context}'`,
          supportedTypes: validationContext.requiredTypes,
          detectedType: detection.type
        });
      }

      // Aplicar reglas de validación específicas del tipo
      const typeValidation = await this.#validateByType(detection, validationContext, options);
      if (!typeValidation.isValid) {
        return typeValidation;
      }

      // Validar conversión si es necesaria y permitida
      const conversionValidation = await this.#validateConversion(
        detection, 
        validationContext, 
        options
      );
      if (!conversionValidation.isValid) {
        return conversionValidation;
      }

      return this.#createValidationResult(true, contentId, {
        detection,
        context: validationContext.description,
        typeValidation: typeValidation.details,
        conversionValidation: conversionValidation.details,
        recommendations: this.#generateRecommendations(detection, validationContext)
      });

    } catch (error) {
      return this.#createValidationResult(false, contentId, {
        error: 'Error interno durante validación',
        details: error.message,
        context
      });
    }
  }

  /**
   * Valida según el tipo detectado
   * @param {Object} detection - Resultado de detección
   * @param {Object} context - Contexto de validación
   * @param {Object} options - Opciones
   * @returns {Promise<Object>} Resultado de validación por tipo
   */
  async #validateByType(detection, context, options) {
    const rules = this.validationRules.get(detection.type);
    if (!rules) {
      return this.#createValidationResult(false, detection.id, {
        error: `No hay reglas de validación para tipo '${detection.type}'`
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
      mal: 60000,
      anilist: 200000,
      anidb: 30000
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

  #generateRecommendations(detection, context) {
    const recommendations = [];

    if (detection.type === 'kitsu' && context.allowConversion) {
      recommendations.push({
        type: 'conversion',
        message: 'Considere convertir a IMDb ID para mejor compatibilidad',
        action: 'convert_to_imdb'
      });
    }

    if (context.strictMode && detection.confidence < 1.0) {
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

  /**
   * Agrega una nueva regla de validación
   * @param {string} type - Tipo de ID
   * @param {Object} rules - Reglas de validación
   */
  addValidationRules(type, rules) {
    this.validationRules.set(type, {
      ...this.validationRules.get(type),
      ...rules
    });
  }

  /**
   * Agrega un nuevo contexto de validación
   * @param {string} name - Nombre del contexto
   * @param {Object} config - Configuración del contexto
   */
  addValidationContext(name, config) {
    this.validationContexts.set(name, config);
  }

  /**
   * Obtiene estadísticas de validación
   * @returns {Object} Estadísticas
   */
  getValidationStats() {
    return {
      supportedTypes: Array.from(this.validationRules.keys()),
      availableContexts: Array.from(this.validationContexts.keys()),
      rulesCount: this.validationRules.size,
      contextsCount: this.validationContexts.size
    };
  }
}

// Instancia singleton
export const dynamicValidationService = new DynamicValidationService(
  idDetectorService,
  unifiedIdService
);