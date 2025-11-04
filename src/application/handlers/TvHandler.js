/**
 * @fileoverview TvHandler - Manejador para la lógica de canales de TV.
 * Gestiona las solicitudes de catálogo, metadatos y streams para canales de TV.
 */

import { ErrorHandler } from '../../infrastructure/errors/ErrorHandler.js';

/**
 * Manejador para la lógica de canales de TV en Stremio.
 */
export class TvHandler {
  #tvRepository;
  #config;
  #logger;
  #errorHandler;

  /**
   * @param {M3UTvRepository} tvRepository - Repositorio de canales de TV
   * @param {object} config - Objeto de configuración
   * @param {EnhancedLogger} logger - Instancia del logger
   */
  constructor(tvRepository, config, logger) {
    this.#tvRepository = tvRepository;
    this.#config = config;
    this.#logger = logger;
    this.#errorHandler = new ErrorHandler(logger, config?.cascadeSearch || {});
  }

  /**
   * Extrae el ID del canal desde los argumentos de Stremio
   * @private
   * @param {string} stremioId - ID completo de Stremio (formato: "id:opciones")
   * @returns {string} ID del canal
   */
  #extractChannelId(stremioId) {
    return stremioId.split(':')[0];
  }

  /**
   * Obtiene un canal de TV por ID con manejo de errores unificado
   * @private
   * @param {string} channelId - ID del canal
   * @returns {Promise<Tv|null>} Instancia de Tv o null si no existe
   */
  async #getTvById(channelId) {
    try {
      return await this.#tvRepository.getTvById(channelId);
    } catch (error) {
      this.#logger.warn(`Error fetching TV channel ${channelId}:`, { error: error.message });
      return null;
    }
  }

  /**
   * Crea el handler para el catálogo de TV.
   * Responde a las solicitudes de catálogo, filtrando por género si se especifica.
   * @returns {Function} Handler para el catálogo de Stremio
   */
  createCatalogHandler() {
    return async (args) => {
      this.#logger.info(`TV catalog request: id=${args.id}`, { extra: args.extra });

      try {
        const { type, id, extra = {} } = args;

        // Validar tipo de contenido
        if (type !== 'tv') {
          return { metas: [] };
        }

        // Obtener todos los canales desde repositorio M3U
        const tvs = await this.#tvRepository.getAllTvs();
        if (!tvs || tvs.length === 0) {
          this.#logger.warn('No hay canales de TV disponibles');
          return { metas: [] };
        }

        // Filtrar según el catálogo solicitado (similar a CatalogHandler)
        let filteredTvs = this.#filterTvsByCatalog(tvs, id, extra);

        // Aplicar búsqueda si se proporciona (por nombre o grupo)
        if (extra.search) {
          filteredTvs = this.#searchTvs(filteredTvs, extra.search);
        }

        // Orden opcional
        const sortBy = extra.sort || 'name';
        if (sortBy === 'name') {
          filteredTvs = filteredTvs.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Paginación estilo Stremio (pageSize 100 y flag hasMore)
        const skip = parseInt(extra.skip) || 0;
        const pageSize = 100;
        const { items: pagedTvs, hasMore } = this.#paginateTvs(filteredTvs, skip, pageSize);

        const metas = pagedTvs.map(tv => tv.toStremioMeta(args.type));

        this.#logger.info(`Catálogo '${id}': ${metas.length} de ${filteredTvs.length}`);

        return {
          metas,
          ...(hasMore && { hasMore: true }),
          cacheMaxAge: this.#config.cache.tvCatalogMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV catalog', { error: error.message });
        return { metas: [] };
      }
    };
  }

  /**
   * Crea el handler para los metadatos de un canal de TV.
   * @returns {Function} Handler para metadatos de Stremio
   */
  createMetaHandler() {
    return async (args) => {
      try {
        const channelId = this.#extractChannelId(args.id);
        const tv = await this.#getTvById(channelId);
        
        if (!tv) {
          return Promise.reject(new Error(`TV channel not found: ${args.id}`));
        }

        return {
          meta: tv.toStremioMeta(args.type),
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV meta', { error: error.message });
        return Promise.reject(error);
      }
    };
  }

  /**
   * Crea el handler para el stream de un canal de TV.
   * @returns {Function} Handler para streams de Stremio
   */
  createStreamHandler() {
    return async (args) => {
      try {
        const channelId = this.#extractChannelId(args.id);
        const tv = await this.#getTvById(channelId);
        
        if (!tv) {
          return Promise.reject(new Error(`TV channel not found: ${args.id}`));
        }

        return {
          streams: [tv.toStremioStream()],
          cacheMaxAge: this.#config.cache.streamCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV stream', { error: error.message });
        return Promise.reject(error);
      }
    };
  }

  /**
   * Filtra canales de TV según el catálogo solicitado
   * @private
   * @param {Array} tvs - Lista de canales TV
   * @param {string} catalogId - ID del catálogo
   * @param {Object} extra - Parámetros adicionales
   * @returns {Array} Canales filtrados
   */
  #filterTvsByCatalog(tvs, catalogId, extra = {}) {
    const byGroup = (groupTerm) => tvs.filter(tv => (tv.group || '').toLowerCase().includes(groupTerm));
    const byNameIncludes = (term) => tvs.filter(tv => tv.name.toLowerCase().includes(term));

    switch (catalogId) {
      case 'tv_all':
      case 'tv_catalog':
        return tvs;

      case 'tv_peru':
        // Muchos M3U usan grupos por país
        return byGroup('peru');

      case 'tv_hd':
        // No hay campo de calidad, usar heurística por nombre/grupo
        return tvs.filter(tv =>
          tv.name.toLowerCase().includes('hd') || (tv.group || '').toLowerCase().includes('hd')
        );

      case 'tv_news': {
        const keywords = ['news', 'noticias', 'informativo', 'cnn', 'bbc', 'rpp'];
        return tvs.filter(tv => {
          const name = tv.name.toLowerCase();
          const group = (tv.group || '').toLowerCase();
          return keywords.some(k => name.includes(k) || group.includes(k));
        });
      }

      case 'tv_sports': {
        const keywords = ['sport', 'deportes', 'espn', 'fox sports', 'gol', 'futbol', 'football'];
        return tvs.filter(tv => {
          const name = tv.name.toLowerCase();
          const group = (tv.group || '').toLowerCase();
          return keywords.some(k => name.includes(k) || group.includes(k));
        });
      }

      case 'tv_entertainment': {
        const entertainmentKeywords = ['entretenimiento', 'entertainment', 'variety', 'comedy', 'drama'];
        const isNews = (tv) => {
          const newsKeywords = ['news', 'noticias', 'informativo', 'cnn', 'bbc', 'rpp'];
          const name = tv.name.toLowerCase();
          const group = (tv.group || '').toLowerCase();
          return newsKeywords.some(k => name.includes(k) || group.includes(k));
        };
        const isSports = (tv) => {
          const sportsKeywords = ['sport', 'deportes', 'espn', 'fox sports', 'gol', 'futbol', 'football'];
          const name = tv.name.toLowerCase();
          const group = (tv.group || '').toLowerCase();
          return sportsKeywords.some(k => name.includes(k) || group.includes(k));
        };
        return tvs.filter(tv => {
          const name = tv.name.toLowerCase();
          const group = (tv.group || '').toLowerCase();
          const matchesEntertainment = entertainmentKeywords.some(k => name.includes(k) || group.includes(k));
          return matchesEntertainment && !isNews(tv) && !isSports(tv);
        });
      }

      case 'tv_by_genre':
        if (extra.genre) {
          const genreTerm = extra.genre.toLowerCase();
          return byGroup(genreTerm);
        }
        return tvs;

      default:
        // Si llega un catálogo desconocido, devolver todo y permitir búsqueda/orden/paginación
        return tvs;
    }
  }

  /**
   * Busca canales por nombre o grupo
   * @private
   * @param {Array} tvs - Lista de canales
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Array} Canales que coinciden con la búsqueda
   */
  #searchTvs(tvs, searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return tvs;
    return tvs.filter(tv =>
      tv.name.toLowerCase().includes(term) || (tv.group || '').toLowerCase().includes(term)
    );
  }

  /**
   * Aplica paginación a los canales
   * @private
   * @param {Array} tvs - Lista de canales
   * @param {number} skip - Número de elementos a omitir
   * @param {number} pageSize - Tamaño de página
   * @returns {Object} Objeto con items paginados y flag hasMore
   */
  #paginateTvs(tvs, skip = 0, pageSize = 100) {
    const startIndex = Math.max(0, skip);
    const endIndex = startIndex + pageSize;
    const items = tvs.slice(startIndex, endIndex);
    const hasMore = endIndex < tvs.length;
    return { items, hasMore };
  }
}