/**
 * @fileoverview TvHandler - Manejador para la lógica de canales de TV.
 * Gestiona las solicitudes de catálogo, metadatos y streams para canales de TV.
 */

import { ErrorHandler, safeExecute, createError, ERROR_TYPES } from '../../infrastructure/errors/ErrorHandler.js';
import { CONSTANTS } from '../../config/constants.js';

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
   * @returns {Promise<Tv>} Instancia de Tv
   * @throws {Error} Si el canal no se encuentra
   */
  async #getTvById(channelId) {
    const tv = await this.#tvRepository.getTvById(channelId);
    if (!tv) {
      throw createError(`No se encontró el canal de TV con ID: ${channelId}`, ERROR_TYPES.NOT_FOUND);
    }
    return tv;
  }

  /**
   * Crea el handler para el catálogo de TV.
   * Responde a las solicitudes de catálogo, filtrando por género si se especifica.
   * @returns {Function} Handler para el catálogo de Stremio
   */
  createCatalogHandler() {
    return (args) => safeExecute(
      () => this.#handleCatalogRequest(args),
      {
        operation: 'createCatalogHandler',
        handler: 'TvHandler',
        fallbackResponse: { metas: [] }
      }
    );
  }

  /**
   * Lógica de negocio para el catálogo de TV
   * @private
   */
  async #handleCatalogRequest(args) {
    this.#logger.info(`TV catalog request: id=${args.id}`, { extra: args.extra });
    const { type, id, extra = {} } = args;

    // Aceptar tanto 'tv' como 'channel' para compatibilidad con distintos clientes
    if (type !== 'tv' && type !== 'channel') {
      return { metas: [] };
    }

    const tvs = await this.#tvRepository.getAllTvs();
    if (!tvs || tvs.length === 0) {
      this.#logger.warn('No hay canales de TV disponibles');
      return { metas: [] };
    }

    let filteredTvs = this.#filterTvsByCatalog(tvs, id, extra);

    if (extra.search) {
      filteredTvs = this.#searchTvs(filteredTvs, extra.search);
    }

    // Orden: por defecto respetar el orden del CSV (no ordenar)
    // Permitir ordenar por nombre si el cliente lo solicita explícitamente
    const sortBy = (extra.sort || 'csv').toLowerCase();
    if (sortBy === 'name') {
      filteredTvs.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'reverse') {
      filteredTvs = filteredTvs.slice().reverse();
    } // 'csv' mantiene el orden natural del repositorio

    // Paginación robusta según extras declarados en manifest
    const rawSkip = Number.isFinite(parseInt(extra.skip)) ? parseInt(extra.skip) : 0;
    const maxPage = CONSTANTS.LIMIT.MAX_PAGE_SIZE;
    const defaultPage = CONSTANTS.LIMIT.DEFAULT_TV_CATALOG_SIZE;
    const rawLimit = Number.isFinite(parseInt(extra.limit)) ? parseInt(extra.limit) : defaultPage;
    const pageSize = Math.min(Math.max(rawLimit, CONSTANTS.LIMIT.MIN_PAGE_SIZE), maxPage);
    const skip = Math.max(0, rawSkip);
    const { items: pagedTvs, hasMore } = this.#paginateTvs(filteredTvs, skip, pageSize);

    const metas = pagedTvs.map(tv => {
      const meta = tv.toStremioMeta('tv');
      // Forzar siempre el tipo 'tv' para que el cliente solicite streams correctamente
      meta.type = 'tv';
      return meta;
    });
    this.#logger.info(`Catálogo '${id}': ${metas.length} de ${filteredTvs.length}`);

    return {
      metas,
      ...(hasMore && { hasMore: true }),
      cacheMaxAge: this.#config.cache.tvCatalogMaxAge
    };
  }

  /**
   * Crea el handler para los metadatos de un canal de TV.
   * @returns {Function} Handler para metadatos de Stremio
   */
  createMetaHandler() {
    return (args) => safeExecute(
      async () => {
        const channelId = this.#extractChannelId(args.id);
        const tv = await this.#getTvById(channelId);
        const meta = tv.toStremioMeta(args.type);

        // Algunos clientes de Stremio esperan type='channel' para TV en vivo
        if (args.type === 'tv' || args.type === 'channel') {
          meta.type = 'channel';
        }

        // Para TV/Channel usar un TTL más corto para evitar meta obsoleto
        return {
          meta,
          cacheMaxAge: this.#config.cache.tvCatalogMaxAge
        };
      },
      {
        operation: 'createMetaHandler',
        handler: 'TvHandler',
        fallbackResponse: { meta: {} }
      }
    );
  }

  /**
   * Crea el handler para el stream de un canal de TV.
   * @returns {Function} Handler para streams de Stremio
   */
  createStreamHandler() {
    return (args) => safeExecute(
      async () => {
        const channelId = this.#extractChannelId(args.id);
        const tv = await this.#getTvById(channelId);
        return {
          streams: [tv.toStremioStream()],
          // Use TV-specific cache for live streams to avoid over-caching
          cacheMaxAge: this.#config.cache.tvCacheMaxAge
        };
      },
      {
        operation: 'createStreamHandler',
        handler: 'TvHandler',
        fallbackResponse: { streams: [] }
      }
    );
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
        // Permitir filtrado por género directamente en el catálogo principal
        if (extra.genre) {
          const genreTerm = (extra.genre || '').toString().toLowerCase();
          return tvs.filter(tv => {
            const genres = Array.isArray(tv.genres) ? tv.genres : [tv.group].filter(Boolean);
            return genres.some(g => g.toLowerCase() === genreTerm);
          });
        }
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
          // Intentar primero con el array de géneros normalizado
          const byGenres = tvs.filter(tv => {
            const genres = Array.isArray(tv.genres) ? tv.genres : [tv.group].filter(Boolean);
            return genres.some(g => g.toLowerCase() === genreTerm);
          });
          if (byGenres.length > 0) return byGenres;
          // Fallback utilizando el campo group original
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