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
      this.#logger.info(`TV catalog request: id=${args.id}`);

      try {
        const tvs = await this.#tvRepository.getAllTvs();
        if (!tvs || tvs.length === 0) {
          this.#logger.warn('No TV channels found for catalog');
          return { metas: [] };
        }

        const genre = args.extra?.genre;
        const filteredTvs = genre ? tvs.filter(tv => tv.group === genre) : tvs;
        
        if (genre && filteredTvs.length === 0) {
          this.#logger.warn(`No TV channels found for genre: "${genre}"`);
        }

        return {
          metas: filteredTvs.map(tv => tv.toStremioMeta()),
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
          this.#logger.warn(`TV channel not found: ${args.id}`);
          return { 
            meta: {},
            cacheMaxAge: this.#config.cache.metadataCacheMaxAge,
            // Headers de cache para respuestas vacías
            staleRevalidate: this.#config.cache.metadataCacheMaxAge * 2,
            staleError: this.#config.cache.metadataCacheMaxAge * 4,
            // Metadatos de debugging en desarrollo
            ...(process.env.NODE_ENV === 'development' && {
              _metadata: {
                channelFound: false,
                channelId,
                timestamp: new Date().toISOString()
              }
            })
          };
        }

        return {
          meta: tv.toStremioMeta(),
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge,
          // Headers de cache optimizados para metadatos de TV
          staleRevalidate: this.#config.cache.metadataCacheMaxAge * 3, // TV metadata es más estable
          staleError: this.#config.cache.metadataCacheMaxAge * 6,
          // Metadatos de debugging en desarrollo
          ...(process.env.NODE_ENV === 'development' && {
            _metadata: {
              channelFound: true,
              channelId,
              channelName: tv.name,
              timestamp: new Date().toISOString()
            }
          })
        };
      } catch (error) {
        this.#logger.error('Error fetching TV meta', { error: error.message, args });
        return { 
          meta: {},
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge,
          // Headers de cache para respuestas de error
          staleRevalidate: this.#config.cache.metadataCacheMaxAge,
          staleError: this.#config.cache.metadataCacheMaxAge * 2,
          // Metadatos de debugging en desarrollo
          ...(process.env.NODE_ENV === 'development' && {
            _metadata: {
              error: true,
              errorMessage: error.message,
              timestamp: new Date().toISOString()
            }
          })
        };
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
          this.#logger.warn(`TV channel not found: ${args.id}`);
          return { 
            streams: [],
            cacheMaxAge: this.#config.cache.streamCacheMaxAge 
          };
        }

        // Cabeceras adicionales para mejorar compatibilidad con ciertos proveedores
        const proxyHeaders = { request: {} };
        // Cabeceras opcionales vía entorno
        if (process.env.TV_STREAM_USER_AGENT && typeof process.env.TV_STREAM_USER_AGENT === 'string') {
          proxyHeaders.request['User-Agent'] = process.env.TV_STREAM_USER_AGENT;
        }
        if (process.env.TV_STREAM_REFERER && typeof process.env.TV_STREAM_REFERER === 'string') {
          proxyHeaders.request['Referer'] = process.env.TV_STREAM_REFERER;
        }
        if (process.env.TV_STREAM_ORIGIN && typeof process.env.TV_STREAM_ORIGIN === 'string') {
          proxyHeaders.request['Origin'] = process.env.TV_STREAM_ORIGIN;
        }

        // Fallback dinámico: si no se especificó Referer/Origin, derivar del origen de la URL M3U
        if (!proxyHeaders.request['Referer'] || !proxyHeaders.request['Origin']) {
          try {
            const repoConfig = this.#tvRepository?.getConfig?.();
            const m3uUrl = repoConfig?.m3uUrl;
            if (m3uUrl) {
              const origin = new URL(m3uUrl).origin;
              if (!proxyHeaders.request['Referer']) proxyHeaders.request['Referer'] = origin;
              if (!proxyHeaders.request['Origin']) proxyHeaders.request['Origin'] = origin;
            }
          } catch {}
        }

        // Log de configuración aplicada (solo si hay cabeceras custom)
        if (Object.keys(proxyHeaders.request).length > 0) {
          this.#logger.debug(`[TV] Aplicando proxyHeaders al stream:`, proxyHeaders.request);
        }

        return {
          streams: [tv.toStremioStream({ proxyHeaders })],
          cacheMaxAge: this.#config.cache.streamCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV stream', { error: error.message, args });
        return { 
          streams: [],
          cacheMaxAge: this.#config.cache.streamCacheMaxAge 
        };
      }
    };
  }
}