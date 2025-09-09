/**
 * @fileoverview TorrentioApiService - Servicio para integración con la API de Torrentio.
 * Maneja consultas externas y persistencia de resultados en torrentio.csv.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import net from 'net';
import { Magnet } from '../../domain/entities/Magnet.js';
import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import { CONSTANTS } from '../../config/constants.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ConfigurationCommandFactory } from '../patterns/ConfigurationCommand.js';

/**
 * Clase de error específica para TorrentioApiService
 */
class TorrentioApiError extends Error {
  constructor(message, code = 'TORRENTIO_ERROR', originalError = null, context = {}) {
    super(message);
    this.name = 'TorrentioApiError';
    this.code = code;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Servicio para integración con la API de Torrentio de Stremio.
 * Implementa el patrón Service con responsabilidad única para consultas externas.
 */
export class TorrentioApiService {
  #baseUrl;
  #timeout;
  #logger;
  #torrentioFilePath;
  #englishFilePath;
  #providerConfigs;
  #manifestCache;
  #manifestCacheExpiry;
  #torEnabled;
  #torHost;
  #torPort;
  #torControlPort;
    #torControlHost;
    #torRotationInterval;
  #maxRetries;
  #retryDelay;
  #configInvoker;

  /**
   * Método auxiliar para logging optimizado con contexto estructurado
   * @param {string} level - Nivel de log (info, warn, error, debug)
   * @param {string} message - Mensaje a loggear
   * @param {any} data - Datos adicionales para contexto estructurado
   */
  #log(level, message, data = null) {
    if (!this.#logger) {
      // Crear logger temporal si no existe
      const fallbackLogger = new EnhancedLogger('info', true);
      if (data !== null && data !== undefined) {
        fallbackLogger.structured(level, message, {
          component: 'TorrentioApiService',
          ...data
        });
      } else {
        fallbackLogger[level](message);
      }
      return;
    }

    // Usar logging estructurado si hay datos y el logger lo soporta
    if (typeof this.#logger.structured === 'function' && data !== null && data !== undefined) {
      this.#logger.structured(level, message, {
        component: 'TorrentioApiService',
        ...data
      });
      return;
    }

