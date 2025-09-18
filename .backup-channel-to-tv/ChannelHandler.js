/**
 * @fileoverview ChannelHandler - Maneja las peticiones de catálogo y streams de canales TV.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';
import { cacheService } from '../../infrastructure/services/CacheService.js';

/**
 * Handler para peticiones de catálogo y streams de canales de TV.
 * Responsabilidad única: gestionar canales M3U para Stremio.
 */
export class ChannelHandler {
  #channelRepository;
  #config;
  #logger;

  /**
   * @param {Object} channelRepository - Repositorio de canales M3U.
   * @param {Object} config - Configuración del addon.
   * @param {Object} logger - Logger para trazabilidad.
   */
  constructor(channelRepository, config, logger = console) {
    this.#channelRepository = channelRepository;
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
        this.#logger.info('Channel catalog request:', args);
        
        const result = await this.#handleCatalogRequest(args);
        
        this.#logger.info(`Channel catalog response time: ${Date.now() - startTime}ms`);
        return result;
      }, (error) => {
        this.#logger.error('Error in channel catalog handler:', error);
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
        this.#logger.info('Channel stream request:', args);
        
        const result = await this.#handleStreamRequest(args);
        
        this.#logger.info(`Channel stream response time: ${Date.now() - startTime}ms`);
        return result;
      }, (error) => {
        this.#logger.error('Error in channel stream handler:', error);
        return this.#createErrorStreamResponse(error);
      });
    };
  }

  /**
   * Maneja peticiones de catálogo de canales.
   * @private
   * @param {Object} args - Argumentos de la petición
   * @returns {Promise<Object>} Respuesta del catálogo
   */
  async #handleCatalogRequest(args) {
    const { type, id, extra = {} } = args;
    
    // Validar que es una petición de canales
    if (type !== 'tv') {
      return this.#createEmptyCatalogResponse();
    }

    // Obtener parámetros de paginación y filtros
    const skip = parseInt(extra.skip) || 0;
    const limit = Math.min(parseInt(extra.limit) || 100, 100); // Máximo 100 por página
    const search = extra.search?.trim();
    const genre = extra.genre?.trim();

    // Crear clave de cache
    const cacheKey = `catalog_channels_${id}_${skip}_${limit}_${search || 'all'}_${genre || 'all'}`;
    
    // Intentar obtener desde cache
    const cached = cacheService.get(cacheKey);
    if (cached) {
      this.#logger.info('Returning cached channel catalog');
      return cached;
    }

    let channels;

    // Aplicar filtros según los parámetros
    if (search) {
      channels = await this.#channelRepository.searchChannels(search);
    } else if (genre && genre !== 'all') {
      channels = await this.#channelRepository.getChannelsByGroup(genre);
    } else {
      channels = await this.#channelRepository.getAllChannels();
    }

    // Aplicar paginación
    const totalChannels = channels.length;
    const paginatedChannels = channels.slice(skip, skip + limit);

    // Convertir a formato Stremio
    const metas = paginatedChannels.map(channel => channel.toStremioMeta());

    const response = {
      metas,
      cacheMaxAge: this.#config.cache?.catalog || 300, // 5 minutos por defecto
      staleRevalidate: this.#config.cache?.staleRevalidate || 60,
      staleError: this.#config.cache?.staleError || 3600
    };

    // Guardar en cache
    cacheService.set(cacheKey, response, (this.#config.cache?.catalog || 300) * 1000);

    this.#logger.info(`Catalog response: ${metas.length} channels (${totalChannels} total)`);
    return response;
  }

  /**
   * Maneja peticiones de stream de canales.
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

    // Crear clave de cache
    const cacheKey = `stream_channel_${id}`;
    
    // Intentar obtener desde cache
    const cached = cacheService.get(cacheKey);
    if (cached) {
      this.#logger.info('Returning cached channel stream');
      return cached;
    }

    // Buscar el canal por ID
    const channel = await this.#channelRepository.getChannelById(id);
    
    if (!channel) {
      this.#logger.warn(`Channel not found: ${id}`);
      return this.#createEmptyStreamResponse();
    }

    // Crear stream response
    const stream = channel.toStremioStream();
    const response = {
      streams: [stream],
      cacheMaxAge: this.#config.cache?.stream || 600, // 10 minutos por defecto
      staleRevalidate: this.#config.cache?.staleRevalidate || 120,
      staleError: this.#config.cache?.staleError || 3600
    };

    // Guardar en cache
    cacheService.set(cacheKey, response, (this.#config.cache?.stream || 600) * 1000);

    this.#logger.info(`Stream response for channel: ${channel.name}`);
    return response;
  }

  /**
   * Obtiene géneros disponibles para el catálogo.
   * @returns {Promise<string[]>} Array de géneros únicos
   */
  async getAvailableGenres() {
    const cacheKey = 'channel_genres';
    
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const genres = await this.#channelRepository.getAvailableGroups();
    
    // Cache por 1 hora
    cacheService.set(cacheKey, genres, 3600000);
    
    return genres;
  }

  /**
   * Obtiene estadísticas de canales.
   * @returns {Promise<Object>} Estadísticas del repositorio
   */
  async getChannelStats() {
    return await this.#channelRepository.getStats();
  }

  /**
   * Fuerza la recarga de canales.
   * @returns {Promise<void>}
   */
  async refreshChannels() {
    // Limpiar cache relacionado
    cacheService.clear('catalog_channels_');
    cacheService.clear('stream_channel_');
    cacheService.clear('channel_genres');
    
    await this.#channelRepository.refreshChannels();
    this.#logger.info('Channels refreshed successfully');
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
    this.#logger.error('Channel catalog error:', error);
    return this.#createEmptyCatalogResponse();
  }

  /**
   * Crea respuesta de error para stream.
   * @private
   * @param {Error} error - Error ocurrido
   * @returns {Object} Respuesta de error
   */
  #createErrorStreamResponse(error) {
    this.#logger.error('Channel stream error:', error);
    return this.#createEmptyStreamResponse();
  }
}

export default ChannelHandler;