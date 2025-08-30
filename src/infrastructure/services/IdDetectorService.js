/**
 * Servicio para detectar dinámicamente el tipo de ID de contenido
 * Implementa detección autónoma sin hardcodeos siguiendo principios SOLID
 */

export class IdDetectorService {
  constructor() {
    // Patrones de detección configurables y extensibles
    this.detectionPatterns = new Map([
      ['imdb', {
        pattern: /^tt\d+$/,
        prefix: 'tt',
        description: 'IMDb ID format (tt followed by digits)',
        validator: (id) => this.#validateImdbFormat(id)
      }],
      ['kitsu', {
        pattern: /^(kitsu:)?\d+$/,
        prefix: 'kitsu:',
        description: 'Kitsu ID format (optional kitsu: prefix followed by digits)',
        validator: (id) => this.#validateKitsuFormat(id)
      }],
      ['mal', {
        pattern: /^(mal:)?\d+$/,
        prefix: 'mal:',
        description: 'MyAnimeList ID format (optional mal: prefix followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'mal')
      }],
      ['anilist', {
        pattern: /^(anilist:)?\d+$/,
        prefix: 'anilist:',
        description: 'AniList ID format (optional anilist: prefix followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'anilist')
      }],
      ['anidb', {
        pattern: /^(anidb:)?\d+$/,
        prefix: 'anidb:',
        description: 'AniDB ID format (optional anidb: prefix followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'anidb')
      }]
    ]);
  }

  /**
   * Detecta el tipo de ID de forma autónoma
   * @param {string} contentId - ID de contenido a analizar
   * @returns {Object} Resultado de detección con tipo, ID normalizado y metadatos
   */
  detectIdType(contentId) {
    if (!contentId || typeof contentId !== 'string') {
      return this.#createDetectionResult('unknown', contentId, false, 'ID inválido o vacío');
    }

    const normalizedId = contentId.trim();
    
    // Detectar tipo usando patrones configurables
    for (const [type, config] of this.detectionPatterns) {
      if (config.pattern.test(normalizedId) && config.validator(normalizedId)) {
        const cleanId = this.#extractCleanId(normalizedId, type);
        return this.#createDetectionResult(type, cleanId, true, `Detectado como ${type.toUpperCase()}`);
      }
    }

    return this.#createDetectionResult('unknown', normalizedId, false, 'Formato de ID no reconocido');
  }

  /**
   * Extrae el ID limpio sin prefijos
   * @param {string} id - ID original
   * @param {string} type - Tipo detectado
   * @returns {string} ID limpio
   */
  #extractCleanId(id, type) {
    const config = this.detectionPatterns.get(type);
    if (!config) return id;

