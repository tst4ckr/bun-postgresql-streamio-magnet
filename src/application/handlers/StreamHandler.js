/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio para magnets.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { parseMagnet } from 'parse-magnet-uri';
import { dynamicValidationService } from '../../infrastructure/services/DynamicValidationService.js';
import { cacheService } from '../../infrastructure/services/CacheService.js';
import { ConfigurationCommandFactory } from '../../infrastructure/patterns/ConfigurationCommand.js';

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
  #validationService;
  #configInvoker;

  /**
   * @param {Object} magnetRepository - Repositorio de magnets.
   * @param {Object} config - Configuración del addon.
   * @param {Object} logger - Logger para trazabilidad.
   * @param {Object} validationService - Servicio de validación dinámica (opcional, usa singleton por defecto).
   */
  constructor(magnetRepository, config, logger = console, validationService = dynamicValidationService) {
    this.#magnetRepository = magnetRepository;
    this.#config = config;
    this.#logger = logger;
    this.#validationService = validationService;
    this.#configInvoker = ConfigurationCommandFactory.createInvoker(this.#logger);
  }

  /**
   * Configura el idioma prioritario temporalmente usando patrón Command/Memento.
   * @param {string} language - Código de idioma (spanish, latino, english, etc.)
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @returns {Function|null} Función para revertir el cambio, o null si falla
   * @public
   */
  setPriorityLanguageTemporary(language, type = 'movie') {
    if (!this.#magnetRepository || typeof this.#magnetRepository.setPriorityLanguage !== 'function') {
      this.#logger.warn('El repositorio no soporta configuración de idioma prioritario');
      return null;
    }

    try {
      // Crear comando para cambio temporal de idioma
      const languageConfig = {
        providers: this.#config.torrentio[type]?.languageConfigs?.spanish?.providers || this.#config.torrentio[type]?.providers,
        priorityLanguage: language
      };

      const command = ConfigurationCommandFactory.createLanguageCommand(
        this.#magnetRepository,
        type,
        languageConfig,
        this.#logger
      );

      // Ejecutar comando
      if (this.#configInvoker.executeCommand(command)) {
        this.#logger.info(`Idioma prioritario configurado temporalmente en StreamHandler: ${language} para ${type}`);
        
        // Retornar función para revertir
        return () => {
          this.#configInvoker.undoLastCommand();
          this.#logger.info(`Configuración de idioma revertida para ${type}`);
        };
      } else {
        this.#logger.error('No se pudo aplicar la configuración temporal de idioma');
        return null;
      }
    } catch (error) {
      this.#logger.error('Error al configurar idioma prioritario temporal:', error);
      return null;
    }
  }

  /**
   * Configura el idioma prioritario de forma permanente (método legacy).
   * @param {string} language - Código de idioma (spanish, latino, english, etc.)
   * @public
   * @deprecated Usar setPriorityLanguageTemporary para cambios temporales
   */
  setPriorityLanguage(language) {
    if (this.#magnetRepository && typeof this.#magnetRepository.setPriorityLanguage === 'function') {
      this.#magnetRepository.setPriorityLanguage(language);
      this.#logger.info(`Idioma prioritario configurado en StreamHandler: ${language}`);
    } else {
      this.#logger.warn('El repositorio no soporta configuración de idioma prioritario');
    }
  }

  /**
   * Obtiene el idioma prioritario actual.
   * @returns {string|null} Idioma prioritario configurado
   * @public
   */
  getPriorityLanguage() {
    if (this.#magnetRepository && typeof this.#magnetRepository.getPriorityLanguage === 'function') {
      return this.#magnetRepository.getPriorityLanguage();
    }
    return null;
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
        
        // Preservar stack trace completo para errores asíncronos
        const errorDetails = {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
          duration
        };
        
        this.#logger.error(`Stream request failed in ${duration}ms:`, errorDetails);
        
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
    const startTime = Date.now();
    
    // Log detallado del inicio de la petición
    this.#log('info', `Petición de stream iniciada para content ID: ${id} (${type})`);
    
    // Verificar cache de streams primero
    const streamCacheKey = cacheService.generateStreamCacheKey(id, type);
    const cachedStreams = cacheService.get(streamCacheKey);
    
    if (cachedStreams) {
      const duration = Date.now() - startTime;
      this.#log('info', `Streams obtenidos desde cache para ${id} en ${duration}ms`);
      return cachedStreams;
    }
    
    // Validación asíncrona con servicio dinámico
    const validationResult = await this.#validateStreamRequest(args);
    
    if (!this.#isSupportedType(type)) {
      this.#log('warn', `Tipo no soportado: ${type}`);
      const emptyResponse = this.#createEmptyResponse();
      
      // Cachear respuesta vacía con TTL corto
      cacheService.set(streamCacheKey, emptyResponse, 300000); // 5 minutos
      
      return emptyResponse;
    }

    // Detectar tipo de ID para anime
    const idType = this.#detectAnimeIdType(id);
    if (type === 'anime' && idType !== 'unknown') {
      this.#log('info', `ID de anime detectado: ${id} (tipo: ${idType})`);
    }

    const magnets = await this.#getMagnets(id, type);
    
    if (!magnets || magnets.length === 0) {
      this.#log('warn', `No se encontraron magnets para: ${id}`);
      const emptyResponse = this.#createEmptyResponse();
      
      // Cachear respuesta vacía con TTL corto
      cacheService.set(streamCacheKey, emptyResponse, 300000); // 5 minutos
      
      return emptyResponse;
    }

    const streams = this.#createStreamsFromMagnets(magnets, type);
    const duration = Date.now() - startTime;
    
    // Log detallado de resultados
    if (validationResult?.details?.detection) {
      this.#log('info', `Stream generado para ${id} (${validationResult.details.detection.type}): ${streams.length} streams encontrados en ${duration}ms`);
    } else {
      this.#log('info', `Stream generado para ${id} (${type}): ${streams.length} streams encontrados en ${duration}ms`);
    }
    
    const streamResponse = this.#createStreamResponse(streams);
    
    // Cachear respuesta exitosa
    const cacheTTL = this.#getStreamCacheTTL(type, streams.length);
    cacheService.set(streamCacheKey, streamResponse, cacheTTL);
    
    return streamResponse;
  }

  /**
   * Valida los argumentos de la petición.
   * @private
   * @param {Object} args 
   * @throws {Error}
   * @returns {Promise<Object>} Resultado de validación
   */
  async #validateStreamRequest(args) {
    // Validación de entrada con early returns
    if (!args || typeof args !== 'object') {
      throw new Error('Argumentos de stream requeridos y deben ser objeto');
    }

    if (!args.type || typeof args.type !== 'string') {
      throw new Error('Tipo de contenido requerido y debe ser string');
    }

    if (!['movie', 'series', 'anime'].includes(args.type)) {
      throw new Error('Tipo de contenido debe ser movie, series o anime');
    }
    
    if (!args.id || typeof args.id !== 'string') {
      throw new Error('ID de contenido requerido y debe ser string');
    }

    if (args.id.trim().length === 0) {
      throw new Error('ID de contenido no puede estar vacío');
    }

    try {
      // Usar validación dinámica para verificar el ID
      // Para stream requests no forzamos conversión a IMDb ya que Torrentio maneja anime IDs
      const validationResult = await this.#validationService.validateContentId(
        args.id, 
        'stream_request',
        { strictMode: false }
      );
      
      if (!validationResult.isValid) {
        const errorMsg = validationResult.details?.error || 'ID de contenido inválido';
        this.#logger.warn(`Validación falló para ID ${args.id}: ${errorMsg}`);
        throw new Error(`ID de contenido inválido: ${errorMsg}`);
      }

      this.#logger.debug(`Validación exitosa para ID ${args.id}:`, {
        type: validationResult.details?.detection?.type,
        confidence: validationResult.details?.detection?.confidence
      });
      
      return validationResult;
      
    } catch (error) {
      // Preservar stack trace y contexto para errores de validación
      const validationError = new Error(`Error en validación de stream request para ${args.id}: ${error.message}`);
      validationError.cause = error;
      validationError.contentId = args.id;
      validationError.contentType = args.type;
      throw validationError;
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
   * Obtiene los magnets por contenido ID de forma unificada.
   * @private
   * @param {string} contentId - ID de contenido (IMDb, Kitsu, MAL, etc.)
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @returns {Promise<import('../../domain/entities/Magnet.js').Magnet[]|null>}
   */
  async #getMagnets(contentId, type = 'movie') {
    try {
      this.#log('info', `Iniciando búsqueda de magnets para ${contentId} (${type})`);
      
      // Usar el método unificado del repositorio para manejar cualquier tipo de ID
      const magnets = await this.#magnetRepository.getMagnetsByContentId(contentId, type);
      
      if (magnets && magnets.length > 0) {
        this.#log('info', `Encontrados ${magnets.length} magnets para ${contentId}`);
        
        // Log adicional para anime con información de fuentes
        if (type === 'anime') {
          const sources = [...new Set(magnets.map(m => m.provider || 'Unknown'))];
          this.#log('info', `Fuentes de anime para ${contentId}: ${sources.join(', ')}`);
        }
      }
      
      return magnets;
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        this.#log('warn', `No se encontraron magnets para ${contentId}: ${error.message}`);
        return null;
      }
      this.#log('error', `Error obteniendo magnets para ${contentId}: ${error.message}`);
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

        const streamTitle = this.#formatStreamTitle(magnet, type);
        const streamDescription = this.#formatStreamDescription(magnet, type);

        return {
          name: streamTitle,
          description: streamDescription,
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
   * Formatea el título del stream de manera compacta.
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet
   * @param {string} type
   * @returns {string}
   */
  #formatStreamTitle(magnet, type) {
    const quality = magnet.quality || 'SD';
    const provider = magnet.provider || 'Unknown';
    
    // Formato específico para anime
    if (type === 'anime') {
      let title = `${quality} | ${provider}`;
      
      // Agregar información de episodio para anime
      if (magnet.season && magnet.episode) {
        title += ` | T${magnet.season}E${magnet.episode}`;
      } else if (magnet.episode) {
        title += ` | Ep${magnet.episode}`;
      }
      
      // Agregar información de seeders
      if (magnet.seeders && magnet.seeders > 0) {
        title += ` (${magnet.seeders}S)`;
      }
      
      return title;
    }
    
    // Formato para películas y series
    let title = `${quality} | ${provider}`;
    
    // Para series, agregar información de temporada/episodio
    if (type === 'series' && magnet.season && magnet.episode) {
      title += ` | T${magnet.season}E${magnet.episode}`;
    }
    
    // Agregar información de seeders si está disponible
    if (magnet.seeders && magnet.seeders > 0) {
      title += ` (${magnet.seeders}S)`;
    }
    
    return title;
  }

  /**
   * Formatea la descripción del stream con información detallada pero compacta.
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet
   * @param {string} type
   * @returns {string}
   */
  #formatStreamDescription(magnet, type) {
    const parts = [];
    
    // Nombre del archivo (primera línea)
    if (magnet.name) {
      const truncatedName = magnet.name.length > 60 
        ? magnet.name.substring(0, 57) + '...'
        : magnet.name;
      parts.push(truncatedName);
    }
    
    // Información técnica en líneas separadas
    const techInfo = [];
    
    if (magnet.quality && magnet.quality !== 'SD') {
      techInfo.push(`Calidad: ${magnet.quality}`);
    }
    
    if (magnet.size && magnet.size !== 'N/A') {
      techInfo.push(`Tamaño: ${magnet.size}`);
    }
    
    if (magnet.provider && magnet.provider !== 'Unknown') {
      techInfo.push(`Proveedor: ${magnet.provider}`);
    }
    
    // Información específica para anime
    if (type === 'anime') {
      // Información de episodio/temporada para anime
      if (magnet.season && magnet.episode) {
        techInfo.push(`Temporada ${magnet.season} - Episodio ${magnet.episode}`);
      } else if (magnet.episode) {
        techInfo.push(`Episodio ${magnet.episode}`);
      }
      
      // Información de idioma/subtítulos para anime
      if (magnet.language) {
        techInfo.push(`Idioma: ${magnet.language}`);
      }
      
      // Información de fansub para anime
      if (magnet.fansub) {
        techInfo.push(`Fansub: ${magnet.fansub}`);
      }
    } else {
      // Información de episodio para series
      if (type === 'series' && magnet.season && magnet.episode) {
        techInfo.push(`T${magnet.season}E${magnet.episode}`);
      }
    }
    
    // Información de seeders/peers
    if (magnet.seeders && magnet.seeders > 0) {
      const seedersInfo = `Seeders: ${magnet.seeders}`;
      if (magnet.peers && magnet.peers > 0) {
        techInfo.push(`${seedersInfo} | Peers: ${magnet.peers}`);
      } else {
        techInfo.push(seedersInfo);
      }
    }
    
    if (techInfo.length > 0) {
      parts.push(techInfo.join(' | '));
    }
    
    return parts.join('\n');
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
    this.#log('error', `Error en stream handler: ${error.message}`);
    return {
      streams: [],
      cacheMaxAge: 60 // Cache corto para errores
    };
  }

  /**
   * Detecta el tipo de ID específico para anime.
   * @private
   * @param {string} contentId - ID de contenido
   * @returns {string} Tipo de ID detectado
   */
  #detectAnimeIdType(contentId) {
    if (!contentId) return 'unknown';
    
    // Kitsu IDs empiezan con 'kitsu:'
    if (contentId.startsWith('kitsu:')) {
      return 'kitsu';
    }
    
    // MyAnimeList IDs empiezan con 'mal:'
    if (contentId.startsWith('mal:')) {
      return 'mal';
    }
    
    // AniList IDs empiezan con 'anilist:'
    if (contentId.startsWith('anilist:')) {
      return 'anilist';
    }
    
    // AniDB IDs empiezan con 'anidb:'
    if (contentId.startsWith('anidb:')) {
      return 'anidb';
    }
    
    // IMDb IDs empiezan con 'tt'
    if (contentId.startsWith('tt')) {
      return 'imdb';
    }
    
    // Si es solo números, podría ser Kitsu sin prefijo
    if (/^\d+$/.test(contentId)) {
      return 'numeric';
    }
    
    return 'unknown';
  }

  /**
   * Determina el TTL de cache para streams basado en el tipo y cantidad.
   * @private
   * @param {string} type - Tipo de contenido
   * @param {number} streamCount - Cantidad de streams encontrados
   * @returns {number} TTL en milisegundos
   */
  #getStreamCacheTTL(type, streamCount) {
    // Cache más largo para contenido con muchos streams
    if (streamCount > 10) {
      return 3600000; // 1 hora
    } else if (streamCount > 5) {
      return 1800000; // 30 minutos
    } else if (streamCount > 0) {
      return 900000; // 15 minutos
    } else {
      return 300000; // 5 minutos para respuestas vacías
    }
  }

  /**
   * Método de logging unificado con formato específico.
   * @private
   * @param {string} level - Nivel de log (info, warn, error)
   * @param {string} message - Mensaje a registrar
   */
  #log(level, message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${level.toUpperCase()}] ${timestamp} [handlers/StreamHandler.js] - ${message}`;
    
    switch (level) {
      case 'info':
        this.#logger.info(formattedMessage);
        break;
      case 'warn':
        this.#logger.warn(formattedMessage);
        break;
      case 'error':
        this.#logger.error(formattedMessage);
        break;
      default:
        this.#logger.log(formattedMessage);
    }
  }
}

export default StreamHandler;
