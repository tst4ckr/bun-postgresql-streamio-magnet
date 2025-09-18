/**
 * Servicio optimizado para detección de tipos de ID de contenido
 * Implementa detección autónoma con patrones reutilizables
 */

export class IdDetectorService {
  constructor() {
    this.detectionPatterns = this.#initializePatterns();
    this.urlPatterns = this.#initializeUrlPatterns();
  }

  #initializePatterns() {
    const animeServices = ['mal', 'anilist', 'anidb'];
    const patterns = new Map();
    
    // IMDb patterns
    patterns.set('imdb', {
      pattern: /^tt\d+$/,
      prefix: 'tt',
      validator: (id) => this.#validateImdbFormat(id)
    });
    
    patterns.set('imdb_series', {
      pattern: /^tt\d+:\d+:\d+$/,
      prefix: 'tt',
      validator: (id) => this.#validateImdbSeriesFormat(id)
    });
    
    // Kitsu patterns
    patterns.set('kitsu', {
      pattern: /^kitsu:\d+$/,
      prefix: 'kitsu:',
      validator: (id) => this.#validateKitsuFormat(id)
    });
    
    patterns.set('kitsu_series', {
      pattern: /^kitsu:\d+:\d+$/,
      prefix: 'kitsu:',
      validator: (id) => this.#validateKitsuSeriesFormat(id)
    });
    
    // Anime service patterns
    animeServices.forEach(service => {
      patterns.set(service, {
        pattern: new RegExp(`^(?:${service}:)?\\d+$`),
        prefix: `${service}:`,
        validator: (id) => this.#validateNumericFormat(id, service)
      });
      
      patterns.set(`${service}_series`, {
        pattern: new RegExp(`^(?:${service}:)?\\d+:\\d+:\\d+$`),
        prefix: `${service}:`,
        validator: (id) => this.#validateAnimeSeriesFormat(id, service)
      });
    });
    
    return patterns;
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

    const validators = [
      { type: 'imdb', validator: () => this.detectionPatterns.get('imdb')?.validator(normalizedId) },
      { type: 'kitsu', validator: () => this.detectionPatterns.get('kitsu')?.validator(normalizedId) },
      { type: 'mal', validator: () => this.detectionPatterns.get('mal')?.validator(normalizedId) },
      { type: 'anilist', validator: () => this.detectionPatterns.get('anilist')?.validator(normalizedId) },
      { type: 'anidb', validator: () => this.detectionPatterns.get('anidb')?.validator(normalizedId) },
      { type: 'imdb_series', validator: () => this.detectionPatterns.get('imdb_series')?.validator(normalizedId) },
      { type: 'kitsu_series', validator: () => this.detectionPatterns.get('kitsu_series')?.validator(normalizedId) }
    ];

    for (const { type, validator } of validators) {
      if (validator()) {
        const cleanId = this.#extractCleanId(normalizedId, type);
        return this.#createDetectionResult(type, cleanId, true, `Detectado como ${type.toUpperCase()}`);
      }
    }

