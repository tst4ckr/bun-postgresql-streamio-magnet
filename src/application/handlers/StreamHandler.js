/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio para magnets.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { parseMagnet } from 'parse-magnet-uri';

/**
 * Handler para peticiones de streams de magnets.
 * Responsabilidad única: convertir magnets a formato de stream de Stremio.
 */
export class StreamHandler {
  /**
   * @private
   */
  #magnetRepository;
  #config;
  #logger;

  /**
   * @param {Object} magnetRepository - Repositorio de magnets.
   * @param {Object} config - Configuración del addon.
   * @param {Object} logger - Logger para trazabilidad.
   */
  constructor(magnetRepository, config, logger = console) {
    this.#magnetRepository = magnetRepository;
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Crea el handler para el addon de Stremio.
   * @returns {Function} Handler function para defineStreamHandler.
   */
  createAddonHandler() {
    return async (args) => {
      const startTime = Date.now();
      
      try {
        this.#logger.info(`Stream request: ${JSON.stringify(args)}`);
        
        const result = await this.#handleStreamRequest(args);
        
        const duration = Date.now() - startTime;
        this.#logger.info(`Stream request completed in ${duration}ms`);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this.#logger.error(`Stream request failed in ${duration}ms:`, error);
        
        return this.#createErrorResponse(error);
      }
    };
  }

  /**
   * Maneja la petición de stream de Stremio.
   * @private
   * @param {Object} args - Argumentos de la petición.
   * @returns {Promise<Object>}
   */
  async #handleStreamRequest(args) {
    const { type, id } = args;
    
    this.#validateStreamRequest(args);
    
    if (!this.#isSupportedType(type)) {
      this.#logger.warn(`Tipo no soportado: ${type}`);
      return this.#createEmptyResponse();
    }

    const magnets = await this.#getMagnets(id, type);
    
    if (!magnets || magnets.length === 0) {
      this.#logger.warn(`No se encontraron magnets para: ${id}`);
      return this.#createEmptyResponse();
    }

    const streams = this.#createStreamsFromMagnets(magnets, type);
    
    return this.#createStreamResponse(streams);
  }

  /**
   * Valida los argumentos de la petición.
   * @private
   * @param {Object} args 
   * @throws {Error}
   */
  #validateStreamRequest(args) {
    if (!args?.type || !['movie', 'series', 'anime'].includes(args.type)) {
      throw new Error('Tipo de contenido (movie/series/anime) requerido');
    }
    if (!args.id || !args.id.startsWith('tt')) {
      throw new Error('ID de contenido (IMDb) requerido');
    }
  }

  /**
   * Verifica si el tipo es soportado.
   * @private
   * @param {string} type 
   * @returns {boolean}
   */
  #isSupportedType(type) {
    return ['movie', 'series', 'anime'].includes(type);
  }

  /**
   * Obtiene los magnets por IMDb ID.
   * @private
   * @param {string} imdbId 
   * @param {string} type - Tipo de contenido ('movie' o 'series')
   * @returns {Promise<import('../../domain/entities/Magnet.js').Magnet[]|null>}
   */
  async #getMagnets(imdbId, type = 'movie') {
    try {
      return await this.#magnetRepository.getMagnetsByImdbId(imdbId, type);
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Crea streams de Stremio a partir de objetos Magnet.
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet[]} magnets
   * @param {string} type
   * @returns {Object[]}
   */
  #createStreamsFromMagnets(magnets, type) {
    return magnets.map(magnet => {
      try {
        const parsedMagnet = parseMagnet(magnet.magnet);
        const infoHash = parsedMagnet.infoHash;
        const trackers = parsedMagnet.tr || [];

        if (!infoHash) {
          this.#logger.warn(`Magnet sin infoHash, saltando: ${magnet.magnet}`);
          return null;
        }

        return {
          name: `[${magnet.quality || 'SD'}] ${this.#config.addon.name}`,
          description: `📁 ${magnet.name}\n💾 ${magnet.size || 'N/A'}`,
          infoHash: infoHash,
          sources: trackers.map(t => `tracker:${t}`),
          type: type,
          behaviorHints: {
            bingeGroup: `magnet-${infoHash}`,
          }
        };
      } catch (error) {
        this.#logger.error(`Error al parsear magnet URI: "${magnet.magnet}"`, error);
        return null;
      }
    }).filter(Boolean); // Eliminar nulos si los hubiera
  }

  /**
   * Crea respuesta de stream.
   * @private
   * @param {Array} streams 
   * @returns {Object}
   */
  #createStreamResponse(streams) {
    return {
      streams,
      // Cache más largo para magnets, ya que no cambian frecuentemente.
      cacheMaxAge: this.#config.cache.streamCacheMaxAge,
      staleRevalidate: this.#config.cache.streamStaleRevalidate,
      staleError: this.#config.cache.streamStaleError
    };
  }

  /**
   * Crea respuesta vacía.
   * @private
   * @returns {Object}
   */
  #createEmptyResponse() {
    return {
      streams: [],
      cacheMaxAge: this.#config.cache.streamCacheMaxAge
    };
  }

  /**
   * Crea respuesta de error.
   * @private
   * @param {Error} error 
   * @returns {Object}
   */
  #createErrorResponse(error) {
    this.#logger.error('Error en stream handler:', error);
    return {
      streams: [],
      cacheMaxAge: 60 // Cache corto para errores
    };
  }
}

export default StreamHandler;
