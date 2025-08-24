/**
 * @fileoverview SubtitleService - Servicio para manejo de subtítulos en Stremio
 * Implementa el formato de subtítulos recomendado por la documentación oficial
 */

/**
 * Servicio para gestión de subtítulos compatible con Stremio
 * Maneja la búsqueda, validación y formato de subtítulos
 */
export class SubtitleService {
  /**
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config = {}, logger = console) {
    this.config = {
      supportedLanguages: ['es', 'en', 'pt', 'fr', 'it'],
      defaultLanguage: 'es',
      subtitleSources: [
        'opensubtitles.org',
        'subdivx.com',
        'tusubtitulo.com'
      ],
      ...config
    };
    this.logger = logger;
  }

  /**
   * Genera objetos de subtítulos para un contenido específico
   * @param {Object} params - Parámetros del contenido
   * @param {string} params.imdbId - ID de IMDB
   * @param {string} params.type - Tipo de contenido (movie/series)
   * @param {number} [params.season] - Temporada (para series)
   * @param {number} [params.episode] - Episodio (para series)
   * @returns {Object[]} Array de objetos Subtitle
   */
  async getSubtitlesForContent(params) {
    const { imdbId, type, season, episode } = params;
    
    try {
      const subtitles = [];
      
      // Generar subtítulos para idiomas soportados
      for (const lang of this.config.supportedLanguages) {
        const subtitle = this.createSubtitleObject({
          imdbId,
          type,
          season,
          episode,
          language: lang
        });
        
        if (subtitle) {
          subtitles.push(subtitle);
        }
      }
      
      return subtitles;
    } catch (error) {
      this.logger.error('Error generando subtítulos:', error);
      return [];
    }
  }

  /**
   * Crea un objeto Subtitle compatible con Stremio
   * @param {Object} params - Parámetros del subtítulo
   * @returns {Object|null} Objeto Subtitle o null si no es válido
   */
  createSubtitleObject(params) {
    const { imdbId, type, season, episode, language } = params;
    
    try {
      // Construir ID único del subtítulo
      let subtitleId = `${imdbId}_${language}`;
      if (type === 'series' && season && episode) {
        subtitleId += `_s${season}e${episode}`;
      }
      
      // URL del subtítulo (placeholder - en implementación real conectaría con APIs)
      const subtitleUrl = this.buildSubtitleUrl({
        imdbId,
        type,
        season,
        episode,
        language
      });
      
      if (!subtitleUrl) {
        return null;
      }
      
      return {
        id: subtitleId,
        url: subtitleUrl,
        lang: language
      };
    } catch (error) {
      this.logger.warn(`Error creando subtítulo para ${language}:`, error.message);
      return null;
    }
  }

  /**
   * Construye la URL del subtítulo
   * @param {Object} params - Parámetros para construir la URL
   * @returns {string|null} URL del subtítulo o null si no está disponible
   */
  buildSubtitleUrl(params) {
    const { imdbId, type, season, episode, language } = params;
    
    // En una implementación real, aquí se conectaría con APIs de subtítulos
    // Por ahora, generamos URLs de ejemplo basadas en el patrón común
    
    const baseUrl = process.env.SUBTITLE_SERVICE_URL || 'https://api.subtitles.example.com';
    
    let path = `/subtitles/${imdbId}/${language}`;
    
    if (type === 'series' && season && episode) {
      path += `/s${season}e${episode}`;
    }
    
    return `${baseUrl}${path}.srt`;
  }

  /**
   * Valida si un subtítulo está disponible
   * @param {string} url - URL del subtítulo
   * @returns {Promise<boolean>} True si está disponible
   */
  async validateSubtitleAvailability(url) {
    try {
      // En implementación real, haría una petición HEAD para verificar
      // Por ahora, asumimos que están disponibles
      return true;
    } catch (error) {
      this.logger.warn(`Subtítulo no disponible: ${url}`);
      return false;
    }
  }

  /**
   * Obtiene el nombre legible del idioma
   * @param {string} langCode - Código del idioma
   * @returns {string} Nombre del idioma
   */
  getLanguageName(langCode) {
    const languageNames = {
      'es': 'Español',
      'en': 'English',
      'pt': 'Português',
      'fr': 'Français',
      'it': 'Italiano'
    };
    
    return languageNames[langCode] || langCode.toUpperCase();
  }

  /**
   * Filtra subtítulos por idioma preferido
   * @param {Object[]} subtitles - Array de subtítulos
   * @param {string[]} preferredLanguages - Idiomas preferidos en orden
   * @returns {Object[]} Subtítulos filtrados y ordenados
   */
  filterByPreferredLanguages(subtitles, preferredLanguages = ['es']) {
    const filtered = [];
    
    // Primero agregar subtítulos en idiomas preferidos
    for (const lang of preferredLanguages) {
      const langSubtitles = subtitles.filter(sub => sub.lang === lang);
      filtered.push(...langSubtitles);
    }
    
    // Luego agregar el resto
    const remaining = subtitles.filter(sub => 
      !preferredLanguages.includes(sub.lang)
    );
    filtered.push(...remaining);
    
    return filtered;
  }

  /**
   * Genera estadísticas de subtítulos
   * @param {Object[]} subtitles - Array de subtítulos
   * @returns {Object} Estadísticas
   */
  getSubtitleStats(subtitles) {
    const stats = {
      total: subtitles.length,
      byLanguage: {},
      availableLanguages: []
    };
    
    for (const subtitle of subtitles) {
      const lang = subtitle.lang;
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
      
      if (!stats.availableLanguages.includes(lang)) {
        stats.availableLanguages.push(lang);
      }
    }
    
    return stats;
  }
}

/**
 * Factory para crear instancias del SubtitleService
 */
export class SubtitleServiceFactory {
  /**
   * Crea una instancia del SubtitleService
   * @param {Object} config - Configuración personalizada
   * @param {Object} logger - Logger personalizado
   * @returns {SubtitleService}
   */
  static create(config = {}, logger = console) {
    return new SubtitleService(config, logger);
  }

  /**
   * Crea una instancia con configuración por defecto para español
   * @param {Object} logger - Logger personalizado
   * @returns {SubtitleService}
   */
  static createForSpanish(logger = console) {
    const config = {
      supportedLanguages: ['es', 'en'],
      defaultLanguage: 'es',
      subtitleSources: [
        'subdivx.com',
        'tusubtitulo.com',
        'opensubtitles.org'
      ]
    };
    
    return new SubtitleService(config, logger);
  }
}