    return this.#createDetectionResult('unknown', normalizedId, false, 'Formato de ID no reconocido');
  }

  /**
   * Extrae el ID limpio del formato completo
   * @param {string} id - ID completo
   * @param {string} type - Tipo de ID
   * @returns {string} ID limpio
   */
  #extractCleanId(id, type) {
    const prefixMap = {
      'kitsu': 'kitsu:',
      'mal': 'mal:',
      'anilist': 'anilist:',
      'anidb': 'anidb:'
    };

    if (prefixMap[type]) {
      return id.replace(prefixMap[type], '');
    }

    // Mantener el formato completo para series
    return id;
  }

  /**
   * Valida formato de ID de IMDb
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateImdbFormat(id) {
    return id.startsWith('tt') && /^\d{7,}$/.test(id.slice(2));
  }

  /**
   * Valida formato de ID de IMDb para episodios de series
   * @param {string} id - ID a validar (formato ttXXXXXXX:season:episode)
   * @returns {boolean} True si es válido
   */
  #validateImdbSeriesFormat(id) {
    if (!id || typeof id !== 'string') return false;
    
    const [imdbPart, seasonPart, episodePart] = id.split(':');
    if (!imdbPart || !seasonPart || !episodePart) return false;
    
    return this.#validateImdbFormat(imdbPart) && 
           this.#validatePositiveInteger(seasonPart) && 
           this.#validatePositiveInteger(episodePart);
  }

  /**
   * Valida formato de ID de Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateKitsuFormat(id) {
    if (!id || typeof id !== 'string') return false;
    
    const cleanId = id.replace(/^kitsu:/, '');
    return /^\d+$/.test(cleanId) && parseInt(cleanId) > 0;
  }

  /**
   * Valida formato de ID de serie Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es válido
   */
  #validateKitsuSeriesFormat(id) {
    if (!id || typeof id !== 'string') return false;
    
    const [prefix, animeId, episode] = id.split(':');
    return prefix === 'kitsu' && 
           this.#validatePositiveInteger(animeId) && 
           this.#validatePositiveInteger(episode);
  }

  /**
   * Valida que un string sea un entero positivo
   * @param {string} value - Valor a validar
   * @returns {boolean} True si es un entero positivo válido
   */
  #validatePositiveInteger(value) {
    const num = parseInt(value);
    return !isNaN(num) && num > 0;
  }

  /**
   * Valida formato numérico genérico para IDs de anime
   * @param {string} id - ID a validar
   * @param {string} prefix - Prefijo esperado (mal, anilist, anidb)
   * @returns {boolean} True si es válido
   */
  #validateNumericFormat(id, prefix) {
    return this.#validateNumericId(id, prefix);
  }

  /**
   * Valida formato de ID numérico con prefijo
   * @param {string} id - ID a validar
   * @param {string} prefix - Prefijo esperado
   * @returns {boolean} True si es válido
   */
  #validateNumericId(id, prefix) {
    if (!id || typeof id !== 'string') return false;
    
    const cleanId = id.replace(new RegExp(`^${prefix}:`), '');
    return /^\d+$/.test(cleanId) && parseInt(cleanId) > 0;
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
   * Inicializa patrones para extracción desde URLs
   * @returns {Object} Patrones de extracción
   */
  #initializeUrlPatterns() {
    return {
      imdb: /(?:imdb\.com\/title\/)(tt\d+)/,
      kitsu: /(?:kitsu\.io\/anime\/)(\d+)/,
      mal: /(?:myanimelist\.net\/anime\/)(\d+)/,
      anilist: /(?:anilist\.co\/anime\/)(\d+)/,
      anidb: /(?:anidb\.net\/anime\/)(\d+)/
    };
  }

  /**
   * Extrae ID de una URL usando el patrón especificado
   * @param {string} url - URL a procesar
   * @param {RegExp} pattern - Patrón de extracción
   * @returns {string|null} ID extraído o null
   */
  #extractId(url, pattern) {
    const match = url.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Extrae ID de IMDb de una URL
   * @param {string} url - URL a procesar
   * @returns {string|null} ID extraído o null
   */
  #extractImdbId(url) {
    return this.#extractId(url, this.urlPatterns.imdb);
  }

  /**
   * Extrae ID de Kitsu de una URL
   * @param {string} url - URL a procesar
   * @returns {string|null} ID extraído o null
   */
  #extractKitsuId(url) {
    return this.#extractId(url, this.urlPatterns.kitsu);
  }

  /**
   * Extrae ID de MAL de una URL
   * @param {string} url - URL a procesar
   * @returns {string|null} ID extraído o null
   */
  #extractMalId(url) {
    return this.#extractId(url, this.urlPatterns.mal);
  }

  /**
   * Extrae ID de AniList de una URL
   * @param {string} url - URL a procesar
   * @returns {string|null} ID extraído o null
   */
  #extractAnilistId(url) {
    return this.#extractId(url, this.urlPatterns.anilist);
  }

  /**
   * Extrae ID de AniDB de una URL
   * @param {string} url - URL a procesar
   * @returns {string|null} ID extraído o null
   */
  #extractAnidbId(url) {
    return this.#extractId(url, this.urlPatterns.anidb);
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