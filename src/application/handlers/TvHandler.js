/**
 * @fileoverview TvHandler - Manejador para la lógica de canales de TV.
 * Gestiona las solicitudes de catálogo, metadatos y streams para canales de TV.
 */

/**
 * Manejador para la lógica de canales de TV en Stremio.
 */
export class TvHandler {
  #tvRepository;
  #config;
  #logger;

  /**
   * @param {M3UTvRepository} tvRepository - Repositorio de canales de TV
   * @param {object} config - Objeto de configuración
   * @param {EnhancedLogger} logger - Instancia del logger
   */
  constructor(tvRepository, config, logger) {
    this.#tvRepository = tvRepository;
    this.#config = config;
    this.#logger = logger;
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
        const tvs = await this.#tvRepository.getAllTvs();
        if (!tvs || tvs.length === 0) {
          this.#logger.warn('No TV channels found for catalog');
          return { metas: [] };
        }
        const extra = args.extra || {};

        // Filtro por género (grupo M3U)
        const genre = extra.genre?.trim();
        let filteredTvs = genre ? tvs.filter(tv => tv.group === genre) : tvs;
        
        // Filtro por búsqueda (por nombre del canal)
        const search = extra.search?.trim();
        if (search) {
          const q = search.toLowerCase();
          filteredTvs = filteredTvs.filter(tv => tv.name.toLowerCase().includes(q));
        }

        // Orden opcional
        const sortBy = extra.sort || 'name';
        if (sortBy === 'name') {
          filteredTvs = filteredTvs.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Paginación (skip/limit) compatible con Stremio
        const skip = Number(extra.skip ?? 0);
        const limit = Number(extra.limit ?? 50);
        const pagedTvs = filteredTvs.slice(skip, skip + limit);
        
        if (genre && filteredTvs.length === 0) {
          this.#logger.warn(`No TV channels found for genre: "${genre}"`);
        }

        return {
          metas: pagedTvs.map(tv => tv.toStremioMeta()),
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
          meta: tv.toStremioMeta(),
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
}