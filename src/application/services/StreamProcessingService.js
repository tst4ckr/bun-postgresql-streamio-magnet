/**
 * @fileoverview StreamProcessingService - Servicio especializado en procesamiento de streams.
 * Implementa Clean Architecture con Single Responsibility Principle.
 * 
 * Responsabilidades:
 * - Obtención de magnets desde repositorios
 * - Creación de streams desde magnets
 * - Formateo de títulos y descripciones
 * - Conversión de tamaños y utilidades
 * 
 * @author VeoVeo Development Team
 * @version 1.3.0
 */

import { parseMagnet } from 'parse-magnet-uri';
import { MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';

/**
 * Servicio de procesamiento para streams de Stremio.
 * Maneja toda la lógica de obtención y transformación de magnets a streams.
 */
export class StreamProcessingService {
  #magnetRepository;
  #unifiedIdService;
  #logger;

  /**
   * @param {Object} magnetRepository - Repositorio de magnets
   * @param {Object} unifiedIdService - Servicio de conversión de IDs
   * @param {Object} logger - Sistema de logging
   */
  constructor(magnetRepository, unifiedIdService, logger = console) {
    this.#magnetRepository = magnetRepository;
    this.#unifiedIdService = unifiedIdService;
    this.#logger = logger;
  }

  /**
   * Obtiene magnets para un contenido específico con manejo inteligente de tipos de ID.
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @param {Object} idDetection - Resultado de detección de ID
   * @returns {Promise<Array|null>} Lista de magnets o null si no se encuentran
   */
  async getMagnets(contentId, type = 'movie', idDetection) {
    this.#logger.debug(`Iniciando búsqueda de magnets para ${contentId} (${type})`);
    
    if (!idDetection.isValid) {
      this.#logger.debug(`ID inválido detectado: ${contentId} - ${idDetection.error}`);
    } else {
      this.#logger.debug(`Tipo de ID detectado: ${idDetection.type} para ${contentId}`);
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
      this.#logger.debug(`Encontrados ${magnetsResult.length} magnets para ${contentId}`);
      
      const sources = [...new Set(magnetsResult.map(m => m.provider || 'Unknown'))];
      const qualities = [...new Set(magnetsResult.map(m => m.quality || 'Unknown'))];
      
      this.#logger.debug(`Fuentes para ${contentId}: ${sources.join(', ')}`);
      this.#logger.debug(`Calidades disponibles: ${qualities.join(', ')}`);
    }
    
    return magnetsResult;
  }

  /**
   * Busca magnets usando el ID original.
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
        this.#logger.info(`No se encontraron magnets para ${contentId} con ID original`);
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
   * Busca magnets intentando conversión de ID a IMDb.
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} idDetection - Resultado de detección de ID
   * @returns {Promise<Array|null>} Lista de magnets
   */
  async #searchMagnetsWithConversion(contentId, type, idDetection) {
    this.#logger.debug(`Intentando conversión de ID ${idDetection.type} a IMDb para ${contentId}`);
    
    try {
      // Intentar conversión a IMDb
      const conversionResult = await safeExecute(
        () => this.#unifiedIdService.convertId(contentId, 'imdb'),
        { operation: 'unifiedId.convertId', contentId, targetService: 'imdb' }
      );
      
      if (conversionResult.error || !conversionResult.success) {
        this.#logger.warn(`No se pudo convertir ${contentId} a IMDb: ${conversionResult.error?.message || 'Conversión fallida'}`);
        return null;
      }
      
      const imdbId = conversionResult.convertedId;
      this.#logger.debug(`ID convertido: ${contentId} -> ${imdbId}`);
      
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
          this.#logger.info(`No se encontraron magnets para ${imdbId} (convertido desde ${contentId})`);
          return null;
        }
        throw magnetsResult.error;
      }
      
      if (magnetsResult && magnetsResult.length > 0) {
        this.#logger.debug(`Encontrados ${magnetsResult.length} magnets usando ID convertido ${imdbId}`);
      }
      
      return magnetsResult;
      
    } catch (error) {
      this.#logger.error(`Error en conversión de ID para ${contentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Crea streams de Stremio a partir de objetos Magnet con información enriquecida.
   * @param {import('../../domain/entities/Magnet.js').Magnet[]} magnets - Lista de magnets
   * @param {string} type - Tipo de contenido
   * @param {Object|null} metadata - Metadatos del contenido (opcional)
   * @returns {Object[]} Lista de streams formateados
   */
  createStreamsFromMagnets(magnets, type, metadata = null, idDetection = null) {
    if (!magnets || magnets.length === 0) {
      return [];
    }

    const streams = magnets.map(magnet => {
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

        const streamTitle = this.formatStreamTitle(magnet, type, metadata, idDetection);
        const streamDescription = this.formatStreamDescription(magnet, type, metadata, idDetection);

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
          stream.behaviorHints.videoSize = this.convertSizeToBytes(magnet.size);
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
   * Formatea el título del stream con información enriquecida.
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet - Objeto magnet
   * @param {string} type - Tipo de contenido
   * @param {Object|null} metadata - Metadatos del contenido
   * @param {Object|null} idDetection - Información de detección de ID
   * @returns {string} Título formateado
   */
  formatStreamTitle(magnet, type, metadata = null, idDetection = null) {
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
   * @param {import('../../domain/entities/Magnet.js').Magnet} magnet - Objeto magnet
   * @param {string} type - Tipo de contenido
   * @param {Object|null} metadata - Metadatos del contenido
   * @param {Object|null} idDetection - Información de detección de ID
   * @returns {string} Descripción formateada
   */
  formatStreamDescription(magnet, type, metadata = null, idDetection = null) {
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
   * Convierte el tamaño a bytes para videoSize.
   * @param {string} size - Tamaño en formato string (ej: "2.5 GB", "1500 MB")
   * @returns {number} Tamaño en bytes
   */
  convertSizeToBytes(size) {
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
}

export default StreamProcessingService;