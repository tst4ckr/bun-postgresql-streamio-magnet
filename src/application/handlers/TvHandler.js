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
   * @returns {Function} Handler para el catálogo de Stremio
   */
  createCatalogHandler() {
    return async (args) => {
      this.#logger.info(`Catalog request for TV: ${args.id}`);
      
      try {
        const tvs = await this.#tvRepository.getAllTvs();
        const metas = tvs.map(tv => tv.toStremioMeta());
        
        return { 
          metas,
          cacheMaxAge: this.#config.cache.tvCatalogMaxAge 
        };
      } catch (error) {
        this.#logger.error('Error fetching TV catalog', { error: error.message, args });
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
      this.#logger.info(`Meta request for TV: ${args.id}`);
      
      try {
        const tv = await this.#tvRepository.getTvById(args.id);
        if (!tv) {
          this.#logger.warn(`TV channel not found: ${args.id}`);
          return { meta: {} };
        }
        
        const meta = tv.toStremioMeta();
        
        return { 
          meta,
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV meta', { error: error.message, args });
        return { meta: {} };
      }
    };
  }

  /**
   * Crea el handler para el stream de un canal de TV.
   * @returns {Function} Handler para streams de Stremio
   */
  createStreamHandler() {
    return async (args) => {
      this.#logger.info(`Stream request for TV: ${args.id}`);
      
      try {
        const tv = await this.#tvRepository.getTvById(args.id);
        if (!tv) {
          this.#logger.warn(`TV channel not found for stream: ${args.id}`);
          return { streams: [] };
        }
        
        const stream = tv.toStremioStream();
        
        return { 
          streams: [stream],
          cacheMaxAge: this.#config.cache.tvCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error fetching TV stream', { error: error.message, args });
        return { streams: [] };
      }
    };
  }
}