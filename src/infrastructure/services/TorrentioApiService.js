/**
 * @fileoverview TorrentioApiService - Servicio para integración con la API de Torrentio.
 * Maneja consultas externas y persistencia de resultados en torrentio.csv.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Magnet } from '../../domain/entities/Magnet.js';

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

  /**
   * @param {string} baseUrl - URL base de la API de Torrentio
   * @param {string} torrentioFilePath - Ruta del archivo torrentio.csv
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para peticiones HTTP
   */
  constructor(baseUrl, torrentioFilePath, logger = console, timeout = 30000) {
    this.#baseUrl = baseUrl;
    this.#torrentioFilePath = torrentioFilePath;
    this.#logger = logger;
    this.#timeout = timeout;
    this.#providerConfigs = this.#initializeProviderConfigs();
    this.#manifestCache = new Map();
    this.#manifestCacheExpiry = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
    this.#ensureTorrentioFileExists();
  }

  /**
   * Busca magnets por ID de IMDb usando la API de Torrentio
   * Soporta películas, series y anime con detección automática de tipo
   * @param {string} imdbId - ID de IMDb (ej: 'tt1234567') o Kitsu ID (ej: 'kitsu:12345')
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
  async searchMagnetsByImdbId(imdbId, type = 'auto', season = null, episode = null) {
    try {
      // Detectar tipo automáticamente si es necesario
      const detectedType = type === 'auto' ? this.#detectContentType(imdbId, season, episode) : type;
      this.#logger.info(`Buscando magnets en API Torrentio para: ${imdbId} (${detectedType})`);
      
      // Construir ID según el tipo de contenido
      let streamId = imdbId;
      if ((detectedType === 'series' || detectedType === 'anime') && season !== null && episode !== null) {
        streamId = `${imdbId}:${season}:${episode}`;
        this.#logger.info(`Formato de serie/anime: ${streamId}`);
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
      
      const streamUrl = `${optimizedBaseUrl}/stream/${urlContentType}/${streamId}.json`;
      this.#logger.info(`URL construida: ${streamUrl}`);
      const response = await this.#fetchWithTimeout(streamUrl);
      
      if (!response.ok) {
        this.#logger.warn(`API Torrentio respondió con status ${response.status} para ${streamId}`);
        return [];
      }
      
      const data = await response.json();
      const magnets = this.#parseStreamsToMagnets(data.streams || [], imdbId, detectedType, season, episode);
      
      if (magnets.length > 0) {
        await this.#saveMagnetsToFile(magnets);
        this.#logger.info(`Guardados ${magnets.length} magnets de API Torrentio para ${streamId}`);
      }
      
      return magnets;
      
    } catch (error) {
      this.#logger.error(`Error al consultar API Torrentio para ${imdbId}:`, error);
      return [];
    }
  }

  /**
   * Convierte streams de Torrentio a objetos Magnet.
   * @private
   * @param {Array} streams - Streams de la respuesta de Torrentio
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido
   * @param {number} season - Temporada (para series/anime)
   * @param {number} episode - Episodio (para series/anime)
   * @returns {Magnet[]} Array de magnets
   */
  #parseStreamsToMagnets(streams, imdbId, type, season = null, episode = null) {
    const magnets = [];
    
    for (const stream of streams) {
      try {
        if (!stream.infoHash) {
          this.#logger.debug(`Stream sin infoHash ignorado para ${imdbId}:`, stream);
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
        
        // Construir magnet URI con información adicional
        const magnetUri = this.#buildMagnetUri(stream.infoHash, filename || fullName, stream.sources);
        
        // Usar información de episodio proporcionada o extraída
        const episodeInfo = season !== null && episode !== null 
          ? { season, episode }
          : this.#extractEpisodeInfo(streamTitle, type);
        
        // Extraer solo el ID base de IMDb (sin temporada:episodio)
        const baseImdbId = imdbId.split(':')[0];
        
        const magnetData = {
          imdb_id: baseImdbId,
          name: fullName,
          magnet: magnetUri,
          quality: quality,
          size: size,
          source: 'torrentio-api',
          // Información adicional de Torrentio
          fileIdx: stream.fileIdx,
          filename: filename,
          provider: this.#extractProvider(streamTitle),
          seeders: seedersInfo.seeders,
          peers: seedersInfo.peers,
          ...episodeInfo
        };
        
        const magnet = new Magnet(magnetData);
        magnets.push(magnet);
        
      } catch (error) {
        this.#logger.error(`Error al procesar stream de Torrentio para ${imdbId}:`, error, stream);
      }
    }
    
    return magnets;
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
    
    // Extraer el nombre del archivo del title (primera línea)
    const titleLines = streamTitle.split('\n');
    const filename = titleLines[0] || '';
    
    return filename || streamName;
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
      this.#logger.error('Error al guardar magnets en torrentio.csv:', error);
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
      escapeCsv(magnet.imdb_id),
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
      escapeCsv(magnet.episode || '')
    ].join(',');
  }

  /**
   * Detecta automáticamente el tipo de contenido basándose en el ID y parámetros.
   * @private
   * @param {string} id - ID del contenido
   * @param {number} season - Temporada
   * @param {number} episode - Episodio
   * @returns {string} Tipo detectado ('movie', 'series', 'anime')
   */
  #detectContentType(id, season, episode) {
    // Si tiene temporada y episodio, es serie o anime
    if (season !== null && episode !== null) {
      // Detectar anime por prefijo kitsu o patrones específicos
      if (id.startsWith('kitsu:')) {
        return 'anime';
      }
      
      // Para IMDb IDs, usar heurísticas adicionales
      // Por ahora, defaultear a 'series' si tiene season/episode
      return 'series';
    }
    
    // Si es un ID de Kitsu sin season/episode, probablemente es anime movie
    if (id.startsWith('kitsu:')) {
      return 'anime';
    }
    
    // Por defecto, asumir que es película
    return 'movie';
  }

  /**
   * Inicializa las configuraciones de proveedores optimizadas por tipo de contenido.
   * Prioriza contenido en español mexicano con máximo seeders.
   * @private
   * @returns {Object} Configuraciones de proveedores
   */
  #initializeProviderConfigs() {
    return {
      movie: {
        providers: 'mejortorrent,wolfmax4k,cinecalidad',
        sort: 'seeders',
        qualityFilter: 'scr,cam,unknown',
        limit: 2
      },
      series: {
        providers: 'horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad,eztv',
        sort: 'seeders',
        qualityFilter: 'scr,cam,unknown',
        limit: 2
      },
      anime: {
        providers: 'horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad',
        sort: 'seeders',
        qualityFilter: 'unknown',
        limit: 2
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
    const cleanBaseUrl = this.#baseUrl.split('/providers=')[0];
    
    // Construir parámetros en formato Torrentio (separados por |)
    const params = [
      `providers=${config.providers}`,
      `sort=${config.sort}`,
      `qualityfilter=${config.qualityFilter}`,
      `limit=${config.limit}`
    ].join('|');
    
    return `${cleanBaseUrl}/${params}`;
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
      
      const headers = 'imdb_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode\n';
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