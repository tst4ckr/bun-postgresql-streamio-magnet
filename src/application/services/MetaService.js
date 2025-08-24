/**
 * @fileoverview MetaService - Servicio para generar objetos Meta optimizados para Stremio
 * Implementa las mejores prácticas según la documentación oficial de Stremio
 */

import { SubtitleService } from './SubtitleService.js';

/**
 * Servicio para generación de objetos Meta compatibles con Stremio
 * Maneja la creación de metadatos enriquecidos para contenido
 */
export class MetaService {
  /**
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config = {}, logger = console) {
    this.config = {
      defaultPosterSize: '300x450',
      defaultBackgroundSize: '1920x1080',
      includeTrailers: true,
      includeSubtitles: true,
      ...config
    };
    this.logger = logger;
    this.subtitleService = new SubtitleService(config.subtitle, logger);
  }

  /**
   * Genera un objeto Meta completo para Stremio
   * @param {Object} params - Parámetros del contenido
   * @param {string} params.imdbId - ID de IMDB
   * @param {string} params.type - Tipo de contenido (movie/series)
   * @param {string} params.title - Título del contenido
   * @param {Object} [params.details] - Detalles adicionales
   * @returns {Promise<Object>} Objeto Meta optimizado
   */
  async generateMetaObject(params) {
    const { imdbId, type, title, details = {} } = params;
    
    try {
      const meta = {
        id: imdbId,
        type,
        name: title,
        
        // Propiedades básicas
        poster: this.generatePosterUrl(imdbId, details.poster),
        background: this.generateBackgroundUrl(imdbId, details.background),
        
        // Información descriptiva
        description: details.description || this.generateDefaultDescription(title, type),
        releaseInfo: details.releaseInfo || details.year?.toString(),
        
        // Géneros
        genres: this.normalizeGenres(details.genres || []),
        
        // Calificaciones
        imdbRating: details.imdbRating ? parseFloat(details.imdbRating) : undefined,
        
        // Información adicional
        runtime: details.runtime,
        country: details.country,
        language: details.language || 'es',
        
        // Cast y crew
        cast: this.normalizeCast(details.cast || []),
        director: this.normalizeDirector(details.director),
        writer: this.normalizeWriter(details.writer),
        
        // Enlaces externos
        website: details.website,
        
        // Metadatos específicos por tipo
        ...await this.getTypeSpecificMeta(type, imdbId, details)
      };
      
      // Agregar subtítulos si están habilitados
      if (this.config.includeSubtitles) {
        meta.subtitles = await this.subtitleService.getSubtitlesForContent({
          imdbId,
          type,
          season: details.season,
          episode: details.episode
        });
      }
      
      // Agregar trailers si están habilitados
      if (this.config.includeTrailers && details.trailers) {
        meta.trailers = this.normalizeTrailers(details.trailers);
      }
      
      // Limpiar propiedades undefined
      return this.cleanMetaObject(meta);
    } catch (error) {
      this.logger.error('Error generando objeto Meta:', error);
      return this.generateMinimalMeta(imdbId, type, title);
    }
  }

  /**
   * Genera metadatos específicos por tipo de contenido
   * @param {string} type - Tipo de contenido
   * @param {string} imdbId - ID de IMDB
   * @param {Object} details - Detalles del contenido
   * @returns {Promise<Object>} Metadatos específicos
   */
  async getTypeSpecificMeta(type, imdbId, details) {
    const meta = {};
    
    if (type === 'series') {
      // Metadatos específicos para series
      meta.seriesInfo = {
        totalSeasons: details.totalSeasons,
        totalEpisodes: details.totalEpisodes,
        status: details.status || 'unknown', // 'ended', 'continuing', 'unknown'
        firstAired: details.firstAired,
        lastAired: details.lastAired
      };
      
      // Videos (episodios) si están disponibles
      if (details.episodes) {
        meta.videos = this.generateEpisodeVideos(imdbId, details.episodes);
      }
    } else if (type === 'movie') {
      // Metadatos específicos para películas
      meta.movieInfo = {
        budget: details.budget,
        revenue: details.revenue,
        awards: details.awards
      };
    }
    
    return meta;
  }

  /**
   * Genera objetos Video para episodios de series
   * @param {string} seriesImdbId - ID de IMDB de la serie
   * @param {Object[]} episodes - Array de episodios
   * @returns {Object[]} Array de objetos Video
   */
  generateEpisodeVideos(seriesImdbId, episodes) {
    return episodes.map(episode => ({
      id: `${seriesImdbId}:${episode.season}:${episode.episode}`,
      title: episode.title || `Episode ${episode.episode}`,
      released: episode.released,
      season: episode.season,
      episode: episode.episode,
      overview: episode.overview,
      thumbnail: episode.thumbnail || this.generateEpisodeThumbnail(seriesImdbId, episode.season, episode.episode),
      streams: [] // Se llenarán por el StreamHandler
    }));
  }

  /**
   * Genera URL de poster optimizada
   * @param {string} imdbId - ID de IMDB
   * @param {string} [customPoster] - URL de poster personalizada
   * @returns {string} URL del poster
   */
  generatePosterUrl(imdbId, customPoster) {
    if (customPoster) {
      return customPoster;
    }
    
    // URLs de ejemplo - en implementación real usaría APIs como TMDB
    const baseUrl = process.env.POSTER_SERVICE_URL || 'https://image.tmdb.org/t/p/w500';
    return `${baseUrl}/${imdbId}_poster.jpg`;
  }

