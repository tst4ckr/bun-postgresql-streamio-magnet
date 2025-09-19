/**
 * @fileoverview TvHandler - Manejador para la lógica de canales de TV.
 * Gestiona las solicitudes de catálogo, metadatos y streams para canales de TV.
 */

import { addonConfig } from '../../config/addonConfig.js';

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
   * Crea el handler para el catálogo de TV.
   * Responde a las solicitudes de catálogo, filtrando por género si se especifica.
   * @returns {Function} Handler para el catálogo de Stremio
   */
  createCatalogHandler() {
    return async (args) => {
      this.#logger.info(`Request for TV catalog: id=${args.id}, extra=${JSON.stringify(args.extra)}`);

      try {
        const tvs = await this.#tvRepository.getAllTvs();
        if (!tvs || tvs.length === 0) {
          this.#logger.warn('No TV channels found in repository for catalog.');
          return { metas: [] };
        }

        let metas;
        const genre = args.extra ? args.extra.genre : null;

        if (genre) {
          this.#logger.info(`Filtering TV catalog for genre: "${genre}"`);
          metas = tvs
            .filter(tv => tv.group === genre)
            .map(tv => tv.toStremioMeta());
        } else {
          this.#logger.info('Returning full TV catalog.');
          metas = tvs.map(tv => tv.toStremioMeta());
        }

        if (metas.length === 0 && genre) {
            this.#logger.warn(`No TV channels found for genre: "${genre}"`);
        }

        return {
          metas,
          cacheMaxAge: this.#config.cache.tvCatalogMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV catalog', { error: error.message, stack: error.stack, args });
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
      this.#logger.info(`[DEBUG] TV Meta Request - Args:`, { 
        type: args.type, 
        id: args.id, 
        fullArgs: args 
      });

      try {
        this.#logger.debug(`[DEBUG] Searching for TV channel with ID: ${args.id}`);
        const tv = await this.#tvRepository.getTvById(args.id);
        
        if (!tv) {
          this.#logger.warn(`[DEBUG] TV channel NOT FOUND for meta request: ${args.id}`);
          this.#logger.debug(`[DEBUG] Available channels count:`, await this.#tvRepository.getAllTvs().then(tvs => tvs.length));
          return Promise.reject(new Error(`TV channel not found: ${args.id}`));
        }

        this.#logger.debug(`[DEBUG] TV channel FOUND:`, {
          id: tv.id,
          name: tv.name,
          streamUrl: tv.streamUrl,
          group: tv.group
        });

        const meta = tv.toStremioMeta();
        this.#logger.debug(`[DEBUG] Generated meta:`, {
          id: meta.id,
          type: meta.type,
          name: meta.name,
          defaultVideoId: meta.behaviorHints?.defaultVideoId,
          hasScheduledVideos: meta.behaviorHints?.hasScheduledVideos
        });

        this.#logger.info(`[DEBUG] Successfully found meta for TV channel: ${tv.name}`);

        return {
          meta,
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('[DEBUG] Error fetching TV meta', { 
          error: error.message, 
          stack: error.stack, 
          args,
          errorType: error.constructor.name
        });
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
      this.#logger.info(`[DEBUG] TV Stream Request - Args:`, { 
        type: args.type, 
        id: args.id, 
        fullArgs: args 
      });

      try {
        this.#logger.debug(`[DEBUG] Searching for TV channel with ID: ${args.id}`);
        const tv = await this.#tvRepository.getTvById(args.id);
        
        if (!tv) {
          this.#logger.warn(`[DEBUG] TV channel NOT FOUND for stream request: ${args.id}`);
          this.#logger.debug(`[DEBUG] Available channels count:`, await this.#tvRepository.getAllTvs().then(tvs => tvs.length));
          this.#logger.debug(`[DEBUG] Returning empty streams array`);
          return { streams: [] };
        }

        this.#logger.debug(`[DEBUG] TV channel FOUND for stream:`, {
          id: tv.id,
          name: tv.name,
          streamUrl: tv.streamUrl,
          group: tv.group
        });

        const stream = tv.toStremioStream();
        this.#logger.debug(`[DEBUG] Generated stream:`, {
          name: stream.name,
          title: stream.title,
          url: stream.url,
          notWebReady: stream.behaviorHints?.notWebReady,
          bingeGroup: stream.behaviorHints?.bingeGroup,
          proxyHeaders: stream.behaviorHints?.proxyHeaders
        });

        this.#logger.info(`[DEBUG] Successfully found stream for TV channel: ${tv.name}`);

        const response = {
          streams: [stream],
          cacheMaxAge: this.#config.cache.tvCacheMaxAge
        };

        this.#logger.debug(`[DEBUG] Final stream response:`, {
          streamsCount: response.streams.length,
          cacheMaxAge: response.cacheMaxAge,
          firstStreamUrl: response.streams[0]?.url
        });

        return response;
      } catch (error) {
        this.#logger.error('[DEBUG] Error fetching TV stream', { 
          error: error.message, 
          stack: error.stack, 
          args,
          errorType: error.constructor.name
        });
        this.#logger.debug(`[DEBUG] Returning empty streams due to error`);
        return { streams: [] };
      }
    };
  }
}