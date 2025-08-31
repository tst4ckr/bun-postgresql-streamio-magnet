/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio para magnets.
 * Implementa los principios de Clean Architecture con separación de responsabilidades.
 */

import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { parseMagnet } from 'parse-magnet-uri';
import { unifiedIdService } from '../../infrastructure/services/UnifiedIdService.js';
import { dynamicValidationService } from '../../infrastructure/services/DynamicValidationService.js';

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
  #idService;
  #validationService;

  /**
   * @param {Object} magnetRepository - Repositorio de magnets.
   * @param {Object} config - Configuración del addon.
   * @param {Object} logger - Logger para trazabilidad.
   * @param {Object} idService - Servicio unificado de IDs (opcional, usa singleton por defecto).
   */
  constructor(magnetRepository, config, logger = console, idService = unifiedIdService, validationService = dynamicValidationService) {
    this.#magnetRepository = magnetRepository;
    this.#config = config;
    this.#logger = logger;
    this.#idService = idService;
    this.#validationService = validationService;
  }

  /**
   * Configura el idioma prioritario para las búsquedas de torrents.
   * @param {string} language - Código de idioma (spanish, latino, english, etc.)
   * @public
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
    
    // Validación asíncrona con servicio dinámico
    const validationResult = await this.#validateStreamRequest(args);
    
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
    
    // Log de información de validación para diagnóstico
    if (validationResult?.details?.detection) {
      this.#logger.info(`Stream generado para ${id} (${validationResult.details.detection.type}): ${streams.length} streams encontrados`);
    }
    
    return this.#createStreamResponse(streams);
  }

  /**
   * Valida los argumentos de la petición.
   * @private
   * @param {Object} args 
   * @throws {Error}
   */
  async #validateStreamRequest(args) {
    if (!args?.type || !['movie', 'series', 'anime'].includes(args.type)) {
      throw new Error('Tipo de contenido (movie/series/anime) requerido');
    }
    
    if (!args.id) {
      throw new Error('ID de contenido requerido');
    }

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
   * @param {string} contentId - ID de contenido (IMDb o Kitsu)
   * @param {string} type - Tipo de contenido ('movie' o 'series')
   * @returns {Promise<import('../../domain/entities/Magnet.js').Magnet[]|null>}
   */
  async #getMagnets(contentId, type = 'movie') {
    try {
      // Usar el método unificado del repositorio para manejar cualquier tipo de ID
      return await this.#magnetRepository.getMagnetsByContentId(contentId, type);
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        return null;
      }
      this.#logger.error(`Error obteniendo magnets para ${contentId}:`, error);
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
    
    // Formato esencial: Resolución | Proveedor
    let title = `${quality} | ${provider}`;
    
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
    
    // Información de seeders/peers
    if (magnet.seeders && magnet.seeders > 0) {
      const seedersInfo = `Seeders: ${magnet.seeders}`;
      if (magnet.peers && magnet.peers > 0) {
        techInfo.push(`${seedersInfo} | Peers: ${magnet.peers}`);
      } else {
        techInfo.push(seedersInfo);
      }
    }
    
    // Información de episodio para series/anime
    if ((type === 'series' || type === 'anime') && magnet.season && magnet.episode) {
      techInfo.push(`T${magnet.season}E${magnet.episode}`);
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
    this.#logger.error('Error en stream handler:', error);
    return {
      streams: [],
      cacheMaxAge: 60 // Cache corto para errores
    };
  }
}

export default StreamHandler;
