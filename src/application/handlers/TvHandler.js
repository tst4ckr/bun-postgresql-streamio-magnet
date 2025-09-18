/**
 * @fileoverview TvHandler - Maneja las peticiones de catálogo y streams de canales de TV.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';
import { cacheService } from '../../infrastructure/services/CacheService.js';

/**
 * Handler para peticiones de catálogo y streams de canales de TV.
 * Responsabilidad única: gestionar canales de TV M3U para Stremio.
 */
export class TvHandler {
  #tvRepository;
  #config;
  #logger;

  /**
   * @param {Object} tvRepository - Repositorio de canales de TV M3U.
   * @param {Object} config - Configuración del addon.
   * @param {Object} logger - Logger para trazabilidad.
   */
  constructor(tvRepository, config, logger = console) {
    this.#tvRepository = tvRepository;
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Crea el handler de catálogo para el addon de Stremio.
   * @returns {Function} Handler function para defineCatalogHandler.
   */
  createCatalogHandler() {
    return async (args) => {
      const startTime = Date.now();
      
      return safeExecute(async () => {
        this.#logger.info('Tv catalog request:', args);
        
        const result = await this.#handleCatalogRequest(args);
        
        this.#logger.info(`Tv catalog response time: ${Date.now() - startTime}ms`);
        return result;
      }, (error) => {
        this.#logger.error('Error in tv catalog handler:', error);
        return this.#createErrorCatalogResponse(error);
      });
    };
  }

  /**
   * Crea el handler de streams para el addon de Stremio.
   * @returns {Function} Handler function para defineStreamHandler.
   */
  createStreamHandler() {
    return async (args) => {
      const startTime = Date.now();
      
      return safeExecute(async () => {
        this.#logger.info('Tv stream request:', args);
        
        const result = await this.#handleStreamRequest(args);
        
        this.#logger.info(`Tv stream response time: ${Date.now() - startTime}ms`);
        return result;
      }, (error) => {
        this.#logger.error('Error in tv stream handler:', error);
        return this.#createErrorStreamResponse(error);
      });
    };
  }

  /**
   * Maneja peticiones de catálogo de canales de TV.
   * @private
   * @param {Object} args - Argumentos de la petición
   * @returns {Promise<Object>} Respuesta del catálogo
   */
  async #handleCatalogRequest(args) {
    const { type, id, extra = {} } = args;
    
    // Validar que es una petición de canales de TV
    if (type !== 'tv') {
      return this.#createEmptyCatalogResponse();
    }

    // Obtener parámetros de paginación y filtros
    const skip = parseInt(extra.skip) || 0;
    const maxChannels = this.#config.repository?.maxTvChannels || 1000;
    const limit = Math.min(parseInt(extra.limit) || 100, maxChannels); // Usar configuración maxTvChannels
    const search = extra.search?.trim();
    const genre = extra.genre?.trim();

    // Crear clave de cache
    const cacheKey = `catalog_tvs_${id}_${skip}_${limit}_${search || 'all'}_${genre || 'all'}`;
    
    // Intentar obtener desde cache
    const cached = cacheService.get(cacheKey);
    if (cached) {
      this.#logger.info('Returning cached tv catalog');
      return cached;
    }

    let tvs;

    // Aplicar filtros según los parámetros
    if (search) {
      tvs = await this.#tvRepository.searchTvs(search);
    } else if (genre && genre !== 'all') {
      tvs = await this.#tvRepository.getTvsByGroup(genre);
    } else {
      tvs = await this.#tvRepository.getAllTvs();
    }

    // Aplicar paginación
    const totalTvs = tvs.length;
    const paginatedTvs = tvs.slice(skip, skip + limit);

    // Convertir a formato Stremio
    const metas = paginatedTvs.map(tv => tv.toStremioMeta());

    const response = {
      metas,
      cacheMaxAge: this.#config.cache?.catalog || 300, // 5 minutos por defecto
      staleRevalidate: this.#config.cache?.staleRevalidate || 60,
      staleError: this.#config.cache?.staleError || 3600
    };

    // Guardar en cache
    cacheService.set(cacheKey, response, (this.#config.cache?.catalog || 300) * 1000);

    this.#logger.info(`Catalog response: ${metas.length} tvs (${totalTvs} total)`);
    return response;
  }

  /**
   * Maneja peticiones de stream de canales de TV.
   * @private
   * @param {Object} args - Argumentos de la petición
   * @returns {Promise<Object>} Respuesta del stream
   */
  async #handleStreamRequest(args) {
    const { type, id } = args;
    
    // Validar que es una petición de canal
    if (type !== 'tv') {
      return this.#createEmptyStreamResponse();
    }

    // Mapear IDs alternativos a IDs correctos
    const actualId = this.#mapAlternativeId(id);

    // Crear clave de cache
    const cacheKey = `stream_tv_${actualId}`;
    
    // Intentar obtener desde cache
    const cached = cacheService.get(cacheKey);
    if (cached) {
      this.#logger.info('Returning cached tv stream');
      return cached;
    }

    // Buscar el canal por ID (usar el ID mapeado)
    const tv = await this.#tvRepository.getTvById(actualId);
    
    if (!tv) {
      this.#logger.warn(`Tv not found: ${id} (mapped to: ${actualId})`);
      return this.#createEmptyStreamResponse();
    }

    // Crear stream response
    const stream = tv.toStremioStream();
    const response = {
      streams: [stream],
      cacheMaxAge: this.#config.cache?.stream || 600, // 10 minutos por defecto
      staleRevalidate: this.#config.cache?.staleRevalidate || 120,
      staleError: this.#config.cache?.staleError || 3600
    };

    // Guardar en cache
    cacheService.set(cacheKey, response, (this.#config.cache?.stream || 600) * 1000);

    this.#logger.info(`Stream response for tv: ${tv.name}`);
    return response;
  }

  /**
   * Obtiene géneros disponibles para el catálogo.
   * @returns {Promise<string[]>} Array de géneros únicos
   */
  async getAvailableGenres() {
    const cacheKey = 'tv_genres';
    
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const genres = await this.#tvRepository.getAvailableGroups();
    
    // Cache por 1 hora
    cacheService.set(cacheKey, genres, 3600000);
    
    return genres;
  }

  /**
   * Obtiene estadísticas de canales de TV.
   * @returns {Promise<Object>} Estadísticas del repositorio
   */
  async getTvStats() {
    return await this.#tvRepository.getStats();
  }

  /**
   * Fuerza la recarga de canales de TV.
   * @returns {Promise<void>}
   */
  async refreshTvs() {
    // Limpiar cache relacionado
    cacheService.clear('catalog_tvs_');
    cacheService.clear('stream_tv_');
    cacheService.clear('tv_genres');
    
    await this.#tvRepository.refreshTvs();
    this.#logger.info('Tvs refreshed successfully');
  }

  /**
   * Crea respuesta vacía para catálogo.
   * @private
   * @returns {Object} Respuesta vacía
   */
  #createEmptyCatalogResponse() {
    return {
      metas: [],
      cacheMaxAge: 300,
      staleRevalidate: 60,
      staleError: 3600
    };
  }

  /**
   * Crea respuesta vacía para stream.
   * @private
   * @returns {Object} Respuesta vacía
   */
  #createEmptyStreamResponse() {
    return {
      streams: [],
      cacheMaxAge: 600,
      staleRevalidate: 120,
      staleError: 3600
    };
  }

  /**
   * Crea respuesta de error para catálogo.
   * @private
   * @param {Error} error - Error ocurrido
   * @returns {Object} Respuesta de error
   */
  #createErrorCatalogResponse(error) {
    this.#logger.error('Tv catalog error:', error);
    return this.#createEmptyCatalogResponse();
  }

