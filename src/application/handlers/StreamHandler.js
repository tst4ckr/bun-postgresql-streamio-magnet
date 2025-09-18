/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio para magnets.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { parseMagnet } from 'parse-magnet-uri';
import { dynamicValidationService } from '../../infrastructure/services/DynamicValidationService.js';
import { cacheService } from '../../infrastructure/services/CacheService.js';
import { ConfigurationCommandFactory } from '../../infrastructure/patterns/ConfigurationCommand.js';
import { errorHandler, withErrorHandling, createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';
import { unifiedIdService } from '../../infrastructure/services/UnifiedIdService.js';
import { idDetectorService } from '../../infrastructure/services/IdDetectorService.js';
import { metadataService } from '../../infrastructure/services/MetadataService.js';

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
  #cacheService;
  #unifiedIdService;
  #idDetectorService;
  #metadataService;

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
    this.#cacheService = cacheService;
    this.#unifiedIdService = unifiedIdService;
    this.#idDetectorService = idDetectorService;
    this.#metadataService = metadataService;
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
      const context = {
        args: JSON.stringify(args),
        timestamp: new Date().toISOString(),
        handler: 'StreamHandler.createAddonHandler'
      };
      
      this.#logger.info(`Stream request: ${JSON.stringify(args)}`);
      
      const result = await safeExecute(
        () => this.#handleStreamRequest(args),
        { ...context, operation: 'handleStreamRequest' }
      );
      
      const duration = Date.now() - startTime;
      
      if (result.error || result.degraded) {
        this.#logger.warn(`Stream request completed with issues in ${duration}ms`, {
          error: result.error,
          degraded: result.degraded
        });
      } else {
        this.#logger.info(`Stream request completed in ${duration}ms`);
      }
      
      // Si hay error, devolver respuesta de error apropiada
      if (result.error && !result.degraded) {
        return this.#createErrorResponse(result.error);
      }
      
      return result.degraded ? result.data : result;
    };
  }

  /**
   * Maneja la petición de stream de Stremio con detección inteligente de tipos.
   * @private
   * @param {Object} args - Argumentos de la petición.
   * @returns {Promise<Object>}
   */
  async #handleStreamRequest(args) {
    const { type, id } = args;
    const startTime = Date.now();
    
    // Log detallado del inicio de la petición
    this.#logMessage('info', `Petición de stream iniciada para content ID: ${id} (${type})`);
    
    // Detectar tipo de ID para optimizar el procesamiento
    const idDetection = this.#detectContentIdType(id);
    
    if (!idDetection.isValid) {
      this.#logMessage('warn', `ID potencialmente inválido: ${id} - ${idDetection.error}`);
    } else {
      this.#logMessage('info', `Tipo de ID detectado: ${idDetection.type} para ${id}`);
    }
    
    // Extraer season y episode del contentId para generar clave de caché única
    const { season, episode } = this.#extractSeasonEpisode(id);
    
    // Verificar cache de streams primero con clave específica por episodio
    const streamCacheKey = cacheService.generateStreamCacheKey(id, type, { season, episode });
    const cachedStreams = await safeExecute(
      () => cacheService.get(streamCacheKey),
      { operation: 'cache.get', cacheKey: streamCacheKey }
    );
    
    if (cachedStreams && !cachedStreams.error) {
      const duration = Date.now() - startTime;
      this.#logMessage('info', `Streams obtenidos desde cache para ${id} (${idDetection.type}) en ${duration}ms`);
      return cachedStreams;
    }
    
    // Validación asíncrona con servicio dinámico incluyendo información del tipo de ID
    const validationResult = await safeExecute(
      () => this.#validateStreamRequest({
        ...args,
        idType: idDetection.type,
        isValidId: idDetection.isValid,
        season,
        episode
      }),
      { operation: 'validation', contentId: id, type, idType: idDetection.type }
    );
    
    if (validationResult.error) {
      throw createError(
        `Validation failed for ${id}: ${validationResult.error.message}`,
        ERROR_TYPES.VALIDATION,
        { contentId: id, type, idType: idDetection.type, originalError: validationResult.error }
      );
    }
    
    if (!this.#isSupportedType(type)) {
      throw createError(
        `Tipo de contenido no soportado: ${type}`,
        ERROR_TYPES.VALIDATION,
        { type, supportedTypes: ['movie', 'series', 'anime'] }
      );
    }

    // Obtener metadatos enriquecidos si es posible
    let metadata = null;
    if (idDetection.isValid && idDetection.type !== 'numeric') {
      try {
        metadata = await this.#getEnhancedMetadata(id, type, idDetection);
        if (metadata) {
          this.#logMessage('info', `Metadatos obtenidos para ${id}: ${metadata.title || 'Sin título'}`);
        }
      } catch (error) {
        this.#logMessage('warn', `No se pudieron obtener metadatos para ${id}: ${error.message}`);
      }
    }

    const magnets = await this.#getMagnets(id, type);
    
    if (!magnets || magnets.length === 0) {
      this.#logMessage('warn', `No se encontraron magnets para: ${id} (${idDetection.type})`);
      const emptyResponse = this.#createEmptyResponse();
      
      // Cachear respuesta vacía con TTL corto
      const emptyTTL = cacheService.calculateAdaptiveTTL(type, 0, id);
      cacheService.set(streamCacheKey, emptyResponse, emptyTTL, {
        contentType: type,
        metadata: { 
          streamCount: 0, 
          source: 'stream',
          idType: idDetection.type,
          searchAttempted: true
        }
      });
      
      return emptyResponse;
    }

    const streams = this.#createStreamsFromMagnets(magnets, type, metadata);
    const duration = Date.now() - startTime;
    
    // Log detallado de resultados con información del tipo de ID
    this.#logMessage('info', `Stream generado para ${id} (${idDetection.type}): ${streams.length} streams encontrados en ${duration}ms`);
    
    const streamResponse = this.#createStreamResponse(streams, {
      contentId: id,
      type,
      idType: idDetection.type,
      title: metadata?.title,
      totalMagnets: magnets.length,
      totalStreams: streams.length
    });
    
    // Cachear respuesta exitosa con TTL basado en tipo de contenido
    const cacheTTL = this.#getCacheTTLByType(idDetection.type, streams.length);
    cacheService.set(streamCacheKey, streamResponse, cacheTTL, {
      contentType: type,
      metadata: { 
        streamCount: streams.length, 
        source: 'stream',
        idType: idDetection.type,
        duration,
        timestamp: Date.now()
      }
    });
    
    return streamResponse;
  }

  /**
   * Obtiene metadatos enriquecidos según el tipo de ID
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} idDetection - Información de detección de ID
   * @returns {Promise<Object|null>} Metadatos o null
   */
  async #getEnhancedMetadata(contentId, type, idDetection) {
    try {
      const metadata = await safeExecute(
        () => this.#metadataService.getMetadata(contentId, type),
        { operation: 'metadata.getMetadata', contentId, type, idType: idDetection.type }
      );
      
      if (metadata.error) {
        this.#logMessage('warn', `Error obteniendo metadatos: ${metadata.error.message}`);
        return null;
      }
      
      return metadata;
      
    } catch (error) {
      this.#logMessage('warn', `Excepción obteniendo metadatos para ${contentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Determina el TTL de caché basado en el tipo de ID y resultados
   * @private
   * @param {string} idType - Tipo de ID detectado
   * @param {number} streamCount - Número de streams encontrados
   * @returns {number} TTL en segundos
   */
  #getCacheTTLByType(idType, streamCount) {
    const baseTTL = this.#config.cache.streamCacheMaxAge || 3600;
    
    // TTL más largo para contenido con buenos resultados
    if (streamCount > 5) {
      return baseTTL * 2;
    }
    
    // TTL basado en tipo de ID
    switch (idType) {
      case 'imdb':
      case 'imdb_series':
        return baseTTL;
      case 'kitsu':
      case 'mal':
      case 'anilist':
        return Math.floor(baseTTL * 1.5);
      default:
        return Math.floor(baseTTL * 0.5);
    }
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
      throw createError(
        'Argumentos de stream requeridos y deben ser objeto',
        ERROR_TYPES.VALIDATION,
        { args }
      );
    }

    if (!args.type || typeof args.type !== 'string') {
      throw createError(
        'Tipo de contenido requerido y debe ser string',
        ERROR_TYPES.VALIDATION,
        { type: args.type }
      );
    }

    if (!['movie', 'series', 'anime'].includes(args.type)) {
      throw createError(
        'Tipo de contenido debe ser movie, series o anime',
        ERROR_TYPES.VALIDATION,
        { type: args.type, supportedTypes: ['movie', 'series', 'anime'] }
      );
    }
    
    if (!args.id || typeof args.id !== 'string') {
      throw createError(
        'ID de contenido requerido y debe ser string',
        ERROR_TYPES.VALIDATION,
        { id: args.id }
      );
    }

    if (args.id.trim().length === 0) {
      throw createError(
        'ID de contenido no puede estar vacío',
        ERROR_TYPES.VALIDATION,
        { id: args.id }
      );
    }

    // Usar validación dinámica para verificar el ID
    const validationResult = await safeExecute(
      () => this.#validationService.validateId(
        args.id, 
        'stream_request'
      ),
      { 
        operation: 'validation.validateId',
        contentId: args.id,
        type: args.type
      }
    );
    
    if (validationResult.error) {
      throw createError(
        `Error en validación de stream request para ${args.id}`,
        ERROR_TYPES.VALIDATION,
        { 
          contentId: args.id,
          contentType: args.type,
          originalError: validationResult.error
        }
      );
    }
    
    if (!validationResult.isValid) {
      const errorMsg = validationResult.details?.error || 'ID de contenido inválido';
      this.#logger.warn(`Validación falló para ID ${args.id}: ${errorMsg}`);
      throw createError(
        `ID de contenido inválido: ${errorMsg}`,
        ERROR_TYPES.VALIDATION,
        { 
          contentId: args.id,
          validationDetails: validationResult.details
        }
      );
    }

    this.#logger.debug(`Validación exitosa para ID ${args.id}:`, {
      type: validationResult.details?.detection?.type,
      confidence: validationResult.details?.detection?.confidence
    });
    
    return validationResult;
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
  /**
   * Obtiene magnets para un contenido específico con manejo inteligente de tipos de ID
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @returns {Promise<Array|null>} Lista de magnets o null si no se encuentran
   */
  async #getMagnets(contentId, type = 'movie') {
    this.#logMessage('info', `Iniciando búsqueda de magnets para ${contentId} (${type})`);
    
    // Detectar tipo de ID para optimizar búsqueda
    const idDetection = this.#detectContentIdType(contentId);
    
    if (!idDetection.isValid) {
      this.#logMessage('warn', `ID inválido detectado: ${contentId} - ${idDetection.error}`);
      // Continuar con búsqueda básica como fallback
    } else {
      this.#logMessage('info', `Tipo de ID detectado: ${idDetection.type} para ${contentId}`);
    }
    
    // Intentar búsqueda con ID original primero
    let magnetsResult = await this.#searchMagnetsWithId(contentId, type, idDetection);
    
    // Si no se encuentran magnets y el ID no es IMDb, intentar conversión
    if ((!magnetsResult || magnetsResult.length === 0) && 
        idDetection.isValid && 
        idDetection.type !== 'imdb' && 
        idDetection.type !== 'imdb_series') {
      
      magnetsResult = await this.#searchMagnetsWithConversion(contentId, type, idDetection);
    }
    
    if (magnetsResult && magnetsResult.length > 0) {
      this.#logMessage('info', `Encontrados ${magnetsResult.length} magnets para ${contentId}`);
      
      // Log adicional con información de fuentes y tipos
      const sources = [...new Set(magnetsResult.map(m => m.provider || 'Unknown'))];
      const qualities = [...new Set(magnetsResult.map(m => m.quality || 'Unknown'))];
      
      this.#logMessage('info', `Fuentes para ${contentId}: ${sources.join(', ')}`);
      this.#logMessage('info', `Calidades disponibles: ${qualities.join(', ')}`);
    }
    
    return magnetsResult;
  }
  
  /**
   * Busca magnets usando el ID original
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} idDetection - Resultado de detección de ID
   * @returns {Promise<Array|null>} Lista de magnets
   */
  async #searchMagnetsWithId(contentId, type, idDetection) {
    const magnetsResult = await safeExecute(
      () => this.#magnetRepository.getMagnetsByContentId(contentId, type),
      { 
        operation: 'repository.getMagnetsByContentId',
        contentId,
        type,
        idType: idDetection.type
      }
    );
    
    if (magnetsResult.error) {
      if (magnetsResult.error instanceof MagnetNotFoundError) {
        this.#logMessage('info', `No se encontraron magnets para ${contentId} con ID original`);
        return null;
      }
      throw createError(
        `Error accessing magnet repository for ${contentId}`,
        ERROR_TYPES.REPOSITORY,
        { contentId, type, idType: idDetection.type, originalError: magnetsResult.error }
      );
    }
    
    return magnetsResult;
  }
  
  /**
   * Busca magnets intentando conversión de ID a IMDb
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} idDetection - Resultado de detección de ID
   * @returns {Promise<Array|null>} Lista de magnets
   */
  async #searchMagnetsWithConversion(contentId, type, idDetection) {
    this.#logMessage('info', `Intentando conversión de ID ${idDetection.type} a IMDb para ${contentId}`);
    
    try {
      // Intentar conversión a IMDb
      const conversionResult = await safeExecute(
        () => this.#unifiedIdService.convertId(contentId, 'imdb'),
        { operation: 'unifiedId.convertId', contentId, targetService: 'imdb' }
      );
      
      if (conversionResult.error || !conversionResult.success) {
        this.#logMessage('warn', `No se pudo convertir ${contentId} a IMDb: ${conversionResult.error?.message || 'Conversión fallida'}`);
        return null;
      }
      
      const imdbId = conversionResult.convertedId;
      this.#logMessage('info', `ID convertido: ${contentId} -> ${imdbId}`);
      
      // Buscar con ID convertido
      const magnetsResult = await safeExecute(
        () => this.#magnetRepository.getMagnetsByContentId(imdbId, type),
        { 
          operation: 'repository.getMagnetsByContentId',
          contentId: imdbId,
          originalId: contentId,
          type
        }
      );
      
      if (magnetsResult.error) {
        if (magnetsResult.error instanceof MagnetNotFoundError) {
          this.#logMessage('info', `No se encontraron magnets para ${imdbId} (convertido desde ${contentId})`);
          return null;
        }
        throw magnetsResult.error;
      }
      
      if (magnetsResult && magnetsResult.length > 0) {
        this.#logMessage('info', `Encontrados ${magnetsResult.length} magnets usando ID convertido ${imdbId}`);
      }
      
      return magnetsResult;
      
    } catch (error) {
      this.#logMessage('error', `Error en conversión de ID para ${contentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Crea streams de Stremio a partir de objetos Magnet con información enriquecida.
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet[]} magnets
   * @param {string} type
   * @param {Object|null} metadata - Metadatos del contenido (opcional)
   * @returns {Object[]}
   */
  #createStreamsFromMagnets(magnets, type, metadata = null) {
    if (!magnets || magnets.length === 0) {
      return [];
    }

    const streams = magnets.map(magnet => {
      try {
        const parsedMagnet = parseMagnet(magnet.magnet);
        const infoHash = parsedMagnet.infoHash;
        const trackers = parsedMagnet.tr || [];

        if (!infoHash) {
          this.#logger.warn(`Magnet sin infoHash, saltando: ${magnet.magnet}`);
          return null;
        }

        const streamTitle = this.#formatStreamTitle(magnet, type, metadata);
        const streamDescription = this.#formatStreamDescription(magnet, type, metadata);

        const stream = {
          name: streamTitle,
          description: streamDescription,
          infoHash: infoHash,
          sources: trackers.map(t => `tracker:${t}`),
          type: type,
          behaviorHints: {
            bingeGroup: `magnet-${infoHash}`,
            countryWhitelist: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI']
          }
        };

        // Agregar información adicional si está disponible
        if (magnet.seeders && magnet.seeders > 0) {
          stream.behaviorHints.seeders = magnet.seeders;
        }

        if (magnet.leechers && magnet.leechers >= 0) {
          stream.behaviorHints.leechers = magnet.leechers;
        }

        if (magnet.size) {
          stream.behaviorHints.videoSize = magnet.size;
        }

        // Agregar información de calidad si está disponible
        if (magnet.quality) {
          stream.behaviorHints.videoQuality = magnet.quality;
        }

        // Agregar información del proveedor
        if (magnet.provider) {
          stream.behaviorHints.provider = magnet.provider;
        }

        // Personalizar según tipo de contenido
        if (type === 'anime') {
          stream.behaviorHints.contentType = 'anime';
          if (metadata?.year) {
            stream.behaviorHints.year = metadata.year;
          }
        }

        return stream;
      } catch (error) {
        this.#logger.error(`Error al parsear magnet URI: "${magnet.magnet}"`, error);
        return null;
      }
    }).filter(Boolean); // Eliminar nulos si los hubiera

    // Ordenar streams por calidad y seeders
    streams.sort((a, b) => {
      // Priorizar por seeders si están disponibles
      const seedersA = a.behaviorHints?.seeders || 0;
      const seedersB = b.behaviorHints?.seeders || 0;
      
      if (seedersA !== seedersB) {
        return seedersB - seedersA; // Mayor número de seeders primero
      }
      
      // Luego por calidad (si está disponible)
      const qualityOrder = { '2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };
      const qualityA = qualityOrder[a.behaviorHints?.videoQuality] || 0;
      const qualityB = qualityOrder[b.behaviorHints?.videoQuality] || 0;
      
      return qualityB - qualityA;
    });

    return streams;
  }

  /**
   * Formatea el título del stream con información enriquecida
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet
   * @param {string} type
   * @param {Object|null} metadata - Metadatos del contenido
   * @param {Object|null} idDetection - Información de detección de ID
   * @returns {string}
   */
  #formatStreamTitle(magnet, type, metadata = null, idDetection = null) {
    const quality = magnet.quality || 'SD';
    const provider = magnet.provider || 'Unknown';
    
    // Determinar emoji basado en tipo de ID o contenido
    let emoji = '';
    if (idDetection?.type) {
      switch (idDetection.type) {
        case 'kitsu':
        case 'mal':
        case 'anilist':
        case 'anidb':
          emoji = '🎌 ';
          break;
        case 'imdb':
        case 'imdb_series':
          emoji = '🎬 ';
          break;
        default:
          if (type === 'anime') {
            emoji = '🎌 ';
          }
      }
    } else if (type === 'anime') {
      emoji = '🎌 ';
    }
    
    // Formato específico para anime
    if (type === 'anime') {
      let title = `${emoji}${quality} | ${provider}`;
      
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
    let title = `${emoji}${quality} | ${provider}`;
    
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
   * Formatea la descripción del stream con información detallada y metadatos enriquecidos.
   * @private
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet
   * @param {string} type
   * @param {Object|null} metadata - Metadatos del contenido
   * @param {Object|null} idDetection - Información de detección de ID
   * @returns {string}
   */
  #formatStreamDescription(magnet, type, metadata = null, idDetection = null) {
    const parts = [];
    
    // Título del contenido si está disponible en metadatos
    if (metadata?.title) {
      const titleLine = metadata.title;
      if (metadata.year) {
        parts.push(`${titleLine} (${metadata.year})`);
      } else {
        parts.push(titleLine);
      }
    }
    
    // Nombre del archivo (segunda línea o primera si no hay metadatos)
    if (magnet.name) {
      const truncatedName = magnet.name.length > 60 
        ? magnet.name.substring(0, 57) + '...'
        : magnet.name;
      parts.push(truncatedName);
    }
    
    // Información técnica en líneas separadas
    const techInfo = [];
    
    // Información del tipo de ID
    if (idDetection?.type && idDetection.type !== 'unknown') {
      const idTypeMap = {
        'kitsu': 'Kitsu',
        'mal': 'MyAnimeList',
        'anilist': 'AniList',
        'anidb': 'AniDB',
        'imdb': 'IMDb',
        'imdb_series': 'IMDb Series'
      };
      const idTypeName = idTypeMap[idDetection.type] || idDetection.type.toUpperCase();
      techInfo.push(`Fuente: ${idTypeName}`);
    }
    
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
   * Crea respuesta de stream con metadatos opcionales.
   * @private
   * @param {Array} streams 
   * @param {Object} metadata - Metadatos opcionales del contenido
   * @returns {Object}
   */
  #createStreamResponse(streams, metadata = null) {
    const response = {
      streams,
      // Cache más largo para magnets, ya que no cambian frecuentemente.
      cacheMaxAge: this.#config.cache.streamCacheMaxAge,
      staleRevalidate: this.#config.cache.streamStaleRevalidate,
      staleError: this.#config.cache.streamStaleError
    };
    
    // Agregar metadatos si están disponibles
    if (metadata) {
      response.metadata = metadata;
    }
    
    return response;
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
   * Crea respuesta de error estandarizada.
   * @private
   * @param {Error} error 
   * @returns {Object}
   */
  #createErrorResponse(error) {
    this.#logMessage('error', `Error en stream handler: ${error.message}`);
    
    // Determinar el tiempo de cache basado en el tipo de error
    let cacheMaxAge = 300; // 5 minutos por defecto
    
    if (error.type === ERROR_TYPES.VALIDATION) {
      cacheMaxAge = 60; // 1 minuto para errores de validación
    } else if (error.type === ERROR_TYPES.NETWORK || error.type === ERROR_TYPES.TIMEOUT) {
      cacheMaxAge = 30; // 30 segundos para errores de red
    } else if (error.type === ERROR_TYPES.RATE_LIMIT) {
      cacheMaxAge = 900; // 15 minutos para rate limiting
    }
    
    return {
      streams: [],
      cacheMaxAge,
      error: error.message || 'Error interno del servidor',
      errorType: error.type || ERROR_TYPES.UNKNOWN,
      recoverable: error.recoverable || false,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extrae season y episode del contentId si están presentes.
   * @private
   * @param {string} contentId - ID de contenido (ej: kitsu:6448:11, tt1234567:1:5)
   * @returns {Object} Objeto con season y episode extraídos
   */
  #extractSeasonEpisode(contentId) {
    if (!contentId || typeof contentId !== 'string') {
      return { season: undefined, episode: undefined };
    }
    
    // Dividir por ':' para extraer partes
    const parts = contentId.split(':');
    
    // Solo extraer season/episode si hay más de 2 partes Y las últimas dos son números
    // Esto evita interpretar IDs como 'kitsu:6448' como season:episode
    if (parts.length > 2) {
      const seasonPart = parts[parts.length - 2]; // Penúltima parte
      const episodePart = parts[parts.length - 1]; // Última parte
      
      // Validar que ambas sean números válidos para confirmar que son season/episode
      const seasonIsNumber = /^\d+$/.test(seasonPart);
      const episodeIsNumber = /^\d+$/.test(episodePart);
      
      if (seasonIsNumber && episodeIsNumber) {
        // Verificar que no sea un ID base (como kitsu:6448)
        // Si solo hay 2 partes numéricas, probablemente es un ID, no season/episode
        if (parts.length === 2) {
          return { season: undefined, episode: undefined };
        }
        
        const season = parseInt(seasonPart, 10);
        const episode = parseInt(episodePart, 10);
        
        return { season, episode };
      }
    }
    
    return { season: undefined, episode: undefined };
  }

  /**
   * Detecta el tipo de ID específico para anime.
   * @private
   * @param {string} contentId - ID de contenido
   * @returns {string} Tipo de ID detectado
   */
  /**
   * Detecta el tipo de ID de contenido usando el servicio especializado
   * @private
   * @param {string} contentId - ID del contenido
   * @returns {Object} Resultado de detección con tipo y metadatos
   */
  #detectContentIdType(contentId) {
    if (!contentId) {
      return { type: 'unknown', isValid: false, error: 'ID vacío' };
    }
    
    try {
      const detection = this.#idDetectorService.detectIdType(contentId);
      this.#logMessage('debug', `ID detectado: ${contentId} -> ${detection.type} (válido: ${detection.isValid})`);
      return detection;
    } catch (error) {
      this.#logMessage('error', `Error detectando tipo de ID para ${contentId}: ${error.message}`);
      return { type: 'unknown', isValid: false, error: error.message };
    }
  }

  /**
   * Método legacy para compatibilidad - usa el nuevo método interno
   * @private
   * @param {string} contentId - ID del contenido
   * @returns {string} Tipo de ID detectado
   * @deprecated Usar #detectContentIdType para información completa
   */
  #detectAnimeIdType(contentId) {
    const detection = this.#detectContentIdType(contentId);
    return detection.type || 'unknown';
  }



  /**
   * Crea una clave de caché única para el contenido incluyendo tipo de ID
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {number|null} season - Temporada (opcional)
   * @param {number|null} episode - Episodio (opcional)
   * @param {string} idType - Tipo de ID detectado (opcional)
   * @returns {string} Clave de caché
   */
  #createCacheKey(contentId, type, season = null, episode = null, idType = null) {
    let key = `stream:${type}:${contentId}`;
    
    // Agregar tipo de ID si está disponible para mayor especificidad
    if (idType && idType !== 'unknown') {
      key += `:${idType}`;
    }
    
    // Agregar season/episode solo si ambos están presentes y son válidos
    if (season !== null && episode !== null && 
        Number.isInteger(season) && Number.isInteger(episode) &&
        season > 0 && episode > 0) {
      key += `:s${season}e${episode}`;
    }
    
    return key;
  }

  /**
   * Método de logging unificado con formato específico.
   * @private
   * @param {string} level - Nivel de log (info, warn, error)
   * @param {string} message - Mensaje a registrar
   */
  #logMessage(level, message) {
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
        this.#logger.info(formattedMessage);
    }
  }
}

export default StreamHandler;