  /**
   * Genera URL de background optimizada
   * @param {string} imdbId - ID de IMDB
   * @param {string} [customBackground] - URL de background personalizada
   * @returns {string} URL del background
   */
  generateBackgroundUrl(imdbId, customBackground) {
    if (customBackground) {
      return customBackground;
    }
    
    const baseUrl = process.env.BACKDROP_SERVICE_URL || 'https://image.tmdb.org/t/p/w1920_and_h1080_bestv2';
    return `${baseUrl}/${imdbId}_backdrop.jpg`;
  }

  /**
   * Genera thumbnail para episodio
   * @param {string} seriesImdbId - ID de IMDB de la serie
   * @param {number} season - Número de temporada
   * @param {number} episode - Número de episodio
   * @returns {string} URL del thumbnail
   */
  generateEpisodeThumbnail(seriesImdbId, season, episode) {
    const baseUrl = process.env.EPISODE_THUMBNAIL_URL || 'https://image.tmdb.org/t/p/w300';
    return `${baseUrl}/${seriesImdbId}_s${season}e${episode}.jpg`;
  }

  /**
   * Normaliza géneros
   * @param {string[]|string} genres - Géneros
   * @returns {string[]} Géneros normalizados
   */
  normalizeGenres(genres) {
    if (!genres) return [];
    
    const genreArray = Array.isArray(genres) ? genres : [genres];
    
    return genreArray
      .map(genre => genre.trim())
      .filter(genre => genre.length > 0)
      .slice(0, 5); // Limitar a 5 géneros máximo
  }

  /**
   * Normaliza información del cast
   * @param {string[]|string} cast - Cast
   * @returns {string[]} Cast normalizado
   */
  normalizeCast(cast) {
    if (!cast) return [];
    
    const castArray = Array.isArray(cast) ? cast : [cast];
    
    return castArray
      .map(actor => actor.trim())
      .filter(actor => actor.length > 0)
      .slice(0, 10); // Limitar a 10 actores máximo
  }

  /**
   * Normaliza información del director
   * @param {string[]|string} director - Director(es)
   * @returns {string[]} Directores normalizados
   */
  normalizeDirector(director) {
    if (!director) return [];
    
    const directorArray = Array.isArray(director) ? director : [director];
    
    return directorArray
      .map(dir => dir.trim())
      .filter(dir => dir.length > 0);
  }

  /**
   * Normaliza información del escritor
   * @param {string[]|string} writer - Escritor(es)
   * @returns {string[]} Escritores normalizados
   */
  normalizeWriter(writer) {
    if (!writer) return [];
    
    const writerArray = Array.isArray(writer) ? writer : [writer];
    
    return writerArray
      .map(wr => wr.trim())
      .filter(wr => wr.length > 0);
  }

  /**
   * Normaliza trailers
   * @param {Object[]|string[]} trailers - Trailers
   * @returns {Object[]} Trailers normalizados
   */
  normalizeTrailers(trailers) {
    if (!trailers || !Array.isArray(trailers)) return [];
    
    return trailers
      .map(trailer => {
        if (typeof trailer === 'string') {
          return {
            source: trailer,
            type: 'Trailer'
          };
        }
        return trailer;
      })
      .filter(trailer => trailer.source)
      .slice(0, 3); // Máximo 3 trailers
  }

  /**
   * Genera descripción por defecto
   * @param {string} title - Título
   * @param {string} type - Tipo de contenido
   * @returns {string} Descripción generada
   */
  generateDefaultDescription(title, type) {
    const typeText = type === 'movie' ? 'película' : 'serie';
    return `Disfruta de ${title}, una ${typeText} disponible a través de torrents.`;
  }

  /**
   * Genera objeto Meta mínimo en caso de error
   * @param {string} imdbId - ID de IMDB
   * @param {string} type - Tipo de contenido
   * @param {string} title - Título
   * @returns {Object} Meta mínimo
   */
  generateMinimalMeta(imdbId, type, title) {
    return {
      id: imdbId,
      type,
      name: title,
      description: this.generateDefaultDescription(title, type)
    };
  }

  /**
   * Limpia el objeto Meta removiendo propiedades undefined
   * @param {Object} meta - Objeto Meta
   * @returns {Object} Meta limpio
   */
  cleanMetaObject(meta) {
    const cleaned = {};
    
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value) && value.length === 0) {
          continue; // Omitir arrays vacíos
        }
        if (typeof value === 'object' && !Array.isArray(value)) {
          const cleanedObject = this.cleanMetaObject(value);
          if (Object.keys(cleanedObject).length > 0) {
            cleaned[key] = cleanedObject;
          }
        } else {
          cleaned[key] = value;
        }
      }
    }
    
    return cleaned;
  }
}

/**
 * Factory para crear instancias del MetaService
 */
export class MetaServiceFactory {
  /**
   * Crea una instancia del MetaService
   * @param {Object} config - Configuración personalizada
   * @param {Object} logger - Logger personalizado
   * @returns {MetaService}
   */
  static create(config = {}, logger = console) {
    return new MetaService(config, logger);
  }

  /**
   * Crea una instancia optimizada para contenido español
   * @param {Object} logger - Logger personalizado
   * @returns {MetaService}
   */
  static createForSpanish(logger = console) {
    const config = {
      defaultPosterSize: '300x450',
      defaultBackgroundSize: '1920x1080',
      includeTrailers: true,
      includeSubtitles: true,
      subtitle: {
        supportedLanguages: ['es', 'en'],
        defaultLanguage: 'es'
      }
    };
    
    return new MetaService(config, logger);
  }
}