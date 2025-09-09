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
      ['imdb_series', {
        pattern: /^tt\d+:\d+:\d+$/,
        prefix: 'tt',
        description: 'IMDb series episode format (tt:season:episode)',
        validator: (id) => this.#validateImdbSeriesFormat(id)
      }],
      ['kitsu', {
        pattern: /^kitsu:\d+$/,
        prefix: 'kitsu:',
        description: 'Kitsu ID format (kitsu: prefix required followed by digits)',
        validator: (id) => this.#validateKitsuFormat(id)
      }],
      ['kitsu_series', {
        pattern: /^kitsu:\d+:\d+$/,
        prefix: 'kitsu:',
        description: 'Kitsu series episode format (kitsu:id:episode)',
        validator: (id) => this.#validateKitsuSeriesFormat(id)
      }],
      ['mal', {
        pattern: /^(?:mal:)?\d+$/,
        prefix: 'mal:',
        description: 'MyAnimeList ID format (mal: prefix optional followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'mal')
      }],
      ['mal_series', {
        pattern: /^(?:mal:)?\d+:\d+:\d+$/,
        prefix: 'mal:',
        description: 'MyAnimeList series episode format (mal:id:season:episode)',
        validator: (id) => this.#validateAnimeSeriesFormat(id, 'mal')
      }],
      ['anilist', {
        pattern: /^(?:anilist:)?\d+$/,
        prefix: 'anilist:',
        description: 'AniList ID format (anilist: prefix optional followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'anilist')
      }],
      ['anilist_series', {
        pattern: /^(?:anilist:)?\d+:\d+:\d+$/,
        prefix: 'anilist:',
        description: 'AniList series episode format (anilist:id:season:episode)',
        validator: (id) => this.#validateAnimeSeriesFormat(id, 'anilist')
      }],
      ['anidb', {
        pattern: /^(?:anidb:)?\d+$/,
        prefix: 'anidb:',
        description: 'AniDB ID format (anidb: prefix optional followed by digits)',
        validator: (id) => this.#validateNumericFormat(id, 'anidb')
      }],
      ['anidb_series', {
        pattern: /^(?:anidb:)?\d+:\d+:\d+$/,
        prefix: 'anidb:',
        description: 'AniDB series episode format (anidb:id:season:episode)',
        validator: (id) => this.#validateAnimeSeriesFormat(id, 'anidb')
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
   * Extrae el ID preservando formato original para URLs
   * @param {string} id - ID original
   * @param {string} type - Tipo de ID detectado
   * @returns {string} ID preservado para construcción de URLs
   */
  #extractCleanId(id, type) {
    const config = this.detectionPatterns.get(type);
    if (!config) return id;

    switch (type) {
      case 'imdb':
        return id; // IMDb IDs mantienen el prefijo 'tt'
      case 'imdb_series':
        return id; // Series IMDb mantienen formato completo ttXXXXXXX:season:episode
      case 'kitsu':
        return id; // Preservar formato completo 'kitsu:XXXXX' para URLs
      case 'mal':
        return id; // Preservar formato completo 'mal:XXXXX' para URLs
      case 'anilist':
        return id; // Preservar formato completo 'anilist:XXXXX' para URLs
      case 'anidb':
        return id; // Preservar formato completo 'anidb:XXXXX' para URLs
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
   * Valida formato de ID de IMDb para episodios de series
   * @param {string} id - ID a validar (formato ttXXXXXXX:season:episode)
   * @returns {boolean} True si es válido
   */
  #validateImdbSeriesFormat(id) {
    // Validación de entrada
    if (!id || typeof id !== 'string') return false;
    
    const parts = id.split(':');
    if (parts.length !== 3) return false;
    
    const [imdbPart, seasonPart, episodePart] = parts;
    
    // Validar parte IMDb con early return
    if (!imdbPart || !imdbPart.startsWith('tt')) return false;
    if (!/^\d+$/.test(imdbPart.slice(2))) return false;
    
    // Validar temporada y episodio con early returns
    const season = parseInt(seasonPart);
    if (isNaN(season) || season < 1) return false;
    
    const episode = parseInt(episodePart);
    if (isNaN(episode) || episode < 1) return false;
    
    return true;
  }

  /**
   * Valida formato de ID de Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateKitsuFormat(id) {
    // Validación de entrada
    if (!id || typeof id !== 'string') return false;
    
    const cleanId = id.replace(/^kitsu:/, '');
    if (!/^\d+$/.test(cleanId)) return false;
    
    const numericId = parseInt(cleanId);
    if (isNaN(numericId) || numericId <= 0) return false;
    
    return true;
  }

  /**
   * Valida formato de ID de serie Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateKitsuSeriesFormat(id) {
    // Validación de entrada
    if (!id || typeof id !== 'string') return false;
    
    const parts = id.split(':');
    if (parts.length !== 3) return false;
    if (parts[0] !== 'kitsu') return false;
    
    const animeId = parseInt(parts[1]);
    if (isNaN(animeId) || animeId < 1) return false;
    
    const episode = parseInt(parts[2]);
    if (isNaN(episode) || episode < 1) return false;
    
    return true;
  }

  /**
   * Valida formato numérico genérico para IDs de anime
   * @param {string} id - ID a validar
   * @param {string} prefix - Prefijo esperado (mal, anilist, anidb)
   * @returns {boolean} True si es válido
   */
  #validateNumericFormat(id, prefix) {
    // Validación de entrada
    if (!id || typeof id !== 'string') return false;
    if (!prefix || typeof prefix !== 'string') return false;
    
    const cleanId = id.replace(new RegExp(`^${prefix}:`), '');
    if (!/^\d+$/.test(cleanId)) return false;
    
    const numericId = parseInt(cleanId);
    if (isNaN(numericId) || numericId <= 0) return false;
    
    return true;
  }

  /**
   * Valida formato de series de anime genérico
   * @param {string} id - ID a validar
   * @param {string} prefix - Prefijo esperado (mal, anilist, anidb)
   * @returns {boolean} True si es válido
   */
  #validateAnimeSeriesFormat(id, prefix) {
    // Validación de entrada
    if (!id || typeof id !== 'string') return false;
    if (!prefix || typeof prefix !== 'string') return false;
    
    const parts = id.split(':');
    const prefixName = prefix.replace(':', '');
    
    // Verificar si tiene prefijo
    if (parts.length === 4 && parts[0] === prefixName) {
      // Formato: prefix:id:season:episode
      const animeId = parseInt(parts[1]);
      const season = parseInt(parts[2]);
      const episode = parseInt(parts[3]);
      
      if (isNaN(animeId) || animeId < 1) return false;
      if (isNaN(season) || season < 1) return false;
      if (isNaN(episode) || episode < 1) return false;
    } else if (parts.length === 3) {
      // Formato sin prefijo: id:season:episode
      const animeId = parseInt(parts[0]);
      const season = parseInt(parts[1]);
      const episode = parseInt(parts[2]);
      
      if (isNaN(animeId) || animeId < 1) return false;
      if (isNaN(season) || season < 1) return false;
      if (isNaN(episode) || episode < 1) return false;
    } else {
      return false;
    }
    
    return true;
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


}

// Instancia singleton
export const idDetectorService = new IdDetectorService();