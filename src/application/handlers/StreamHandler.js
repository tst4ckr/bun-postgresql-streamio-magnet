/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio para magnets.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { parseMagnet } from 'parse-magnet-uri';
import { dynamicValidationService } from '../../infrastructure/services/DynamicValidationService.js';
import { cacheService } from '../../infrastructure/services/CacheService.js';
import { createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';
import { unifiedIdService } from '../../infrastructure/services/UnifiedIdService.js';
import { idDetectorService } from '../../infrastructure/services/IdDetectorService.js';
import { metadataService } from '../../infrastructure/services/MetadataService.js';

/**
 * Handler para peticiones de streams de magnets.
 * Responsabilidad única: convertir magnets a formato de stream de Stremio.
 */
export class StreamHandler {
  #magnetRepository;
  #config;
  #logger;
  #validationService;
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
    this.#unifiedIdService = unifiedIdService;
    this.#idDetectorService = idDetectorService;
    this.#metadataService = metadataService;
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
      
      this.#logger.debug(`Stream request: ${JSON.stringify(args)}`);
      
      const result = await safeExecute(
        () => this.#handleStreamRequest(args),
        { ...context, operation: 'handleStreamRequest' }
      );
      
      const duration = Date.now() - startTime;
      
      if (result.error || result.degraded) {
        this.#logger.debug(`Stream request completed with issues in ${duration}ms`, {
          error: result.error,
          degraded: result.degraded
        });
      } else {
        this.#logger.debug(`Stream request completed in ${duration}ms`);
      }
      
      // Si hay error, devolver respuesta de error apropiada
      if (result.error && !result.degraded) {
        // Pasar el tipo de contenido para proporcionar cacheMaxAge, staleRevalidate y staleError
        const contentType = args?.type || 'movie';
        return this.#createErrorResponse(result.error, contentType);
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
    
    this.#logger.debug(`Petición de stream iniciada para content ID: ${id} (${type})`);
    
    const idDetection = this.#detectContentIdType(id);
    
    if (!idDetection.isValid) {
      this.#logger.debug(`ID potencialmente inválido: ${id} - ${idDetection.error}`);
    } else {
      this.#logger.debug(`Tipo de ID detectado: ${idDetection.type} para ${id}`);
    }
    
    const { season, episode } = this.#extractSeasonEpisode(id);
    
    // Extraer el ID base sin season:episode para la clave de caché
    // Esto asegura que cada episodio tenga su propia clave de caché
    const baseContentId = this.#getBaseContentId(id, season, episode);
    
    this.#logger.debug(`Extracción de ID: original=${id}, base=${baseContentId}, season=${season}, episode=${episode}`);
    
    const streamCacheKey = cacheService.generateStreamCacheKey(baseContentId, type, { season, episode });
    this.#logger.debug(`Clave de caché generada: ${streamCacheKey}`);
    
    const cachedStreams = await safeExecute(
      () => cacheService.get(streamCacheKey),
      { operation: 'cache.get', cacheKey: streamCacheKey }
    ).catch(error => {
      this.#logger.warn(`Cache error for ${streamCacheKey}:`, { error: error.message });
      return null;
    });
    
    if (cachedStreams && !cachedStreams.error) {
      const duration = Date.now() - startTime;
      // Validar que el contenido cacheado corresponde al episodio solicitado
      const cachedStreamsCount = cachedStreams.streams?.length || 0;
      this.#logger.debug(`Streams obtenidos desde cache para ${id} (${idDetection.type}) en ${duration}ms, clave: ${streamCacheKey}, streams: ${cachedStreamsCount}, season=${season}, episode=${episode}`);
      
      // Verificar que los streams cacheados correspondan al episodio correcto
      // Si hay season/episode, validar que los streams coincidan
      if (season !== undefined && episode !== undefined && cachedStreams.streams && cachedStreams.streams.length > 0) {
        // Los streams deberían tener información de episodio si es una serie/anime
        // Por ahora confiamos en la clave de caché que incluye season/episode
        this.#logger.debug(`Cache validado: clave incluye s${season}e${episode}, devolviendo streams cacheados`);
      }
      
      return cachedStreams;
    }
    

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
        { type, supportedTypes: ['movie', 'series', 'anime', 'tv'] }
      );
    }


    let metadata = null;
    if (idDetection.isValid && idDetection.type !== 'numeric') {
      try {
        metadata = await this.#getEnhancedMetadata(id, type, idDetection);
        if (metadata) {
          this.#logger.debug(`Metadatos obtenidos para ${id}: ${metadata.title || 'Sin título'}`);
        }
      } catch (error) {
        this.#logger.warn(`No se pudieron obtener metadatos para ${id}: ${error.message}`);
      }
    }

    const magnets = await this.#getMagnets(id, type, season, episode);
    
    if (!magnets || magnets.length === 0) {
      this.#logger.warn(`No se encontraron magnets para: ${id} (${idDetection.type}, season=${season}, episode=${episode})`);
      // Pasar el tipo para usar cacheMaxAge específico para animes
      const emptyResponse = this.#createEmptyResponse(type);
      

      const emptyTTL = cacheService.calculateAdaptiveTTL(type, 0, id);
      cacheService.set(streamCacheKey, emptyResponse, emptyTTL, {
        contentType: type,
        metadata: { 
          streamCount: 0, 
          source: 'stream',
          idType: idDetection.type,
          season,
          episode,
          searchAttempted: true
        }
      });
      
      return emptyResponse;
    }

    // Validar que los magnets correspondan al episodio solicitado (filtrado estricto adicional)
    let validMagnets = magnets;
    if (season !== undefined && episode !== undefined) {
      const beforeFilter = magnets.length;
      validMagnets = magnets.filter(m => {
        // Extraer season/episode del magnet
        let mSeason = m.season;
        let mEpisode = m.episode;
        
        // Si no están en las propiedades, intentar extraer del content_id
        if (mSeason === undefined || mEpisode === undefined) {
          if (m.content_id && m.content_id.includes(':')) {
            const parts = m.content_id.split(':');
            if (parts.length >= 3) {
              const seasonPart = parts[parts.length - 2];
              const episodePart = parts[parts.length - 1];
              if (/^\d+$/.test(seasonPart) && /^\d+$/.test(episodePart)) {
                if (mSeason === undefined) mSeason = parseInt(seasonPart, 10);
                if (mEpisode === undefined) mEpisode = parseInt(episodePart, 10);
              }
            }
          }
        }
        
        // Coincidencia estricta: solo incluir si tiene season/episode Y coinciden exactamente
        if (mSeason !== undefined && mEpisode !== undefined) {
          const exactMatch = mSeason === season && mEpisode === episode;
          if (!exactMatch) {
            this.#logger.debug(`Magnets filtrado: magnet S${mSeason}E${mEpisode} no coincide con solicitado S${season}E${episode}`);
          }
          return exactMatch;
        }
        
        // Si el magnet no tiene season/episode y se requiere coincidencia exacta, excluir
        return false;
      });
      
      if (beforeFilter !== validMagnets.length) {
        this.#logger.warn(`⚠️  Filtrado estricto: ${beforeFilter} -> ${validMagnets.length} magnets para S${season}E${episode}`);
      }
      
      if (validMagnets.length === 0) {
        this.#logger.warn(`No quedaron magnets válidos después del filtrado estricto para S${season}E${episode}`);
        const emptyResponse = this.#createEmptyResponse(type);
        const emptyTTL = cacheService.calculateAdaptiveTTL(type, 0, id);
        cacheService.set(streamCacheKey, emptyResponse, emptyTTL, {
          contentType: type,
          metadata: { 
            streamCount: 0, 
            source: 'stream',
            idType: idDetection.type,
            season,
            episode,
            searchAttempted: true
          }
        });
        return emptyResponse;
      }
    }

    const streams = this.#createStreamsFromMagnets(validMagnets, type, metadata);
    const duration = Date.now() - startTime;
    
    this.#logger.debug(`Stream generado para ${id} (${idDetection.type}, S${season}E${episode}): ${streams.length} streams encontrados en ${duration}ms`);
    
    // Pasar el tipo de contenido para usar cacheMaxAge específico (especialmente para animes)
    const streamResponse = this.#createStreamResponse(streams, {
      contentId: id,
      type,
      idType: idDetection.type,
      title: metadata?.title,
      totalMagnets: validMagnets.length,
      totalStreams: streams.length,
      season,
      episode
    }, type);
    

    const cacheTTL = this.#getCacheTTLByType(idDetection.type, streams.length, type);
    cacheService.set(streamCacheKey, streamResponse, cacheTTL, {
      contentType: type,
      metadata: { 
        streamCount: streams.length, 
        source: 'stream',
        idType: idDetection.type,
        season,
        episode,
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
        this.#logger.warn(`Error obteniendo metadatos: ${metadata.error.message}`);
        return null;
      }
      
      return metadata;
      
    } catch (error) {
      this.#logger.warn(`Excepción obteniendo metadatos para ${contentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Determina el TTL de caché basado en el tipo de ID y resultados
   * @private
   * @param {string} idType - Tipo de ID detectado
   * @param {number} streamCount - Número de streams encontrados
   * @param {string} contentType - Tipo de contenido (movie, series, anime, tv)
   * @returns {number} TTL en milisegundos
   */
  #getCacheTTLByType(idType, streamCount, contentType = 'movie') {
    // Para animes usar TTL más corto para evitar problemas entre capítulos
    if (contentType === 'anime') {
      const animeTTL = (this.#config.cache.animeCacheMaxAge || 300) * 1000; // Convertir a milisegundos
      return animeTTL;
    }
    
    const baseTTL = (this.#config.cache.streamCacheMaxAge || 3600) * 1000; // Convertir a milisegundos
    
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

    if (!['movie', 'series', 'tv'].includes(args.type)) {
      throw createError(
        'Tipo de contenido debe ser movie, series o tv',
        ERROR_TYPES.VALIDATION,
        { type: args.type, supportedTypes: ['movie', 'series', 'tv'] }
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
    // Solo soportamos movies, series y tv. Anime se ha deshabilitado explícitamente.
    return ['movie', 'series', 'tv'].includes(type);
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
   * @param {number|undefined} season - Temporada (para series/anime)
   * @param {number|undefined} episode - Episodio (para series/anime)
   * @returns {Promise<Array|null>} Lista de magnets o null si no se encuentran
   */
  async #getMagnets(contentId, type = 'movie', season = undefined, episode = undefined) {
    this.#logger.debug(`Iniciando búsqueda de magnets para ${contentId} (${type}, season=${season}, episode=${episode})`);
    

    const idDetection = this.#detectContentIdType(contentId);
    
    if (!idDetection.isValid) {
      this.#logger.debug(`ID inválido detectado: ${contentId} - ${idDetection.error}`);

    } else {
      this.#logger.debug(`Tipo de ID detectado: ${idDetection.type} para ${contentId}`);
    }
    
    // Preparar opciones de búsqueda con season/episode
    const searchOptions = { season, episode };
    
    // Intentar búsqueda con ID original primero
    let magnetsResult = await this.#searchMagnetsWithId(contentId, type, idDetection, searchOptions);
    
    // Si no se encuentran magnets y el ID no es IMDb, intentar conversión
    if ((!magnetsResult || magnetsResult.length === 0) && 
        idDetection.isValid && 
        idDetection.type !== 'imdb' && 
        idDetection.type !== 'imdb_series') {
      
      magnetsResult = await this.#searchMagnetsWithConversion(contentId, type, idDetection, searchOptions);
    }
    
    if (magnetsResult && magnetsResult.length > 0) {
      this.#logger.debug(`Encontrados ${magnetsResult.length} magnets para ${contentId} (season=${season}, episode=${episode})`);
      

      const sources = [...new Set(magnetsResult.map(m => m.provider || 'Unknown'))];
      const qualities = [...new Set(magnetsResult.map(m => m.quality || 'Unknown'))];
      
      this.#logger.debug(`Fuentes para ${contentId}: ${sources.join(', ')}`);
      this.#logger.debug(`Calidades disponibles: ${qualities.join(', ')}`);
    }
    
    return magnetsResult;
  }
  
  /**
   * Busca magnets usando el ID original
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} idDetection - Resultado de detección de ID
   * @param {Object} options - Opciones de búsqueda (season, episode)
   * @returns {Promise<Array|null>} Lista de magnets
   */
  async #searchMagnetsWithId(contentId, type, idDetection, options = {}) {
    // Extraer ID base para búsqueda en repositorio (sin season:episode)
    // El repositorio necesita el ID base para buscar, y luego filtrar por season/episode
    const baseContentId = this.#getBaseContentId(contentId, options.season, options.episode);
    
    // Log para debugging: mostrar qué ID se está usando
    this.#logger.debug(`Búsqueda de magnets: contentId=${contentId}, baseContentId=${baseContentId}, season=${options.season}, episode=${options.episode}`);
    
    const magnetsResult = await safeExecute(
      () => this.#magnetRepository.getMagnetsByContentId(baseContentId, type, options),
      { 
        operation: 'repository.getMagnetsByContentId',
        contentId,
        baseContentId,
        type,
        idType: idDetection.type,
        season: options.season,
        episode: options.episode
      }
    );
    
    if (magnetsResult.error) {
      if (magnetsResult.error instanceof MagnetNotFoundError) {
        this.#logger.info(`No se encontraron magnets para ${contentId} con ID original (season=${options.season}, episode=${options.episode})`);
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
   * @param {Object} options - Opciones de búsqueda (season, episode)
   * @returns {Promise<Array|null>} Lista de magnets
   */
  async #searchMagnetsWithConversion(contentId, type, idDetection, options = {}) {
    this.#logger.debug(`Intentando conversión de ID ${idDetection.type} a IMDb para ${contentId} (season=${options.season}, episode=${options.episode})`);
    
    try {
      // Extraer ID base para conversión (sin season:episode)
      const baseContentId = this.#getBaseContentId(contentId, options.season, options.episode);
      
      // Intentar conversión a IMDb usando el ID base
      const conversionResult = await safeExecute(
        () => this.#unifiedIdService.convertId(baseContentId, 'imdb'),
        { operation: 'unifiedId.convertId', contentId: baseContentId, targetService: 'imdb' }
      );
      
      if (conversionResult.error || !conversionResult.success) {
        this.#logger.warn(`No se pudo convertir ${baseContentId} a IMDb: ${conversionResult.error?.message || 'Conversión fallida'}`);
        return null;
      }
      
      const imdbId = conversionResult.convertedId;
      
      // Reconstruir el ID completo con season/episode si existen
      let finalImdbId = imdbId;
      if (options.season !== undefined && options.episode !== undefined) {
        finalImdbId = `${imdbId}:${options.season}:${options.episode}`;
      }
      
      this.#logger.debug(`ID convertido: ${baseContentId} -> ${finalImdbId}`);

      const magnetsResult = await safeExecute(
        () => this.#magnetRepository.getMagnetsByContentId(finalImdbId, type, options),
        { 
          operation: 'repository.getMagnetsByContentId',
          contentId: finalImdbId,
          originalId: contentId,
          type,
          season: options.season,
          episode: options.episode
        }
      );
      
      if (magnetsResult.error) {
        if (magnetsResult.error instanceof MagnetNotFoundError) {
          this.#logger.info(`No se encontraron magnets para ${finalImdbId} (convertido desde ${contentId})`);
          return null;
        }
        throw magnetsResult.error;
      }
      
      if (magnetsResult && magnetsResult.length > 0) {
        this.#logger.debug(`Encontrados ${magnetsResult.length} magnets usando ID convertido ${finalImdbId}`);
      }
      
      return magnetsResult;
      
    } catch (error) {
      this.#logger.error(`Error en conversión de ID para ${contentId}: ${error.message}`);
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

    const banned = (this.#config.filters?.bannedStreamNames || []);
    const normalize = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ');
    const isBanned = (name) => {
      if (!name) return false;
      const n = normalize(name);
      return banned.some(b => n === normalize(b));
    };

    const filteredMagnets = magnets.filter(m => !isBanned(m.name));

    const streams = filteredMagnets.map(magnet => {
      try {
        const parsedMagnet = parseMagnet(magnet.magnet);
        const infoHash = parsedMagnet.infoHash;
        // Filtrar solo trackers válidos (HTTP/HTTPS/UDP)
        const trackers = (parsedMagnet.tr || []).filter(tracker => {
          return tracker && (
            tracker.startsWith('http://') || 
            tracker.startsWith('https://') || 
            tracker.startsWith('udp://')
          );
        });

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
          behaviorHints: {
            bingeGroup: `magnet-${infoHash}`,
            countryWhitelist: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI']
          }
        };

        // Agregar fileIdx si está disponible
        if (magnet.fileIdx !== undefined && magnet.fileIdx !== null) {
          stream.fileIdx = magnet.fileIdx;
        }

        // Agregar propiedades oficiales de behaviorHints según SDK
        if (magnet.size) {
          stream.behaviorHints.videoSize = this.#convertSizeToBytes(magnet.size);
        }

        // Agregar filename si está disponible (recomendado para subtítulos)
        if (magnet.filename) {
          stream.behaviorHints.filename = magnet.filename;
        }

        return stream;
      } catch (error) {
        this.#logger.error(`Error al parsear magnet URI: "${magnet.magnet}"`, error);
        return null;
      }
    }).filter(Boolean); // Eliminar nulos si los hubiera

    // Ordenar streams por tamaño de archivo (proxy de calidad) para mejor rendimiento
    streams.sort((a, b) => {
      // Priorizar por tamaño de archivo (mayor tamaño = mejor calidad generalmente)
      const sizeA = a.behaviorHints?.videoSize || 0;
      const sizeB = b.behaviorHints?.videoSize || 0;
      
      if (sizeA !== sizeB) {
        return sizeB - sizeA; // Mayor tamaño primero
      }
      
      // Fallback: ordenar alfabéticamente por nombre para consistencia
      return a.name.localeCompare(b.name);
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
   * @param {string} type - Tipo de contenido (movie, series, anime, tv)
   * @returns {Object}
   */
  #createStreamResponse(streams, metadata = null, type = 'movie') {
    // Para películas, series y anime (todo excepto TV) siempre proporcionar cacheMaxAge, staleRevalidate y staleError
    // TV tiene su propio handler con configuración específica
    
    let cacheMaxAge;
    let staleRevalidate;
    let staleError;
    
    if (type === 'anime') {
      // Para animes usar cache más corto para evitar problemas entre capítulos
      cacheMaxAge = this.#config.cache.animeCacheMaxAge || 300; // 5 minutos
      staleRevalidate = Math.min(cacheMaxAge * 2, 600); // 10 minutos máximo
      staleError = Math.min(cacheMaxAge * 4, 1800); // 30 minutos máximo
    } else if (type === 'movie' || type === 'series') {
      // Para películas y series usar cache estándar con staleRevalidate y staleError
      cacheMaxAge = this.#config.cache.streamCacheMaxAge || 3600; // 1 hora
      staleRevalidate = this.#config.cache.streamStaleRevalidate || 3600; // 1 hora
      staleError = this.#config.cache.streamStaleError || 86400; // 1 día
    } else {
      // Para otros tipos (tv se maneja en TvHandler) usar valores por defecto
      cacheMaxAge = this.#config.cache.streamCacheMaxAge || 3600;
      staleRevalidate = this.#config.cache.streamStaleRevalidate || 3600;
      staleError = this.#config.cache.streamStaleError || 86400;
    }
    
    return {
      streams,
      cacheMaxAge,
      staleRevalidate,
      staleError
    };
  }

  /**
   * Crea respuesta vacía.
   * @private
   * @param {string} type - Tipo de contenido (movie, series, anime, tv)
   * @returns {Object}
   */
  #createEmptyResponse(type = 'movie') {
    // Para películas, series y anime (todo excepto TV) siempre proporcionar cacheMaxAge, staleRevalidate y staleError
    // TV tiene su propio handler con configuración específica
    
    let cacheMaxAge;
    let staleRevalidate;
    let staleError;
    
    if (type === 'anime') {
      // Para animes usar cache más corto para evitar problemas entre capítulos
      cacheMaxAge = this.#config.cache.animeCacheMaxAge || 300; // 5 minutos
      staleRevalidate = Math.min(cacheMaxAge * 2, 600); // 10 minutos máximo
      staleError = Math.min(cacheMaxAge * 4, 1800); // 30 minutos máximo
    } else if (type === 'movie' || type === 'series') {
      // Para películas y series usar cache estándar con staleRevalidate y staleError
      cacheMaxAge = this.#config.cache.streamCacheMaxAge || 3600; // 1 hora
      staleRevalidate = this.#config.cache.streamStaleRevalidate || 3600; // 1 hora
      staleError = this.#config.cache.streamStaleError || 86400; // 1 día
    } else {
      // Para otros tipos (tv se maneja en TvHandler) usar valores por defecto
      cacheMaxAge = this.#config.cache.streamCacheMaxAge || 3600;
      staleRevalidate = this.#config.cache.streamStaleRevalidate || 3600;
      staleError = this.#config.cache.streamStaleError || 86400;
    }
    
    return {
      streams: [],
      cacheMaxAge,
      staleRevalidate,
      staleError
    };
  }

  /**
   * Convierte el tamaño a bytes para videoSize.
   * @private
   * @param {string} size - Tamaño en formato string (ej: "2.5 GB", "1500 MB")
   * @returns {number} Tamaño en bytes
   */
  #convertSizeToBytes(size) {
    if (!size || size === 'N/A' || size === 'unknown') {
      return 0;
    }
    
    const sizeStr = size.toString().toLowerCase();
    const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(gb|mb|tb|kb)/i);
    
    if (!match) {
      return 0;
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'tb':
        return Math.round(value * 1024 * 1024 * 1024 * 1024);
      case 'gb':
        return Math.round(value * 1024 * 1024 * 1024);
      case 'mb':
        return Math.round(value * 1024 * 1024);
      case 'kb':
        return Math.round(value * 1024);
      default:
        return 0;
    }
  }

  /**
   * Crea respuesta de error estandarizada.
   * @private
   * @param {Error} error 
   * @returns {Object}
   */
  #createErrorResponse(error, type = 'movie') {
    this.#logger.error(`Error en stream handler: ${error.message}`);
    
    // Determinar el tiempo de cache basado en el tipo de error
    let cacheMaxAge = 300; // 5 minutos por defecto
    
    if (error.type === ERROR_TYPES.VALIDATION) {
      cacheMaxAge = 60; // 1 minuto para errores de validación
    } else if (error.type === ERROR_TYPES.NETWORK || error.type === ERROR_TYPES.TIMEOUT) {
      cacheMaxAge = 30; // 30 segundos para errores de red
    } else if (error.type === ERROR_TYPES.RATE_LIMIT) {
      cacheMaxAge = 900; // 15 minutos para rate limiting
    }
    
    // Para películas, series y anime siempre proporcionar staleRevalidate y staleError
    const staleRevalidate = Math.min(cacheMaxAge * 2, 600); // Máximo 10 minutos
    const staleError = Math.min(cacheMaxAge * 4, 1800); // Máximo 30 minutos
    
    return {
      streams: [],
      cacheMaxAge,
      staleRevalidate,
      staleError,
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
      this.#logger.debug(`ID detectado: ${contentId} -> ${detection.type} (válido: ${detection.isValid})`);
      return detection;
    } catch (error) {
      this.#logger.error(`Error detectando tipo de ID para ${contentId}: ${error.message}`);
      return { type: 'unknown', isValid: false, error: error.message };
    }
  }

  /**
   * Extrae el ID base del contentId, removiendo season:episode si están presentes
   * @private
   * @param {string} contentId - ID completo del contenido (puede incluir season:episode)
   * @param {number|undefined} season - Temporada extraída (opcional, para validación)
   * @param {number|undefined} episode - Episodio extraído (opcional, para validación)
   * @returns {string} ID base sin season:episode
   */
  #getBaseContentId(contentId, season, episode) {
    if (!contentId || typeof contentId !== 'string') {
      return contentId;
    }
    
    // Si hay season y episode, significa que el contentId incluye esta información
    // Necesitamos extraer solo la parte base del ID
    if (season !== undefined && episode !== undefined) {
      const parts = contentId.split(':');
      
      // Validar que las últimas dos partes sean números que coincidan con season y episode
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        const secondLastPart = parts[parts.length - 2];
        
        // Verificar que las últimas dos partes sean números y coincidan con season/episode
        const lastIsEpisode = /^\d+$/.test(lastPart) && parseInt(lastPart, 10) === episode;
        const secondLastIsSeason = /^\d+$/.test(secondLastPart) && parseInt(secondLastPart, 10) === season;
        
        if (lastIsEpisode && secondLastIsSeason) {
          // Remover las últimas 2 partes (season:episode)
          return parts.slice(0, -2).join(':');
        }
      }
      
      // Si no se pudo validar, intentar remover las últimas 2 partes si son números
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        const secondLastPart = parts[parts.length - 2];
        
        if (/^\d+$/.test(lastPart) && /^\d+$/.test(secondLastPart)) {
          // Asumir que son season:episode y removerlas
          return parts.slice(0, -2).join(':');
        }
      }
    }
    
    // Si no hay season/episode o no se pudo extraer, devolver el ID completo
    return contentId;
  }

}

export default StreamHandler;