  /**
   * Crea respuesta de error para stream.
   * @private
   * @param {Error} error - Error ocurrido
   * @returns {Object} Respuesta de error
   */
  #createErrorStreamResponse(error) {
    this.#logger.error('Tv stream error:', error);
    return this.#createEmptyStreamResponse();
  }

  /**
   * Mapea IDs alternativos a IDs correctos.
   * @private
   * @param {string} id - ID original
   * @returns {string} ID mapeado o el original si no hay mapeo
   */
  #mapAlternativeId(id) {
    // Mapeo de IDs alternativos comunes
    const idMappings = {
      // Bob Esponja - mapeos comunes
      'tv_ch_kids_bobesponjala': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_bobesponja': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_bobespoja': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_spongebob': 'tv_ch_kids_bobesponjalatam',
      
      // Bob l'éponge - versión francesa
      'tv_ch_kids_boblponge': 'tv_ch_kids_boblponge',
      'tv_ch_kids_bobleponge': 'tv_ch_kids_boblponge',
      
      // Pluto TV Bob Esponja
      'tv_ch_kids_plutotvbobesponja': 'tv_ch_kids_plutotvbobesponja720p',
      'tv_ch_kids_plutotvspongebob': 'tv_ch_kids_plutotvbobesponja720p'
    };

    return idMappings[id] || id;
  }
}