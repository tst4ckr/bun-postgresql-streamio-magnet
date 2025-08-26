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
    this.#ensureTorrentioFileExists();
  }

  /**
   * Busca magnets por IMDb ID en la API de Torrentio.
   * @param {string} imdbId - ID de IMDb (ej: 'tt1234567')
   * @param {string} type - Tipo de contenido ('movie', 'series' o 'anime')
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async searchMagnetsByImdbId(imdbId, type = 'movie') {
    try {
      this.#logger.info(`Buscando magnets en API Torrentio para: ${imdbId} (${type})`);
      
      // Construir URL según el tipo de contenido
      // Anime usa la misma URL que series en Torrentio (proveedores específicos como NyaaSi, HorribleSubs)
      const contentType = (type === 'series' || type === 'anime') ? 'series' : 'movie';
      const streamUrl = `${this.#baseUrl}/stream/${contentType}/${imdbId}.json`;
      const response = await this.#fetchWithTimeout(streamUrl);
      
      if (!response.ok) {
        this.#logger.warn(`API Torrentio respondió con status ${response.status} para ${imdbId}`);
        return [];
      }
      
      const data = await response.json();
      const magnets = this.#parseStreamsToMagnets(data.streams || [], imdbId);
      
      if (magnets.length > 0) {
        await this.#saveMagnetsToFile(magnets);
        this.#logger.info(`Guardados ${magnets.length} magnets de API Torrentio para ${imdbId}`);
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
   * @returns {Magnet[]} Array de magnets
   */
  #parseStreamsToMagnets(streams, imdbId) {
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
        
        // Construir magnet URI con información adicional
        const magnetUri = this.#buildMagnetUri(stream.infoHash, filename || fullName, stream.sources);
        
        const magnetData = {
          imdb_id: imdbId,
          name: fullName,
          magnet: magnetUri,
          quality: quality,
          size: size,
          source: 'torrentio-api',
          // Información adicional de Torrentio
          fileIdx: stream.fileIdx,
          filename: filename,
          provider: this.#extractProvider(streamTitle)
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
      { pattern: /\b(TS|ts)\b/i, quality: 'TS' }
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
   * Extrae el nombre del archivo desde behaviorHints.
   * @private
   * @param {Object} stream - Objeto stream
   * @returns {string|null} Nombre del archivo o null
   */
  #extractFilename(stream) {
    return stream.behaviorHints?.filename || null;
  }

  /**
   * Extrae el proveedor del stream desde el title.
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
    
    // Proveedores conocidos como fallback
    const knownProviders = ['cinecalidad', 'mejortorrent', 'wolfmax4k'];
    for (const provider of knownProviders) {
      if (streamTitle.toLowerCase().includes(provider)) {
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
      escapeCsv(magnet.provider || '')
    ].join(',');
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
      
      const headers = 'imdb_id,name,magnet,quality,size,source,fileIdx,filename,provider\n';
      writeFileSync(this.#torrentioFilePath, headers, 'utf8');
      this.#logger.info(`Archivo torrentio.csv creado en: ${this.#torrentioFilePath}`);
    }
  }

  /**
   * Realiza petición HTTP con timeout.
   * @private
   * @param {string} url - URL a consultar
   * @returns {Promise<Response>} Respuesta HTTP
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
        throw new Error(`Timeout al consultar API Torrentio: ${url}`);
      }
      throw error;
    }
  }
}

export default TorrentioApiService;