    switch (type) {
      case 'imdb':
        return id; // IMDb IDs mantienen el prefijo 'tt'
      case 'kitsu':
        return id.replace(/^kitsu:/, ''); // Remover prefijo 'kitsu:' si existe
      case 'mal':
        return id.replace(/^mal:/, ''); // Remover prefijo 'mal:' si existe
      case 'anilist':
        return id.replace(/^anilist:/, ''); // Remover prefijo 'anilist:' si existe
      case 'anidb':
        return id.replace(/^anidb:/, ''); // Remover prefijo 'anidb:' si existe
      default:
        return id;
    }
  }

  /**
   * Valida formato de ID de IMDb
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateImdbFormat(id) {
    if (!id.startsWith('tt')) return false;
    const numericPart = id.slice(2);
    return /^\d+$/.test(numericPart) && numericPart.length >= 7;
  }

  /**
   * Valida formato de ID de Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateKitsuFormat(id) {
    const cleanId = id.replace(/^kitsu:/, '');
    return /^\d+$/.test(cleanId) && parseInt(cleanId) > 0;
  }

  /**
   * Valida formato numérico genérico para IDs de anime
   * @param {string} id - ID a validar
   * @param {string} prefix - Prefijo esperado (mal, anilist, anidb)
   * @returns {boolean} True si es válido
   */
  #validateNumericFormat(id, prefix) {
    const cleanId = id.replace(new RegExp(`^${prefix}:`), '');
    return /^\d+$/.test(cleanId) && parseInt(cleanId) > 0;
  }

  /**
   * Crea resultado de detección estandarizado
   * @param {string} type - Tipo detectado
   * @param {string} id - ID procesado
   * @param {boolean} isValid - Si la detección fue exitosa
   * @param {string} message - Mensaje descriptivo
   * @returns {Object} Resultado de detección
   */
  #createDetectionResult(type, id, isValid, message) {
    return {
      type,
      id,
      originalId: id,
      isValid,
      message,
      timestamp: new Date().toISOString(),
      confidence: isValid ? 1.0 : 0.0
    };
  }

  /**
   * Verifica si un ID es de tipo IMDb
   * @param {string} contentId - ID a verificar
   * @returns {boolean} True si es IMDb
   */
  isImdbId(contentId) {
    const result = this.detectIdType(contentId);
    return result.type === 'imdb' && result.isValid;
  }

  /**
   * Verifica si un ID es de tipo Kitsu
   * @param {string} contentId - ID a verificar
   * @returns {boolean} True si es Kitsu
   */
  isKitsuId(contentId) {
    const result = this.detectIdType(contentId);
    return result.type === 'kitsu' && result.isValid;
  }

  /**
   * Verifica si un ID es de tipo MyAnimeList
   * @param {string} contentId - ID a verificar
   * @returns {boolean} True si es MyAnimeList
   */
  isMalId(contentId) {
    const result = this.detectIdType(contentId);
    return result.type === 'mal' && result.isValid;
  }

  /**
   * Verifica si un ID es de tipo AniList
   * @param {string} contentId - ID a verificar
   * @returns {boolean} True si es AniList
   */
  isAnilistId(contentId) {
    const result = this.detectIdType(contentId);
    return result.type === 'anilist' && result.isValid;
  }

  /**
   * Verifica si un ID es de tipo AniDB
   * @param {string} contentId - ID a verificar
   * @returns {boolean} True si es AniDB
   */
  isAnidbId(contentId) {
    const result = this.detectIdType(contentId);
    return result.type === 'anidb' && result.isValid;
  }

  /**
   * Normaliza un ID según su tipo detectado
   * @param {string} contentId - ID a normalizar
   * @returns {Object} ID normalizado con metadatos
   */
  normalizeId(contentId) {
    const detection = this.detectIdType(contentId);
    
    if (!detection.isValid) {
      return {
        normalized: contentId,
        type: 'unknown',
        isValid: false,
        error: detection.message
      };
    }

    return {
      normalized: detection.id,
      type: detection.type,
      isValid: true,
      originalFormat: contentId,
      detectionInfo: detection
    };
  }

  /**
   * Obtiene estadísticas de tipos de ID soportados
   * @returns {Object} Estadísticas de configuración
   */
  getSupportedTypes() {
    const types = {};
    for (const [type, config] of this.detectionPatterns) {
      types[type] = {
        description: config.description,
        pattern: config.pattern.source,
        prefix: config.prefix
      };
    }
    return types;
  }

  /**
   * Agrega un nuevo patrón de detección de forma dinámica
   * @param {string} type - Tipo de ID
   * @param {Object} config - Configuración del patrón
   */
  addDetectionPattern(type, config) {
    if (!config.pattern || !config.validator) {
      throw new Error('Configuración de patrón inválida: se requiere pattern y validator');
    }
    
    this.detectionPatterns.set(type, {
      pattern: config.pattern,
      prefix: config.prefix || '',
      description: config.description || `Patrón personalizado para ${type}`,
      validator: config.validator
    });
  }
}

// Instancia singleton
export const idDetectorService = new IdDetectorService();