    // Usar método de nivel específico sin pasar data como argumento adicional
    if (typeof this.#logger[level] === 'function') {
      this.#logger[level](message);
    } else {
      // Fallback final con EnhancedLogger
      const fallbackLogger = new EnhancedLogger('info', true);
      fallbackLogger[level](message);
    }
  }

  /**
   * @param {string} baseUrl - URL base de la API de Torrentio
   * @param {string} torrentioFilePath - Ruta del archivo torrentio.csv
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para peticiones HTTP
   * @param {Object} torConfig - Configuración de Tor {enabled: boolean, host: string, port: number, maxRetries: number, retryDelay: number}
   * @param {string} englishFilePath - Ruta del archivo english.csv para contenido en inglés
   */
  constructor(baseUrl, torrentioFilePath, logger = console, timeout = CONSTANTS.TIME.DEFAULT_TIMEOUT, torConfig = {}, englishFilePath = null) {
    this.#baseUrl = baseUrl;
    this.#torrentioFilePath = torrentioFilePath;
    this.#englishFilePath = englishFilePath || torrentioFilePath.replace('torrentio.csv', 'english.csv');
    this.#logger = logger;
    this.#timeout = timeout;
    
    // Configuración de Tor con valores por defecto
    this.#torEnabled = torConfig.enabled ?? true;
    this.#torHost = torConfig.host ?? CONSTANTS.NETWORK.TOR_DEFAULT_HOST;
    this.#torPort = torConfig.port ?? CONSTANTS.NETWORK.TOR_DEFAULT_PORT;
    this.#torControlHost = torConfig.controlHost ?? CONSTANTS.NETWORK.TOR_CONTROL_DEFAULT_HOST;
    this.#torControlPort = torConfig.controlPort ?? CONSTANTS.NETWORK.TOR_CONTROL_DEFAULT_PORT;
    this.#maxRetries = torConfig.maxRetries ?? CONSTANTS.NETWORK.MAX_RETRIES;
    this.#retryDelay = torConfig.retryDelay ?? CONSTANTS.TIME.TOR_RETRY_DELAY;
    
    // Inicializar invoker de comandos para configuración temporal
    this.#configInvoker = ConfigurationCommandFactory.createInvoker(this.#logger);
    
    this.#providerConfigs = this.#initializeProviderConfigs();
    this.#manifestCache = new Map();
    this.#manifestCacheExpiry = CONSTANTS.TIME.MANIFEST_CACHE_EXPIRY;
    this.#torRotationInterval = null;
    this.#ensureTorrentioFileExists();
    this.#startTorRotation();
    
    // Configuración de Tor con socks-proxy-agent
    if (this.#torEnabled) {
      this.#log('info', `Tor configurado en ${this.#torHost}:${this.#torPort}`);
    }
  }

  /**
   * Busca magnets por cualquier tipo de ID usando la API de Torrentio
   * Soporta IMDb, TMDB, TVDB, Kitsu y otros IDs
   * Soporta películas, series y anime con detección automática de tipo
   * @param {string} contentId - ID del contenido (ej: 'tt1234567', 'tmdb:12345', 'tvdb:67890', 'kitsu:12345')
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime', 'auto' para detección automática)
   * @param {number} season - Temporada (requerido para series/anime)
   * @param {number} episode - Episodio (requerido para series/anime)
   * @returns {Promise<Array>} - Array de objetos magnet con las siguientes propiedades:
   *   - magnetUri: URI del magnet
   *   - title: Título del archivo
   *   - quality: Calidad del video (incluye formatos específicos de anime)
   *   - size: Tamaño del archivo
   *   - provider: Proveedor (español: cinecalidad, mejortorrent, wolfmax4k; anime: nyaasi, horriblesubs, TokyoTosho, AniDex)
   *   - seeders: Número de seeders
   *   - peers: Número de peers
   *   - season: Temporada (solo para series/anime)
   *   - episode: Episodio (solo para series/anime)
   */
  async searchMagnetsById(contentId, type = 'auto', season = null, episode = null) {
    try {
      // Validar que tengamos un ID válido
      if (!contentId || typeof contentId !== 'string') {
        this.#log('warn', `ID inválido para Torrentio API: ${contentId}`);
        return [];
      }
      
      // Detectar tipo automáticamente si es necesario
      const detectedType = type === 'auto' ? this.#detectContentType(contentId, season, episode) : type;
      this.#log('info', `Buscando magnets en API Torrentio para: ${contentId} (${detectedType})`);
      
      // Procesar el ID para obtener el formato correcto para Torrentio
      const { processedId } = this.#processContentId(contentId);
      
      // Construir ID según el tipo de contenido
      let finalStreamId = processedId;
      if ((detectedType === 'series' || detectedType === 'anime') && season !== null && episode !== null) {
        finalStreamId = `${processedId}:${season}:${episode}`;
        this.#log('info', `Formato de serie/anime: ${finalStreamId}`);
      }
      
      // Construir URL según el tipo de contenido con proveedores optimizados
      const optimizedBaseUrl = this.#getOptimizedBaseUrl(detectedType);
      
      // Mapear tipo de contenido para la URL de Torrentio
      let urlContentType;
      switch (detectedType) {
        case 'anime':
          urlContentType = 'series'; // Torrentio trata anime como series
          break;
        case 'series':
          urlContentType = 'series';
          break;
        case 'movie':
        default:
          urlContentType = 'movie';
          break;
      }
      
      const streamUrl = `${optimizedBaseUrl}/stream/${urlContentType}/${finalStreamId}.json`;
      this.#log('info', `URL construida: ${streamUrl}`);
      const response = await this.#fetchWithTor(streamUrl);
      
      if (!response.ok) {
        this.#logger.warn(`API Torrentio respondió con status ${response.status} para ${finalStreamId}`);
        return [];
      }
      
      const data = await response.json();
      const magnets = this.#parseStreamsToMagnets(data.streams || [], contentId, detectedType, season, episode);
      
      if (magnets.length > 0) {
        await this.#saveMagnetsToFile(magnets);
        this.#logger.info(`Guardados ${magnets.length} magnets de API Torrentio para ${finalStreamId}`);
      }
      
      return magnets;
      
    } catch (error) {
      // Preservar stack trace completo del error de API
      const apiError = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        contentId,
        type: detectedType,
        operation: 'api_search',
        url: streamUrl
      };
      
      this.#log('error', 'Error en búsqueda de API Torrentio:', apiError);
      return [];
    }
  }

  /**
   * Busca magnets por ID de IMDb usando la API de Torrentio
   * @deprecated Use searchMagnetsById en su lugar
   * @param {string} imdbId - ID de IMDb (ej: 'tt1234567')
   * @param {string} type - Tipo de contenido
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {Promise<Array>} Array de magnets
   */
  async searchMagnetsByImdbId(imdbId, type = 'auto', season = null, episode = null) {
    return this.searchMagnetsById(imdbId, type, season, episode);
  }

  /**
   * Busca magnets con fallback de idioma: primero en español, luego combinado
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @param {number} season - Temporada (para series/anime)
   * @param {number} episode - Episodio (para series/anime)
   * @returns {Promise<Array>} Array de magnets
   */
  async searchMagnetsWithLanguageFallback(contentId, type = 'auto', season = null, episode = null) {
    this.#log('info', `Iniciando búsqueda con fallback de idioma para ${contentId}`, { type, season, episode });
    
    try {
      // Detectar tipo de contenido si es 'auto'
      const detectedType = type === 'auto' ? this.#detectContentType(contentId, season, episode) : type;
      
      // Obtener configuraciones de idioma para el tipo de contenido
      const typeConfig = addonConfig.torrentio[detectedType];
      if (!typeConfig || !typeConfig.languageConfigs) {
        this.#log('warn', `No hay configuraciones de idioma para tipo: ${detectedType}`);
        return this.searchMagnetsById(contentId, detectedType, season, episode);
      }
      
      // Primera búsqueda: solo en español
      this.#log('info', `Primera búsqueda: trackers en español para ${contentId}`);
      const spanishResults = await this.#searchWithLanguageConfig(
        contentId, 
        detectedType, 
        typeConfig.languageConfigs.spanish,
        season, 
        episode
      );
      
      if (spanishResults && spanishResults.length > 0) {
        const resultsWithSeeds = this.#filterResultsWithSeeds(spanishResults);
        if (resultsWithSeeds.length > 0) {
          this.#log('info', `Encontrados ${resultsWithSeeds.length} resultados con seeds en trackers españoles`);
          await this.#saveMagnetsToFile(resultsWithSeeds, 'spanish');
          return resultsWithSeeds;
        } else {
          this.#log('warn', `Encontrados ${spanishResults.length} resultados en español pero sin seeds disponibles`);
        }
      }
      
      // Segunda búsqueda: trackers combinados (español + inglés)
      this.#log('info', `Segunda búsqueda: trackers combinados para ${contentId}`);
      const combinedResults = await this.#searchWithLanguageConfig(
        contentId, 
        detectedType, 
        typeConfig.languageConfigs.combined,
        season, 
        episode
      );
      
      if (combinedResults && combinedResults.length > 0) {
        const resultsWithSeeds = this.#filterResultsWithSeeds(combinedResults);
        if (resultsWithSeeds.length > 0) {
          this.#log('info', `Encontrados ${resultsWithSeeds.length} resultados con seeds en trackers combinados`);
          await this.#saveMagnetsToFile(resultsWithSeeds, 'spanish');
          return resultsWithSeeds;
        } else {
          this.#log('warn', `Encontrados ${combinedResults.length} resultados combinados pero sin seeds disponibles`);
        }
      }
      
      this.#log('warn', `No se encontraron resultados en ninguna configuración de idioma para ${contentId}`);
      return [];
      
    } catch (error) {
      this.#log('error', `Error en búsqueda con fallback de idioma para ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Busca magnets específicamente en inglés y los guarda en english.csv.
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @param {number} season - Temporada (para series)
   * @param {number} episode - Episodio (para series)
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async searchMagnetsInEnglish(contentId, type = 'auto', season = null, episode = null) {
    this.#log('info', `Iniciando búsqueda en inglés para ${contentId}`, { type, season, episode });
    
    try {
      // Detectar tipo de contenido si es 'auto'
      const detectedType = type === 'auto' ? this.#detectContentType(contentId, season, episode) : type;
      
      // Obtener configuraciones de idioma para el tipo de contenido
      const typeConfig = addonConfig.torrentio[detectedType];
      if (!typeConfig || !typeConfig.languageConfigs) {
        this.#log('warn', `No hay configuraciones de idioma para tipo: ${detectedType}`);
        return this.searchMagnetsById(contentId, detectedType, season, episode);
      }
      
      // Buscar solo en trackers en inglés
      this.#log('info', `Búsqueda en trackers ingleses para ${contentId}`);
      const englishResults = await this.#searchWithLanguageConfig(
        contentId, 
        detectedType, 
        typeConfig.languageConfigs.combined, // Usar configuración combinada que incluye trackers ingleses
        season, 
        episode
      );
      
      if (englishResults && englishResults.length > 0) {
        const resultsWithSeeds = this.#filterResultsWithSeeds(englishResults);
        if (resultsWithSeeds.length > 0) {
          this.#log('info', `Encontrados ${resultsWithSeeds.length} resultados con seeds en trackers ingleses`);
          await this.#saveMagnetsToFile(resultsWithSeeds, 'english');
          return resultsWithSeeds;
        } else {
          this.#log('warn', `Encontrados ${englishResults.length} resultados en inglés pero sin seeds disponibles`);
        }
      }
      
      this.#log('warn', `No se encontraron resultados en inglés para ${contentId}`);
      return [];
      
    } catch (error) {
      this.#log('error', `Error en búsqueda en inglés para ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Filtra resultados que tienen seeds disponibles
   * @private
   * @param {Array} results - Array de magnets
   * @returns {Array} Array de magnets con seeds > 0
   */
  #filterResultsWithSeeds(results) {
    if (!results || !Array.isArray(results)) {
      return [];
    }
    
    return results.filter(magnet => {
      const seeders = parseInt(magnet.seeders) || 0;
      return seeders > 0;
    });
  }

  /**
   * Realiza búsqueda con una configuración de idioma específica usando patrón Command
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @param {Object} languageConfig - Configuración de idioma (providers, priorityLanguage)
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {Promise<Array>} Array de magnets
   */
  async #searchWithLanguageConfig(contentId, type, languageConfig, season = null, episode = null) {
    // Crear comando para cambio temporal de configuración
    const command = ConfigurationCommandFactory.createLanguageCommand(
      this,
      type,
      languageConfig,
      this.#logger
    );

    try {
      // Ejecutar comando (aplicar configuración temporal)
      if (!this.#configInvoker.executeCommand(command)) {
        throw new Error('No se pudo aplicar la configuración temporal');
      }

      this.#log('debug', `Usando configuración temporal:`, {
        type,
        providers: languageConfig.providers,
        priorityLanguage: languageConfig.priorityLanguage
      });

      // Realizar búsqueda
      const results = await this.searchMagnetsById(contentId, type, season, episode);

      return results;

    } catch (error) {
      this.#log('error', `Error en búsqueda con configuración de idioma:`, error);
      throw error;
    } finally {
      // Siempre restaurar configuración original
      this.#configInvoker.undoLastCommand();
    }
  }

  /**
   * Convierte streams de Torrentio a objetos Magnet.
   * @private
   * @param {Array} streams - Streams de la respuesta de Torrentio
   * @param {string} contentId - ID del contenido (IMDb, TMDB, TVDB, Kitsu, etc.)
   * @param {string} type - Tipo de contenido
   * @param {number} season - Temporada (para series/anime)
   * @param {number} episode - Episodio (para series/anime)
   * @returns {Magnet[]} Array de magnets
   */
  #parseStreamsToMagnets(streams, contentId, type, season = null, episode = null) {
    const candidates = [];
    
    for (const stream of streams) {
      try {
        if (!stream.infoHash) {
          this.#logger.debug(`Stream sin infoHash ignorado para ${contentId}:`, stream);
          continue;
        }
        
        // Extraer información del stream según formato real de Torrentio
        const streamName = stream.name || `Torrent ${stream.infoHash}`;
        const streamTitle = stream.title || '';
        
        // Combinar name y title para obtener información completa
        const fullName = this.#buildFullStreamName(streamName, streamTitle);
        const quality = this.#extractQualityFromStream(stream, streamName, streamTitle);
        const size = this.#extractSizeFromStream(stream, streamTitle);
        const filename = this.#extractFilename(stream);
        const seedersInfo = this.#extractSeedersAndPeers(streamTitle);
        
        // Filtrar por tamaño: solo menores a 9GB
        const sizeInGB = this.#convertSizeToGB(size);
        if (sizeInGB >= 9) {
          this.#log('debug', `Stream descartado por tamaño (${size}): ${fullName}`);
          continue;
        }
        
        // Construir magnet URI con información adicional
        const magnetUri = this.#buildMagnetUri(stream.infoHash, filename || fullName, stream.sources);
        
        // Usar información de episodio proporcionada o extraída
        const episodeInfo = season !== null && episode !== null 
          ? { season, episode }
          : this.#extractEpisodeInfo(streamTitle, type);
        
        // Procesamiento inteligente de content_id específico por tipo
        const contentIdInfo = this.#intelligentContentIdProcessing(contentId);
        
        // Usar información procesada inteligentemente
        const finalContentId = contentIdInfo.finalContentId;
        const idType = contentIdInfo.idType;
        const imdbId = contentIdInfo.imdbId;
        
        const magnetData = {
          content_id: finalContentId,
          name: fullName,
          magnet: magnetUri,
          quality: quality || 'unknown',
          size: size || 'unknown',
          source: 'torrentio-api',
          // Campos opcionales para compatibilidad
          imdb_id: imdbId,
          id_type: idType,
          // Información adicional de Torrentio
          fileIdx: stream.fileIdx,
          provider: this.#extractProvider(streamTitle),
          seeders: seedersInfo.seeders,
          peers: seedersInfo.peers,
          ...episodeInfo
        };
        
        // Solo agregar filename si existe (evitar null)
        if (filename) {
          magnetData.filename = filename;
        }
        
        const magnet = new Magnet(magnetData);
        candidates.push(magnet);
        
      } catch (error) {
        this.#log('error', `Error al procesar stream de Torrentio para ${contentId}:`, { error, stream });
      }
    }
    
    // Priorizar y devolver solo el mejor resultado
    return this.#selectBestMagnet(candidates);
  }

  /**
   * Convierte el tamaño a GB para comparación.
   * @private
   * @param {string} size - Tamaño en formato string (ej: "2.5 GB", "1500 MB")
   * @returns {number} Tamaño en GB
   */
  #convertSizeToGB(size) {
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
        return value * 1024;
      case 'gb':
        return value;
      case 'mb':
        return value / 1024;
      case 'kb':
        return value / (1024 * 1024);
      default:
        return 0;
    }
  }

  /**
   * Selecciona el mejor magnet basado en la estrategia configurada.
   * @private
   * @param {Magnet[]} candidates - Candidatos a evaluar
   * @returns {Magnet[]} Array con solo el mejor magnet o vacío
   */
  #selectBestMagnet(candidates) {
    if (candidates.length === 0) {
      return [];
    }
    
    const config = addonConfig.magnetSelection;
    
    // Filtrar magnets que cumplan el mínimo de seeders
    const validCandidates = candidates.filter(magnet => 
      (magnet.seeders || 0) >= config.minSeeders
    );
    
    if (validCandidates.length === 0) {
      this.#log('warn', `Ningún magnet cumple el mínimo de ${config.minSeeders} seeders`);
      return [];
    }
    
    let sortedCandidates;
    
    switch (config.strategy) {
      case 'quality':
        sortedCandidates = this.#sortByQuality(validCandidates, config);
        break;
      case 'balanced':
        sortedCandidates = this.#sortByBalanced(validCandidates, config);
        break;
      case 'seeders':
      default:
        sortedCandidates = this.#sortBySeeders(validCandidates);
        break;
    }
    
    const bestCandidate = sortedCandidates[0];
    
    if (config.enableSelectionLogging) {
      this.#log('info', `Mejor magnet seleccionado (estrategia: ${config.strategy}): ${bestCandidate.name} (${bestCandidate.quality}, ${bestCandidate.seeders || 0} seeders)`);
    }
    
    return [bestCandidate];
  }

  /**
   * Ordena magnets únicamente por número de seeders (descendente).
   * @private
   * @param {Magnet[]} magnets - Magnets a ordenar
   * @returns {Magnet[]} Magnets ordenados por seeders
   */
  #sortBySeeders(magnets) {
    return magnets.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  }

  /**
   * Ordena magnets priorizando calidad sobre seeders.
   * @private
   * @param {Magnet[]} magnets - Magnets a ordenar
   * @param {Object} config - Configuración de selección
   * @returns {Magnet[]} Magnets ordenados por calidad y seeders
   */
  #sortByQuality(magnets, config) {
    const qualityOrder = config.qualityPriority;
    
    return magnets.sort((a, b) => {
      const aQualityIndex = qualityOrder.indexOf(a.quality) !== -1 ? qualityOrder.indexOf(a.quality) : qualityOrder.length;
      const bQualityIndex = qualityOrder.indexOf(b.quality) !== -1 ? qualityOrder.indexOf(b.quality) : qualityOrder.length;
      
      // Priorizar por calidad
      if (aQualityIndex !== bQualityIndex) {
        return aQualityIndex - bQualityIndex;
      }
      
      // En caso de empate en calidad, priorizar por seeders
      return (b.seeders || 0) - (a.seeders || 0);
    });
  }

  /**
   * Ordena magnets con estrategia balanceada (calidad y seeders).
   * @private
   * @param {Magnet[]} magnets - Magnets a ordenar
   * @param {Object} config - Configuración de selección
   * @returns {Magnet[]} Magnets ordenados de forma balanceada
   */
  #sortByBalanced(magnets, config) {
    const qualityOrder = config.qualityPriority;
    const qualityWeight = config.balancedWeights.quality;
    const seedersWeight = config.balancedWeights.seeders;
    
    // Calcular score balanceado para cada magnet
    const magnetsWithScore = magnets.map(magnet => {
      const qualityIndex = qualityOrder.indexOf(magnet.quality);
      const qualityScore = qualityIndex !== -1 ? (qualityOrder.length - qualityIndex) : 0;
      const seedersScore = magnet.seeders || 0;
      
      const totalScore = (qualityScore * qualityWeight) + (seedersScore * seedersWeight);
      
      return { magnet, score: totalScore };
    });
    
    // Ordenar por score descendente
    return magnetsWithScore
      .sort((a, b) => b.score - a.score)
      .map(item => item.magnet);
  }

  /**
   * Construye el nombre completo del stream combinando name y title.
   * @private
   * @param {string} streamName - Nombre del stream
   * @param {string} streamTitle - Título del stream
   * @returns {string} Nombre completo
   */
  #buildFullStreamName(streamName, streamTitle) {
    if (!streamTitle) return streamName;
    
    const titleLines = streamTitle.split('\n');
    const firstLine = titleLines[0] || '';
    
    // Lista de nombres genéricos que no son útiles
    const genericNames = [
      'emule descargas',
      'torrent download',
      'download',
      'descargas',
      'torrentio'
    ];
    
    // Si la primera línea es genérica, buscar el nombre real en las siguientes líneas
    if (genericNames.some(generic => firstLine.toLowerCase().includes(generic.toLowerCase()))) {
      // Buscar líneas que contengan nombres de archivo (con extensiones)
      for (let i = 1; i < titleLines.length; i++) {
        const line = titleLines[i].trim();
        // Buscar líneas que parezcan nombres de archivo
        if (line && (line.includes('.mkv') || line.includes('.mp4') || line.includes('.avi') || 
                    line.length > 20 && !line.includes('💾') && !line.includes('👤'))) {
          return line;
        }
      }
      
      // Si no encontramos un nombre de archivo, usar el streamName
      return streamName;
    }
    
    // Si la primera línea no es genérica, usarla
    return firstLine || streamName;
  }

  /**
   * Extrae la calidad del stream usando múltiples fuentes.
   * Incluye patrones específicos para contenido de anime.
   * @private
   * @param {Object} stream - Objeto stream completo
   * @param {string} streamName - Nombre del stream
   * @param {string} streamTitle - Título del stream
   * @returns {string} Calidad extraída
   */
  #extractQualityFromStream(stream, streamName, streamTitle) {
    const textToAnalyze = `${streamName} ${streamTitle}`;
    
    const qualityPatterns = [
      { pattern: /\b(4K|2160p)\b/i, quality: '4K' },
      { pattern: /\b(1080p|1080P|FHD)\b/i, quality: '1080p' },
      { pattern: /\b(720p|720P|HD)\b/i, quality: '720p' },
      { pattern: /\b(480p|480P)\b/i, quality: '480p' },
      { pattern: /\b(DVDRip|DVDRIP)\b/i, quality: 'DVDRip' },
      { pattern: /\b(BDRip|BDRIP)\b/i, quality: 'BDRip' },
      { pattern: /\b(WEBRip|WEBRIP)\b/i, quality: 'WEBRip' },
      { pattern: /\b(CAM|cam)\b/i, quality: 'CAM' },
      { pattern: /\b(TS|ts)\b/i, quality: 'TS' },
      // Patrones específicos de anime
      { pattern: /\b(BD|Blu-?ray)\b/i, quality: 'BluRay' },
      { pattern: /\bWEB-?DL\b/i, quality: 'WEB-DL' },
      { pattern: /\bATVP\b/i, quality: 'ATVP' },
      { pattern: /\bCR\b/i, quality: 'CR' }, // Crunchyroll
      { pattern: /\bFUNi\b/i, quality: 'FUNi' } // Funimation
    ];
    
    for (const { pattern, quality } of qualityPatterns) {
      if (pattern.test(textToAnalyze)) {
        return quality;
      }
    }
    
    return 'SD';
  }

  /**
   * Extrae el tamaño del stream desde el title.
   * @private
   * @param {Object} stream - Objeto stream completo
   * @param {string} streamTitle - Título del stream
   * @returns {string} Tamaño extraído o 'N/A'
   */
  #extractSizeFromStream(stream, streamTitle) {
    if (!streamTitle) return 'N/A';
    
    // Buscar patrón de tamaño en el formato de Torrentio: 💾 2.32 GB
    const sizePatterns = [
      /💾\s*(\d+(?:\.\d+)?\s*(?:GB|MB|TB|KB))/i,
      /\b(\d+(?:\.\d+)?\s*(?:GB|MB|TB|KB))\b/i
    ];
    
    for (const pattern of sizePatterns) {
      const match = streamTitle.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return 'N/A';
  }

  /**
   * Extrae información de seeders y peers desde el título del stream.
   * @private
   * @param {string} streamTitle - Título del stream
   * @returns {Object} Objeto con seeders y peers
   */
  #extractSeedersAndPeers(streamTitle) {
    const result = { seeders: 0, peers: 0 };
    
    if (!streamTitle) return result;
    
    // Buscar patrón de seeders en el formato de Torrentio: 👤 21
    const seedersMatch = streamTitle.match(/👤\s*(\d+)/i);
    if (seedersMatch) {
      result.seeders = parseInt(seedersMatch[1], 10);
    }
    
    // Para peers, Torrentio no los muestra directamente, pero podemos estimarlos
    // basándose en patrones comunes o usar seeders como aproximación
    result.peers = result.seeders > 0 ? Math.floor(result.seeders * CONSTANTS.CONVERSION.PEERS_TO_SEEDERS_RATIO) : 0;
    
    return result;
  }

  /**
   * Extrae el nombre del archivo desde behaviorHints.
   * Incluye manejo específico para episodios de anime y series
   * @private
   * @param {Object} stream - Objeto stream
   * @returns {string|null} Nombre del archivo o null
   */
  #extractFilename(stream) {
    const filename = stream.behaviorHints?.filename;
    if (filename) {
      // Limpiar información de calidad y formato para episodios
      return filename
        .replace(/\s*\[(HS|TT|CR|FUNi)\]\s*/gi, '') // Remover tags de grupos de anime
        .replace(/\s*\b(BD|Blu-?ray|WEB-?DL)\b\s*/gi, '') // Remover formato específico de anime
        .trim();
    }
    return null;
  }

  /**
   * Extrae el proveedor del stream desde el title.
   * Incluye detección mejorada para proveedores de anime.
   * @private
   * @param {string} streamTitle - Título del stream
   * @returns {string} Proveedor extraído
   */
  #extractProvider(streamTitle) {
    if (!streamTitle) return 'unknown';
    
    // Buscar patrón de proveedor: ⚙️ Cinecalidad
    const providerMatch = streamTitle.match(/⚙️\s*([^\n]+)/i);
    if (providerMatch) {
      return providerMatch[1].trim();
    }
    
    // Proveedores específicos con patrones mejorados
    const providerPatterns = {
      // Proveedores en español
      'cinecalidad': /\b(cinecalidad|cine\s*calidad)\b/i,
      'mejortorrent': /\b(mejortorrent|mejor\s*torrent)\b/i,
      'wolfmax4k': /\b(wolfmax4k|wolf\s*max)\b/i,
      // Proveedores de anime con patrones específicos
      'nyaasi': /\b(nyaa\.si|nyaasi|nyaa)\b/i,
      'horriblesubs': /\b(horriblesubs|horrible\s*subs|\[HS\])\b/i,
      'TokyoTosho': /\b(tokyotosho|tokyo\s*tosho|\[TT\])\b/i,
      'AniDex': /\b(anidex|ani\s*dex)\b/i
    };
    
    // Buscar usando patrones específicos
    for (const [provider, pattern] of Object.entries(providerPatterns)) {
      if (pattern.test(streamTitle)) {
        return provider;
      }
    }
    
    // Fallback: búsqueda simple por nombre
    const knownProviders = ['cinecalidad', 'mejortorrent', 'wolfmax4k', 'nyaasi', 'horriblesubs', 'TokyoTosho', 'AniDex'];
    for (const provider of knownProviders) {
      if (streamTitle.toLowerCase().includes(provider.toLowerCase())) {
        return provider;
      }
    }
    
    return 'torrentio';
  }

  /**
   * Construye un magnet URI a partir del infoHash y metadatos.
   * @private
   * @param {string} infoHash - Hash del torrent
   * @param {string} name - Nombre del torrent
   * @param {Array} sources - Fuentes/trackers
   * @returns {string} Magnet URI
   */
  #buildMagnetUri(infoHash, name, sources = []) {
    // Validar infoHash
    if (!infoHash || typeof infoHash !== 'string') {
      throw new Error('infoHash inválido para construir magnet URI');
    }
    
    // Limpiar y validar el nombre
    const cleanName = this.#cleanMagnetName(name);
    let magnetUri = `magnet:?xt=urn:btih:${infoHash.toLowerCase()}&dn=${encodeURIComponent(cleanName)}`;
    
    // Agregar trackers predeterminados para mejorar conectividad
    const defaultTrackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://9.rarbg.to:2710/announce',
      'udp://exodus.desync.com:6969/announce'
    ];
    
    // Agregar trackers de sources si están disponibles
    if (sources && Array.isArray(sources)) {
      for (const source of sources) {
        if (typeof source === 'string') {
          if (source.startsWith('tracker:')) {
            const tracker = source.replace('tracker:', '');
            magnetUri += `&tr=${encodeURIComponent(tracker)}`;
          } else if (source.startsWith('http') || source.startsWith('udp')) {
            magnetUri += `&tr=${encodeURIComponent(source)}`;
          }
        }
      }
    }
    
    // Agregar trackers predeterminados
    for (const tracker of defaultTrackers) {
      magnetUri += `&tr=${encodeURIComponent(tracker)}`;
    }
    
    return magnetUri;
  }

  /**
   * Extrae información de episodio para series y anime.
   * @private
   * @param {string} streamTitle - Título del stream
   * @param {string} contentType - Tipo de contenido
   * @returns {Object} Información de episodio
   */
  #extractEpisodeInfo(streamTitle, contentType) {
    if (contentType !== 'series' && contentType !== 'anime') {
      return {};
    }
    
    const episodeInfo = {};
    
    // Patrones para extraer temporada y episodio
    const seasonEpisodePatterns = [
      /S(\d+)E(\d+)/i,
      /Season\s*(\d+)\s*Episode\s*(\d+)/i,
      /T(\d+)\s*E(\d+)/i, // Formato español
      /\b(\d+)x(\d+)\b/i
    ];
    
    for (const pattern of seasonEpisodePatterns) {
      const match = streamTitle.match(pattern);
      if (match) {
        episodeInfo.season = parseInt(match[1]);
        episodeInfo.episode = parseInt(match[2]);
        break;
      }
    }
    
    // Para anime, también buscar patrones específicos
    if (contentType === 'anime') {
      const animeEpisodePattern = /\s+(\d+)\s*$/;
      const match = streamTitle.match(animeEpisodePattern);
      if (match && !episodeInfo.episode) {
        episodeInfo.episode = parseInt(match[1]);
      }
    }
    
    return episodeInfo;
  }

  /**
   * Limpia el nombre para uso en magnet URI.
   * @private
   * @param {string} name - Nombre a limpiar
   * @returns {string} Nombre limpio
   */
  #cleanMagnetName(name) {
    if (!name || typeof name !== 'string') {
      return 'Unknown';
    }
    
    // Remover caracteres problemáticos y emojis
    return name
      .replace(/[👤💾⚙️🇲🇽]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Guarda magnets en el archivo torrentio.csv.
   * @private
   * @param {Magnet[]} magnets - Magnets a guardar
   */
  async #saveMagnetsToFile(magnets, language = 'spanish') {
    // Determinar archivo de destino según el idioma
    const targetFilePath = language === 'english' ? this.#englishFilePath : this.#torrentioFilePath;
    const fileName = language === 'english' ? 'english.csv' : 'torrentio.csv';
    
    // Si no hay ruta de archivo especificada, omitir el guardado
    if (!targetFilePath || targetFilePath.trim() === '') {
      this.#logger.debug(`No se especificó ruta para archivo ${fileName}, omitiendo guardado`);
      return;
    }
    
    try {
      // Verificar permisos de escritura antes de intentar escribir
      const fileDir = dirname(targetFilePath);
      if (!existsSync(fileDir)) {
        this.#logger.warn(`Directorio ${fileDir} no existe, creando...`);
        mkdirSync(fileDir, { recursive: true });
      }
      
      // Leer archivo existente para evitar duplicados
      const existingMagnets = new Set();
      if (existsSync(targetFilePath)) {
        const existingContent = readFileSync(targetFilePath, 'utf8');
        const lines = existingContent.split('\n').slice(1); // Omitir header
        for (const line of lines) {
          if (line.trim()) {
            const fields = line.split(',');
            if (fields.length >= 3) {
              // Usar content_id + magnet como clave única
              const key = `${fields[0]}|${fields[2]}`;
              existingMagnets.add(key);
            }
          }
        }
      }
      
      // Filtrar magnets duplicados antes de guardar
      const newMagnets = magnets.filter(magnet => {
        const key = `${magnet.content_id}|${magnet.magnet}`;
        return !existingMagnets.has(key);
      });
      
      if (newMagnets.length === 0) {
        this.#logger.debug(`Todos los magnets ya existen en ${fileName}, omitiendo guardado`);
        return;
      }
      
      for (const magnet of newMagnets) {
        const csvLine = this.#magnetToCsvLine(magnet);
        appendFileSync(targetFilePath, csvLine + '\n', 'utf8');
      }
      
      this.#logger.info(`Guardados ${newMagnets.length} magnets nuevos en ${fileName} (${magnets.length - newMagnets.length} duplicados omitidos)`);
    } catch (error) {
      // Crear objeto de error detallado para debugging
      const fileError = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        path: error.path || this.#torrentioFilePath,
        operation: 'saveMagnetsToFile',
        magnetCount: magnets.length,
        language: language,
        targetFile: fileName,
        timestamp: new Date().toISOString()
      };
      
      this.#log('error', `Error al guardar magnets en ${fileName}:`, fileError);
      
      // En caso de error de permisos, continuar sin interrumpir el flujo
      if (error.code === 'EACCES') {
        this.#logger.warn('Permisos insuficientes para escribir archivo CSV. Continuando sin guardar.');
      } else if (error.code === 'ENOENT') {
        this.#logger.warn('Archivo o directorio no encontrado. Continuando sin guardar.');
      } else {
        this.#logger.warn(`Error de sistema (${error.code}). Continuando sin guardar.`);
      }
    }
  }

  /**
   * Convierte un magnet a línea CSV.
   * @private
   * @param {Magnet} magnet - Magnet a convertir
   * @returns {string} Línea CSV
   */
  #magnetToCsvLine(magnet) {
    const escapeCsv = (value) => {
      if (!value) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    return [
      escapeCsv(magnet.content_id),
      escapeCsv(magnet.name),
      escapeCsv(magnet.magnet),
      escapeCsv(magnet.quality),
      escapeCsv(magnet.size),
      escapeCsv(magnet.source || 'torrentio-api'),
      escapeCsv(magnet.fileIdx || ''),
      escapeCsv(magnet.filename || ''),
      escapeCsv(magnet.provider || ''),
      escapeCsv(magnet.seeders || 0),
      escapeCsv(magnet.peers || 0),
      escapeCsv(magnet.season || ''),
      escapeCsv(magnet.episode || ''),
      escapeCsv(magnet.imdb_id || ''),
      escapeCsv(magnet.id_type || '')
    ].join(',');
  }

  /**
   * Detecta automáticamente el tipo de contenido basado en parámetros.
   * Incluye detección mejorada de anime usando múltiples heurísticas.
   * @private
   * @param {string} id - ID del contenido (IMDb, TMDB, TVDB, Kitsu, etc.)
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {string} Tipo detectado ('movie', 'series', 'anime')
   */
  /**
   * Detecta el tipo de contenido usando múltiples heurísticas avanzadas
   * @private
   * @param {string} id - ID del contenido
   * @param {number|null} season - Temporada
   * @param {number|null} episode - Episodio
   * @returns {string} Tipo de contenido: 'anime', 'series', 'movie'
   */
  #detectContentType(id, season, episode) {
    // 1. Detección basada en tipo de ID (más precisa)
    const idInfo = this.#processContentId(id);
    
    // IDs específicos de anime tienen prioridad
    if (['kitsu', 'anilist', 'mal'].includes(idInfo.idType)) {
      return 'anime';
    }
    
    // 2. Detección por indicadores en el ID
    if (this.#isKitsuDerivedContent(id)) {
      return 'anime';
    }
    
    // 3. Análisis de estructura episódica
    if (season !== null && episode !== null) {
      // Usar heurísticas mejoradas para detectar anime
      if (this.#isLikelyAnimeContent(id, season, episode)) {
        return 'anime';
      }
      
      return 'series';
    }
    
    // 4. Detección por temporada sin episodio (serie completa)
    if (season !== null && episode === null) {
      return 'series';
    }
    
    // Por defecto, asumir que es película
    return 'movie';
  }

  /**
   * Procesa cualquier tipo de ID (IMDb, TMDB, TVDB, Kitsu, AniList, MAL) y lo convierte al formato adecuado para Torrentio.
   * @private
   * @param {string} contentId - ID del contenido (puede ser cualquier tipo)
   * @returns {Object} Objeto con el ID procesado y el tipo detectado
   */
  /**
   * Mapa de patrones para detección eficiente de tipos de ID
   * @private
   * @static
   */
  static #ID_PATTERNS = {
    imdb: {
      pattern: /^tt\d+$/i,
      processor: (id) => id,
      preservePrefix: true
    },
    tmdb: {
      pattern: /^(?:tmdb:)?\d+$/i,
      processor: (id) => id.replace(/^tmdb:/i, ''),
      preservePrefix: false
    },
    tvdb: {
      pattern: /^(?:tvdb:)?\d+$/i,
      processor: (id) => id.replace(/^tvdb:/i, ''),
      preservePrefix: false
    },
    kitsu: {
      pattern: /^(?:kitsu:)?(?:\d+|[\w-]+)(?::\d+)?(?::\d+)?$/i,
      processor: (id) => id.startsWith('kitsu:') ? id : `kitsu:${id}`,
      preservePrefix: true
    },
    anilist: {
      pattern: /^(?:anilist:)?\d+$/i,
      processor: (id) => id.replace(/^anilist:/i, ''),
      preservePrefix: false
    },
    anilist_series: {
      pattern: /^(?:anilist:)?\d+:\d+:\d+$/i,
      processor: (id) => id.replace(/^anilist:/i, ''),
      preservePrefix: false
    },
    mal: {
      pattern: /^(?:mal:)?\d+$/i,
      processor: (id) => id.replace(/^mal:/i, ''),
      preservePrefix: false
    },
    mal_series: {
      pattern: /^(?:mal:)?\d+:\d+:\d+$/i,
      processor: (id) => id.replace(/^mal:/i, ''),
      preservePrefix: false
    },
    anidb: {
      pattern: /^(?:anidb:)?\d+$/i,
      processor: (id) => id.replace(/^anidb:/i, ''),
      preservePrefix: false
    },
    anidb_series: {
      pattern: /^(?:anidb:)?\d+:\d+:\d+$/i,
      processor: (id) => id.replace(/^anidb:/i, ''),
      preservePrefix: false
    }
  };

  /**
   * Procesamiento inteligente de content_id específico por tipo
   * Cada tipo de ID tiene su propia lógica de procesamiento y almacenamiento
   * @private
   * @param {string} contentId - ID completo del contenido
   * @returns {Object} Información procesada del content_id
   */
  #intelligentContentIdProcessing(contentId) {
    // Validación de entrada
    if (!contentId || typeof contentId !== 'string') {
      throw new Error('ID de contenido inválido');
    }

    const originalId = contentId.trim();
    
    // Detectar tipo de ID usando el ID completo
    const detectedType = this.#detectContentIdType(originalId);
    
    // Procesamiento específico por tipo
    switch (detectedType.type) {
      case 'imdb':
        return this.#processImdbId(originalId, detectedType);
      
      case 'kitsu':
        return this.#processKitsuId(originalId, detectedType);
      
      case 'tmdb':
        return this.#processTmdbId(originalId, detectedType);
      
      case 'tvdb':
        return this.#processTvdbId(originalId, detectedType);
      
      case 'anilist':
      case 'anilist_series':
        return this.#processAnilistId(originalId, detectedType);
      
      case 'mal':
      case 'mal_series':
        return this.#processMalId(originalId, detectedType);
      
      case 'anidb':
      case 'anidb_series':
        return this.#processAnidbId(originalId, detectedType);
      
      default:
        // Fallback para IDs no reconocidos - asumir IMDb
        return {
          finalContentId: originalId,
          idType: 'imdb',
          imdbId: originalId.startsWith('tt') ? originalId : undefined,
          isValid: false
        };
    }
  }

  /**
   * Detecta el tipo de content_id usando patrones específicos
   * @private
   * @param {string} contentId - ID del contenido
   * @returns {Object} Tipo detectado y información adicional
   */
  #detectContentIdType(contentId) {
    // Detectar usando patrones optimizados
    for (const [idType, config] of Object.entries(TorrentioApiService.#ID_PATTERNS)) {
      if (config.pattern.test(contentId)) {
        return {
          type: idType,
          config,
          isValid: true
        };
      }
    }
    
    return {
      type: 'unknown',
      config: null,
      isValid: false
    };
  }

  /**
   * Procesamiento específico para IDs de IMDb
   * Formato: tt1234567
   */
  #processImdbId(contentId, detectedType) {
    const cleanId = contentId.startsWith('tt') ? contentId : `tt${contentId}`;
    
    return {
      finalContentId: cleanId,
      idType: 'imdb',
      imdbId: cleanId,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de Kitsu
   * Formato: kitsu:6448:8 (ID:temporada:episodio)
   */
  #processKitsuId(contentId, detectedType) {
    // Kitsu mantiene formato completo con temporada/episodio
    const finalId = contentId.startsWith('kitsu:') ? contentId : `kitsu:${contentId}`;
    
    return {
      finalContentId: finalId,
      idType: 'kitsu',
      imdbId: undefined,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de TMDB
   * Formato: tmdb:12345 o 12345
   */
  #processTmdbId(contentId, detectedType) {
    const cleanId = contentId.replace(/^tmdb:/i, '');
    
    return {
      finalContentId: `tmdb:${cleanId}`,
      idType: 'tmdb',
      imdbId: undefined,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de TVDB
   * Formato: tvdb:12345 o 12345
   */
  #processTvdbId(contentId, detectedType) {
    const cleanId = contentId.replace(/^tvdb:/i, '');
    
    return {
      finalContentId: `tvdb:${cleanId}`,
      idType: 'tvdb',
      imdbId: undefined,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de AniList
   * Formato: anilist:21087:1:1 (series) o anilist:21087 (simple)
   */
  #processAnilistId(contentId, detectedType) {
    const cleanId = contentId.replace(/^anilist:/i, '');
    const finalType = detectedType.type === 'anilist_series' ? 'anilist' : 'anilist';
    
    return {
      finalContentId: `anilist:${cleanId}`,
      idType: finalType,
      imdbId: undefined,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de MyAnimeList
   * Formato: mal:11061:1:1 (series) o mal:11061 (simple)
   */
  #processMalId(contentId, detectedType) {
    const cleanId = contentId.replace(/^mal:/i, '');
    const finalType = detectedType.type === 'mal_series' ? 'mal' : 'mal';
    
    return {
      finalContentId: `mal:${cleanId}`,
      idType: finalType,
      imdbId: undefined,
      isValid: true
    };
  }

  /**
   * Procesamiento específico para IDs de AniDB
   * Formato: anidb:8074:1:1 (series) o anidb:8074 (simple)
   */
  #processAnidbId(contentId, detectedType) {
    const cleanId = contentId.replace(/^anidb:/i, '');
    const finalType = detectedType.type === 'anidb_series' ? 'anidb' : 'anidb';
    
    return {
      finalContentId: `anidb:${cleanId}`,
      idType: finalType,
      imdbId: undefined,
      isValid: true
    };
  }

  #processContentId(contentId) {
    // Método legacy mantenido para compatibilidad
    // Usar #intelligentContentIdProcessing para nueva funcionalidad
    return this.#intelligentContentIdProcessing(contentId);
  }

  /**
   * Verifica si el contenido proviene de Kitsu o tiene indicadores de anime.
   * @private
   * @param {string} id - ID del contenido
   * @returns {boolean} True si es contenido derivado de Kitsu
   */
  /**
   * Verifica si el contenido proviene de Kitsu o tiene indicadores de anime
   * @private
   * @param {string} id - ID del contenido
   * @returns {boolean} True si es contenido derivado de Kitsu/anime
   */
  #isKitsuDerivedContent(id) {
    if (!id) return false;
    
    const lowerCaseId = id.toLowerCase();
    
    // Indicadores directos de anime
    const animeIndicators = [
      'kitsu', 'anime', 'anilist', 'mal', 'myanimelist',
      'crunchyroll', 'funimation', 'animeflv'
    ];
    
    return animeIndicators.some(indicator => lowerCaseId.includes(indicator));
  }

  /**
   * Aplica heurísticas avanzadas para detectar contenido anime
   * @private
   * @param {string} id - ID del contenido
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {boolean} True si probablemente es anime
   */
  #isLikelyAnimeContent(id, season, episode) {
    // Heurísticas mejoradas para detectar anime:
    
    // 1. Episodios muy altos (típico de anime de larga duración)
    if (episode > 50) {
      return true;
    }
    
    // 2. Patrones estándar de anime (12, 13, 24, 25, 26 episodios)
    const standardAnimeLengths = [12, 13, 24, 25, 26];
    if (standardAnimeLengths.includes(episode)) {
      return true;
    }
    
    // 3. Temporadas cortas con episodios en rango anime
    if (season <= 5 && episode >= 10 && episode <= 30) {
      return true;
    }
    
    // 4. Patrones específicos de anime estacional
    if (season === 1 && (episode === 12 || episode === 13)) {
      return true;
    }
    
    // 5. Series con muchas temporadas cortas (típico de anime)
    if (season > 3 && episode <= 26) {
      return true;
    }
    
    return false;
  }

  /**
   * Inicializa las configuraciones de proveedores para diferentes tipos de contenido.
   * Utiliza configuración desde variables de entorno para mayor flexibilidad.
   * @private
   * @returns {Object} Configuraciones de proveedores
   */
  #initializeProviderConfigs() {
    return {
      movie: {
        providers: addonConfig.torrentio.movie.providers,
        sort: addonConfig.torrentio.movie.sort,
        qualityFilter: addonConfig.torrentio.movie.qualityFilter,
        limit: addonConfig.torrentio.movie.limit,
        priorityLanguage: addonConfig.torrentio.movie.priorityLanguage
      },
      series: {
        providers: addonConfig.torrentio.series.providers,
        sort: addonConfig.torrentio.series.sort,
        qualityFilter: addonConfig.torrentio.series.qualityFilter,
        limit: addonConfig.torrentio.series.limit,
        priorityLanguage: addonConfig.torrentio.series.priorityLanguage
      },
      anime: {
        providers: addonConfig.torrentio.anime.providers,
        sort: addonConfig.torrentio.anime.sort,
        qualityFilter: addonConfig.torrentio.anime.qualityFilter,
        limit: addonConfig.torrentio.anime.limit,
        priorityLanguage: addonConfig.torrentio.anime.priorityLanguage
      }
    };
  }

  /**
   * Obtiene la URL base optimizada según el tipo de contenido.
   * @private
   * @param {string} type - Tipo de contenido
   * @returns {string} URL base optimizada
   */
  #getOptimizedBaseUrl(type) {
    const config = this.#providerConfigs[type] || this.#providerConfigs.movie;
    
    // Extraer solo la URL base sin parámetros
    const cleanBaseUrl = this.#baseUrl.replace(/\/$/, "").split('/providers=')[0];
    
    // Construir parámetros en formato Torrentio (separados por |)
    const params = [
      `providers=${config.providers}`,
      `sort=${config.sort}`,
      `qualityfilter=${config.qualityFilter}`,
      `limit=${config.limit}`
    ];
    
    // Agregar idioma prioritario si está configurado
    if (config.priorityLanguage) {
      params.push(`lang=${config.priorityLanguage}`);
    }
    
    return `${cleanBaseUrl}/${params.join('|')}`;
  }

  /**
   * Configura el idioma prioritario para todos los tipos de contenido.
   * @param {string} language - Código de idioma (spanish, latino, english, etc.)
   * @public
   */
  setPriorityLanguage(language) {
    const validLanguages = ['spanish', 'latino', 'english', 'french', 'portuguese', 'russian', 'japanese', 'korean', 'chinese', 'german', 'italian', 'dutch'];
    
    if (!validLanguages.includes(language.toLowerCase())) {
      this.#logger.warn(`Idioma no válido: ${language}. Idiomas soportados: ${validLanguages.join(', ')}`);
      return;
    }
    
    // Actualizar configuración para todos los tipos de contenido
    Object.keys(this.#providerConfigs).forEach(type => {
      this.#providerConfigs[type].priorityLanguage = language.toLowerCase();
    });
    
    this.#logger.info(`Idioma prioritario configurado a: ${language}`);
  }

  /**
   * Obtiene la configuración de proveedores para un tipo específico
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @returns {Object} Configuración de proveedores
   * @public
   */
  getProviderConfig(type) {
    return this.#providerConfigs[type] || null;
  }

  /**
   * Establece la configuración de proveedores para un tipo específico
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @param {Object} config - Nueva configuración
   * @public
   */
  setProviderConfig(type, config) {
    if (!this.#providerConfigs[type]) {
      this.#logger.warn(`Tipo de contenido no válido: ${type}`);
      return;
    }
    
    this.#providerConfigs[type] = {
      ...this.#providerConfigs[type],
      ...config
    };
  }

  /**
   * Obtiene el idioma prioritario actual.
   * @returns {string|null} Idioma prioritario configurado
   * @public
   */
  getPriorityLanguage() {
    return this.#providerConfigs.movie?.priorityLanguage || null;
  }

  /**
   * Asegura que el archivo torrentio.csv existe con headers.
   * @private
   */
  #ensureTorrentioFileExists() {
    // Si no hay ruta de archivo especificada, omitir la creación del archivo
    if (!this.#torrentioFilePath || this.#torrentioFilePath.trim() === '') {
      this.#logger.debug('No se especificó ruta para archivo torrentio.csv, omitiendo creación');
      return;
    }
    
    if (!existsSync(this.#torrentioFilePath)) {
      // Asegurar que el directorio padre existe
      const dir = dirname(this.#torrentioFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.#logger.info(`Directorio creado: ${dir}`);
      }
      
      const headers = CONSTANTS.FILE.CSV_HEADERS;
      writeFileSync(this.#torrentioFilePath, headers, 'utf8');
      this.#logger.info(`Archivo torrentio.csv creado en: ${this.#torrentioFilePath}`);
    }
  }

  /**
   * Obtiene el manifest de Torrentio con cache.
   * @private
   * @param {string} baseUrl - URL base con configuración de proveedores
   * @returns {Promise<Object>} - Manifest de Torrentio
   */
  async #getCachedManifest(baseUrl) {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const cacheKey = baseUrl;
    
    // Verificar cache
    const cached = this.#manifestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.#manifestCacheExpiry) {
      this.#logger.debug('Usando manifest desde cache');
      return cached.data;
    }
    
    // Obtener manifest fresco
    this.#logger.debug('Obteniendo manifest fresco desde API');
    const response = await this.#fetchWithTimeout(manifestUrl);
    
    if (!response.ok) {
      throw new Error(`Error al obtener manifest: ${response.status} ${response.statusText}`);
    }
    
    const manifest = await response.json();
    
    // Guardar en cache
    this.#manifestCache.set(cacheKey, {
      data: manifest,
      timestamp: Date.now()
    });
    
    // Limpiar cache expirado
    this.#cleanExpiredCache();
    
    return manifest;
  }

  /**
   * Limpia entradas expiradas del cache.
   * @private
   */
  #cleanExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.#manifestCache.entries()) {
      if ((now - value.timestamp) >= this.#manifestCacheExpiry) {
        this.#manifestCache.delete(key);
      }
    }
  }

  /**
   * Realiza una petición HTTP con timeout configurable.
   * @private
   * @param {string} url - URL a consultar
   * @returns {Promise<Response>} - Respuesta HTTP
   */
  /**
   * Realiza petición HTTP con Tor y sistema de reintentos
   * @private
   * @param {string} url - URL a consultar
   * @param {number} attempt - Intento actual (para recursión)
   * @returns {Promise<Object>} Respuesta HTTP simulada compatible con fetch
   */
  async #fetchWithTor(url, attempt = 1) {
    if (!this.#torEnabled) {
      // Fallback a fetch normal si Tor está deshabilitado
      return this.#fetchWithTimeout(url);
    }

    // Verificar si Tor está disponible antes del primer intento
    if (attempt === 1) {
      const torAvailable = await this.#checkTorAvailability();
      if (!torAvailable) {
        this.#log('warn', 'Tor no está disponible, usando fallback sin proxy');
        return this.#fetchWithTimeout(url);
      }
    }

    try {
      this.#log('info', `Intento ${attempt}/${this.#maxRetries} - Consultando vía Tor: ${url}`);
      
      const agent = new SocksProxyAgent(`socks5h://${this.#torHost}:${this.#torPort}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

      const response = await fetch(url, {
        agent: agent,
        signal: controller.signal,
        headers: {
          'User-Agent': CONSTANTS.NETWORK.FIREFOX_USER_AGENT,
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.#log('info', `Respuesta exitosa vía Tor (${response.status}) en intento ${attempt}`);
        return response;
      }

      if (response.status === 502 && attempt < this.#maxRetries) {
        this.#log('warn', `Error 502 detectado, rotando sesión Tor e intentando nuevamente (${attempt}/${this.#maxRetries})`);
        await this.#rotateTorSession();
        await this.#delay(this.#retryDelay);
        return this.#fetchWithTor(url, attempt + 1);
      }

      this.#log('warn', `Respuesta no exitosa vía Tor: ${response.status} en intento ${attempt}`);
      return response;

    } catch (error) {
      if (error.name === 'AbortError') {
        error = new Error(`Timeout de ${this.#timeout}ms excedido para: ${url}`);
      }

      if (error.code === 'ECONNREFUSED') {
        this.#log('warn', `Tor no está ejecutándose en ${this.#torHost}:${this.#torPort}, usando fallback sin proxy`);
        return this.#fetchWithTimeout(url);
      }
      
      if (attempt < this.#maxRetries && (error.code === 'ETIMEDOUT' || error.message.includes('Timeout'))) {
        this.#log('warn', `Error de conexión, rotando sesión Tor e intentando nuevamente (${attempt}/${this.#maxRetries}): ${error.message}`);
        await this.#rotateTorSession();
        await this.#delay(this.#retryDelay);
        return this.#fetchWithTor(url, attempt + 1);
      }

      this.#log('error', `Error en petición Tor después de ${attempt} intentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica si Tor está disponible y ejecutándose
   * @private
   * @returns {Promise<boolean>} - true si Tor está disponible
   */
  async #checkTorAvailability() {
    return new Promise((resolve) => {
      this.#log('debug', `Verificando disponibilidad de Tor en ${this.#torHost}:${this.#torPort}`);
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        this.#log('warn', 'Timeout al verificar Tor - considerando no disponible');
        socket.destroy();
        resolve(false);
      }, CONSTANTS.NETWORK.TOR_CHECK_TIMEOUT); // 3 segundos de timeout
      
      socket.connect(this.#torPort, this.#torHost, () => {
        this.#log('info', 'Tor detectado y disponible');
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        this.#log('warn', `Error al conectar con Tor: ${err.message}`);
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Inicia la rotación automática de circuitos Tor cada 5 minutos
   * @private
   */
  #startTorRotation() {
    if (!this.#torEnabled) {
      this.#log('debug', 'Tor no está habilitado, omitiendo rotación automática');
      return;
    }

    // Rotar circuitos cada 5 minutos (300000 ms)
    this.#torRotationInterval = setInterval(async () => {
      try {
        await this.#rotateTorSession();
        this.#log('info', 'Rotación automática de circuitos Tor completada');
      } catch (error) {
        this.#log('error', 'Error en rotación automática de Tor:', error);
      }
    }, 300000);

    this.#log('info', 'Rotación automática de circuitos Tor iniciada (cada 5 minutos)');
  }

  /**
   * Detiene la rotación automática de circuitos Tor
   * @private
   */
  #stopTorRotation() {
    if (this.#torRotationInterval) {
      clearInterval(this.#torRotationInterval);
      this.#torRotationInterval = null;
      this.#log('info', 'Rotación automática de circuitos Tor detenida');
    }
  }

  /**
   * Rota la sesión de Tor para obtener nueva IP
   * @private
   */
  async #rotateTorSession() {
    // Validar configuración de control de Tor
    if (!this.#torControlPort || !this.#torControlHost) {
      this.#log('warn', 'Control de Tor no configurado correctamente - saltando rotación');
      return;
    }

    return new Promise((resolve) => {
      const socket = net.createConnection({ port: this.#torControlPort, host: this.#torControlHost }, () => {
        socket.write('AUTHENTICATE ""\r\n');
        socket.write('SIGNAL NEWNYM\r\n');
        socket.write('QUIT\r\n');
      });

      socket.on('data', (data) => {
        const response = data.toString();
        if (response.includes('250 OK')) {
          this.#log('info', 'Sesión Tor rotada exitosamente - nueva IP obtenida');
        }
      });

      socket.on('end', () => {
        resolve();
      });

      socket.on('error', (err) => {
        this.#log('warn', `No se pudo rotar sesión Tor: ${err.message}`);
        resolve(); // Resolve anyway to not block the process
      });
    });
  }

  /**
   * Delay helper para reintentos
   * @private
   * @param {number} ms - Milisegundos a esperar
   */
  async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Método de fallback para peticiones sin Tor
   * @private
   * @param {string} url - URL a consultar
   */
  async #fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': CONSTANTS.NETWORK.USER_AGENT,
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Timeout de ${this.#timeout}ms excedido para: ${url}`);
      }
      throw error;
    }
  }
}

export default TorrentioApiService;