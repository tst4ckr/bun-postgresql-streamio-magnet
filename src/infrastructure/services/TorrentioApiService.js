/**
 * @fileoverview TorrentioApiService - Servicio para integración con la API de Torrentio.
 * Maneja consultas externas y persistencia de resultados en torrentio.csv.
 */

import { writeFileSync, appendFileSync, existsSync } from 'fs';
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
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async searchMagnetsByImdbId(imdbId) {
    try {
      this.#logger.info(`Buscando magnets en API Torrentio para: ${imdbId}`);
      
      const streamUrl = `${this.#baseUrl}/stream/movie/${imdbId}.json`;
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
        if (!stream.infoHash) continue;
        
        // Extraer información del nombre del stream
        const name = stream.name || stream.title || `Torrent ${stream.infoHash}`;
        const quality = this.#extractQuality(name);
        const size = this.#extractSize(name);
        
        // Construir magnet URI
        const magnetUri = this.#buildMagnetUri(stream.infoHash, name, stream.sources);
        
        const magnetData = {
          imdb_id: imdbId,
          name: name,
          magnet: magnetUri,
          quality: quality,
          size: size,
          source: 'torrentio-api'
        };
        
        const magnet = new Magnet(magnetData);
        magnets.push(magnet);
        
      } catch (error) {
        this.#logger.error(`Error al procesar stream de Torrentio:`, error);
      }
    }
    
    return magnets;
  }

  /**
   * Extrae la calidad del nombre del stream.
   * @private
   * @param {string} name - Nombre del stream
   * @returns {string} Calidad extraída
   */
  #extractQuality(name) {
    const qualityPatterns = [
      /\b(4K|2160p)\b/i,
      /\b(1080p|FHD)\b/i,
      /\b(720p|HD)\b/i,
      /\b(480p|SD)\b/i
    ];
    
    for (const pattern of qualityPatterns) {
      const match = name.match(pattern);
      if (match) return match[1].toUpperCase();
    }
    
    return 'SD';
  }

  /**
   * Extrae el tamaño del nombre del stream.
   * @private
   * @param {string} name - Nombre del stream
   * @returns {string} Tamaño extraído o 'N/A'
   */
  #extractSize(name) {
    const sizePattern = /\b(\d+(?:\.\d+)?\s*(?:GB|MB|TB))\b/i;
    const match = name.match(sizePattern);
    return match ? match[1] : 'N/A';
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
    let magnetUri = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}`;
    
    // Agregar trackers si están disponibles
    if (sources && sources.length > 0) {
      for (const source of sources) {
        if (source.startsWith('tracker:')) {
          const tracker = source.replace('tracker:', '');
          magnetUri += `&tr=${encodeURIComponent(tracker)}`;
        }
      }
    }
    
    return magnetUri;
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
      escapeCsv(magnet.source)
    ].join(',');
  }

  /**
   * Asegura que el archivo torrentio.csv existe con headers.
   * @private
   */
  #ensureTorrentioFileExists() {
    if (!existsSync(this.#torrentioFilePath)) {
      const headers = 'imdb_id,name,magnet,quality,size,source\n';
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