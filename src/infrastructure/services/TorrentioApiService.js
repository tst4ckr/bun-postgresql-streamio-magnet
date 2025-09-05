/**
 * @fileoverview TorrentioApiService - Servicio para integración con la API de Torrentio.
 * Maneja consultas externas y persistencia de resultados en torrentio.csv.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import net from 'net';
import { Magnet } from '../../domain/entities/Magnet.js';
import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { addonConfig } from '../../config/addonConfig.js';
import torRequest from 'tor-request';

/**
 * Servicio para integración con la API de Torrentio de Stremio.
 * Implementa el patrón Service con responsabilidad única para consultas externas.
 */
export class TorrentioApiService {
  #baseUrl;
  #timeout;
  #logger;
  #torrentioFilePath;
  #providerConfigs;
  #manifestCache;
  #manifestCacheExpiry;
  #torEnabled;
  #torHost;
  #torPort;
  #maxRetries;
  #retryDelay;

  /**
   * Método auxiliar para logging seguro con seguimiento de archivos fuente
   * @param {string} level - Nivel de log (info, warn, error, debug)
   * @param {string} message - Mensaje a loggear
   * @param {any} data - Datos adicionales
   */
  #log(level, message, data = null) {
    // Si tenemos un logger personalizado, usarlo
    if (this.#logger && typeof this.#logger[level] === 'function') {
      if (data !== null && data !== undefined) {
        this.#logger[level](message, data);
      } else {
        this.#logger[level](message);
      }
    } else {
      // Fallback a EnhancedLogger si no hay logger personalizado
      const fallbackLogger = new EnhancedLogger('info', true);
      if (data !== null && data !== undefined) {
        fallbackLogger[level](message, data);
      } else {
        fallbackLogger[level](message);
      }
    }
  }

  /**
   * @param {string} baseUrl - URL base de la API de Torrentio
   * @param {string} torrentioFilePath - Ruta del archivo torrentio.csv
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para peticiones HTTP
   * @param {Object} torConfig - Configuración de Tor {enabled: boolean, host: string, port: number, maxRetries: number, retryDelay: number}
   */
  constructor(baseUrl, torrentioFilePath, logger = console, timeout = 30000, torConfig = {}) {
    this.#baseUrl = baseUrl;
    this.#torrentioFilePath = torrentioFilePath;
    this.#logger = logger;
    this.#timeout = timeout;
    
    // Configuración de Tor con valores por defecto
    this.#torEnabled = torConfig.enabled ?? true;
    this.#torHost = torConfig.host ?? '127.0.0.1';
    this.#torPort = torConfig.port ?? 9050;
    this.#maxRetries = torConfig.maxRetries ?? 3;
    this.#retryDelay = torConfig.retryDelay ?? 2000;
    
    this.#providerConfigs = this.#initializeProviderConfigs();
    this.#manifestCache = new Map();
    this.#manifestCacheExpiry = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
    this.#ensureTorrentioFileExists();
    
    // Configurar tor-request si está habilitado
    if (this.#torEnabled) {
      torRequest.setTorAddress(this.#torHost, this.#torPort);
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
      this.#log('error', `Error al consultar API Torrentio para ${contentId}:`, error);
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
        
        // Extraer solo el ID base (sin temporada:episodio)
        const baseContentId = contentId.split(':')[0];
        
        // Detectar tipo de ID y asignar campos apropiados
        const { idType, imdbId } = this.#extractIdInfo(baseContentId);
        
        const magnetData = {
          content_id: baseContentId,
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
   * Selecciona el mejor magnet basado en seeders y calidad.
   * @private
   * @param {Magnet[]} candidates - Candidatos a evaluar
   * @returns {Magnet[]} Array con solo el mejor magnet o vacío
   */
  #selectBestMagnet(candidates) {
    if (candidates.length === 0) {
      return [];
    }
    
    // Definir prioridades de calidad (mayor número = mejor calidad)
    const qualityPriority = {
      '4K': 100,
      '2160p': 100,
      '1080p': 80,
      'FHD': 80,
      'BluRay': 75,
      'BDRip': 70,
      'WEB-DL': 65,
      'WEBRip': 60,
      '720p': 50,
      'HD': 50,
      'DVDRip': 40,
      '480p': 30,
      'CAM': 10,
      'TS': 5,
      'SD': 20,
      'unknown': 0
    };
    
    // Calcular puntuación para cada candidato
    const scoredCandidates = candidates.map(magnet => {
      const qualityScore = qualityPriority[magnet.quality] || 0;
      const seedersScore = (magnet.seeders || 0) * 2; // Dar más peso a los seeders
      const totalScore = qualityScore + seedersScore;
      
      return {
        magnet,
        score: totalScore,
        seeders: magnet.seeders || 0,
        quality: magnet.quality
      };
    });
    
    // Ordenar por puntuación (descendente) y tomar el mejor
    scoredCandidates.sort((a, b) => {
      // Primero por puntuación total
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // En caso de empate, priorizar por seeders
      if (b.seeders !== a.seeders) {
        return b.seeders - a.seeders;
      }
      // En último caso, por calidad
      return (qualityPriority[b.quality] || 0) - (qualityPriority[a.quality] || 0);
    });
    
    const bestCandidate = scoredCandidates[0];
    this.#log('info', `Mejor magnet seleccionado: ${bestCandidate.magnet.name} (${bestCandidate.quality}, ${bestCandidate.seeders} seeders, score: ${bestCandidate.score})`);
    
    return [bestCandidate.magnet];
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
    result.peers = result.seeders > 0 ? Math.floor(result.seeders * 0.3) : 0;
    
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
  async #saveMagnetsToFile(magnets) {
    try {
      for (const magnet of magnets) {
        const csvLine = this.#magnetToCsvLine(magnet);
        appendFileSync(this.#torrentioFilePath, csvLine + '\n', 'utf8');
      }
    } catch (error) {
      this.#log('error', 'Error al guardar magnets en torrentio.csv:', error);
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
   * Extrae información del ID para determinar tipo y campos de compatibilidad.
   * @private
   * @param {string} contentId - ID del contenido
   * @returns {Object} Objeto con idType e imdbId
   */
  #extractIdInfo(contentId) {
    if (!contentId) {
      return { idType: 'imdb', imdbId: undefined };
    }

    // IMDb ID (tt + números)
    if (contentId.match(/^tt\d+$/i)) {
      return { idType: 'imdb', imdbId: contentId };
    }
    // TMDB ID (solo números, opcionalmente con prefijo tmdb:)
    else if (contentId.match(/^(?:tmdb:)?\d+$/i)) {
      return { idType: 'tmdb', imdbId: undefined };
    }
    // TVDB ID (solo números, opcionalmente con prefijo tvdb:)
    else if (contentId.match(/^(?:tvdb:)?\d+$/i)) {
      return { idType: 'tvdb', imdbId: undefined };
    }
    // Kitsu ID (números o slug, opcionalmente con prefijo kitsu:)
    else if (contentId.match(/^(?:kitsu:)?(?:\d+|[\w-]+)$/i)) {
      return { idType: 'kitsu', imdbId: undefined };
    }
    // AniList ID (solo números, opcionalmente con prefijo anilist:)
    else if (contentId.match(/^(?:anilist:)?\d+$/i)) {
      return { idType: 'anilist', imdbId: undefined };
    }
    // MAL ID (solo números, opcionalmente con prefijo mal:)
    else if (contentId.match(/^(?:mal:)?\d+$/i)) {
      return { idType: 'mal', imdbId: undefined };
    }
    
    // Por defecto, asumir IMDb
    return { idType: 'imdb', imdbId: undefined };
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
  #detectContentType(id, season, episode) {
    // Detectar anime por cualquier ID que contenga indicadores de anime
    if (this.#isKitsuDerivedContent(id)) {
      return 'anime';
    }
    
    // Si tiene temporada y episodio, es serie o anime
    if (season !== null && episode !== null) {
      // Usar heurísticas adicionales para detectar anime
      if (this.#isLikelyAnimeContent(id, season, episode)) {
        return 'anime';
      }
      
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
  #processContentId(contentId) {
    if (!contentId) {
      throw new Error('ID de contenido no proporcionado');
    }

    const originalId = contentId.trim();
    
    // Detectar el tipo de ID basado en patrones
    let processedId = originalId;
    let idType = 'imdb'; // Por defecto

    // IMDb ID (tt + números)
    if (originalId.match(/^tt\d+$/i)) {
      processedId = originalId;
      idType = 'imdb';
    }
    // TMDB ID (solo números, opcionalmente con prefijo tmdb:)
    else if (originalId.match(/^(?:tmdb:)?\d+$/i)) {
      processedId = originalId.replace(/^tmdb:/i, '');
      idType = 'tmdb';
    }
    // TVDB ID (solo números, opcionalmente con prefijo tvdb:)
    else if (originalId.match(/^(?:tvdb:)?\d+$/i)) {
      processedId = originalId.replace(/^tvdb:/i, '');
      idType = 'tvdb';
    }
    // Kitsu ID (números o slug, opcionalmente con prefijo kitsu:)
    else if (originalId.match(/^(?:kitsu:)?(?:\d+|[\w-]+)$/i)) {
      processedId = originalId.replace(/^kitsu:/i, '');
      idType = 'kitsu';
    }
    // AniList ID (solo números, opcionalmente con prefijo anilist:)
    else if (originalId.match(/^(?:anilist:)?\d+$/i)) {
      processedId = originalId.replace(/^anilist:/i, '');
      idType = 'anilist';
    }
    // MyAnimeList ID (solo números, opcionalmente con prefijo mal:)
    else if (originalId.match(/^(?:mal:)?\d+$/i)) {
      processedId = originalId.replace(/^mal:/i, '');
      idType = 'mal';
    }

    return {
      originalId,
      processedId,
      idType,
      isValid: true
    };
  }

  /**
   * Verifica si el contenido proviene de Kitsu o tiene indicadores de anime.
   * @private
   * @param {string} id - ID del contenido
   * @returns {boolean} True si es contenido derivado de Kitsu
   */
  #isKitsuDerivedContent(id) {
    // Verificar si el ID original era de Kitsu (puede estar en metadatos)
    return id && (id.includes('kitsu') || id.includes('anime'));
  }

  /**
   * Aplica heurísticas para detectar contenido anime en IMDb IDs.
   * @private
   * @param {string} id - ID del contenido
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {boolean} True si probablemente es anime
   */
  #isLikelyAnimeContent(id, season, episode) {
    // Heurísticas para detectar anime:
    // 1. Temporadas con muchos episodios (típico de anime)
    if (episode > 24) {
      return true;
    }
    
    // 2. Patrones de temporadas típicos de anime (1-4 temporadas, 12-26 episodios)
    if (season <= 4 && episode >= 12 && episode <= 26) {
      return true;
    }
    
    // Por defecto, no es anime
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
    if (!existsSync(this.#torrentioFilePath)) {
      // Asegurar que el directorio padre existe
      const dir = dirname(this.#torrentioFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.#logger.info(`Directorio creado: ${dir}`);
      }
      
      const headers = 'content_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode,imdb_id,id_type\n';
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
      
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Timeout de ${this.#timeout}ms excedido para: ${url}`));
        }, this.#timeout);

        torRequest.request({
          url: url,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0',
            'Accept': 'application/json'
          },
          timeout: this.#timeout
        }, (error, response, body) => {
          clearTimeout(timeoutId);
          
          if (error) {
            reject(error);
            return;
          }

          // Crear objeto compatible con fetch API
          const fetchResponse = {
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: response.headers,
            json: async () => {
              try {
                return JSON.parse(body);
              } catch (parseError) {
                throw new Error(`Error parsing JSON: ${parseError.message}`);
              }
            },
            text: async () => body
          };
          
          resolve(fetchResponse);
        });
      });

      // Si la respuesta es exitosa, devolverla
      if (response.ok) {
        this.#log('info', `Respuesta exitosa vía Tor (${response.status}) en intento ${attempt}`);
        return response;
      }

      // Si es error 502 y tenemos reintentos disponibles, rotar sesión y reintentar
      if (response.status === 502 && attempt < this.#maxRetries) {
        this.#log('warn', `Error 502 detectado, rotando sesión Tor e intentando nuevamente (${attempt}/${this.#maxRetries})`);
        await this.#rotateTorSession();
        await this.#delay(this.#retryDelay);
        return this.#fetchWithTor(url, attempt + 1);
      }

      // Si es otro error o se agotaron los reintentos, devolver la respuesta
      this.#log('warn', `Respuesta no exitosa vía Tor: ${response.status} en intento ${attempt}`);
      return response;

    } catch (error) {
      // Si es error de conexión a Tor, usar fallback inmediatamente
      if (error.code === 'ECONNREFUSED' && error.address === '127.0.0.1' && error.port === 9050) {
        this.#log('warn', `Tor no está ejecutándose en ${this.#torHost}:${this.#torPort}, usando fallback sin proxy`);
        return this.#fetchWithTimeout(url);
      }

      // En caso de otros errores de conexión y tenemos reintentos disponibles
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
      }, 3000); // 3 segundos de timeout
      
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
   * Rota la sesión de Tor para obtener nueva IP
   * @private
   */
  async #rotateTorSession() {
    try {
      await new Promise((resolve, reject) => {
        torRequest.newTorSession((error) => {
          if (error) {
            this.#log('warn', `Error al rotar sesión Tor: ${error.message}`);
            reject(error);
          } else {
            this.#log('info', 'Sesión Tor rotada exitosamente - nueva IP obtenida');
            resolve();
          }
        });
      });
    } catch (error) {
      this.#log('warn', `No se pudo rotar sesión Tor: ${error.message}`);
      // No lanzar error, continuar con la sesión actual
    }
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
          'User-Agent': 'Stremio-Magnet-Search-Addon/1.0.0',
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