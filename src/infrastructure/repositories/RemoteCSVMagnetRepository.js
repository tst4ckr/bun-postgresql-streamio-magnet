import csv from 'csv-parser';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { Magnet } from '../../domain/entities/Magnet.js';
import { Readable } from 'stream';

/**
 * Repositorio para cargar magnets desde URLs remotas de archivos CSV.
 * Implementa el patrón Repository con soporte para fuentes remotas.
 */
export class RemoteCSVMagnetRepository extends MagnetRepository {
  #url;
  #magnets = [];
  #magnetMap = new Map();
  #isInitialized = false;
  #logger;
  #timeout;

  constructor(url, logger = console, timeout = 30000) {
    super();
    this.#url = url;
    this.#logger = logger;
    this.#timeout = timeout;
  }

  async initialize() {
    if (this.#isInitialized) return;

    try {
      await this.#loadFromRemoteCSV();
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar CSV desde URL: ${this.#url}`, error);
    }
  }

  async #loadFromRemoteCSV() {
    this.#logger.info(`Cargando magnets desde URL remota: ${this.#url}`);
    
    const response = await this.#fetchWithTimeout(this.#url, this.#timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const csvText = await response.text();
    const stream = Readable.from(csvText).pipe(csv());
    
    for await (const row of stream) {
      try {
        // Mapear campos para compatibilidad con el nuevo esquema
        const magnetData = {
          content_id: row.imdb_id || row.content_id, // Compatibilidad hacia atrás
          name: row.name,
          magnet: row.magnet,
          quality: row.quality,
          size: row.size,
          // Campos opcionales para compatibilidad
          imdb_id: row.imdb_id,
          id_type: row.id_type || (row.imdb_id ? 'imdb' : 'unknown')
        };
        
        const magnet = new Magnet(magnetData);
        this.#magnets.push(magnet);
        this.#addToMap(magnet);
      } catch (error) {
        this.#logger.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${JSON.stringify(error.issues || error.message)}`);
      }
    }
    
    this.#logger.info(`Cargados ${this.#magnets.length} magnets desde URL remota`);
  }

  #addToMap(magnet) {
    // Indexar por content_id (principal)
    if (!this.#magnetMap.has(magnet.content_id)) {
      this.#magnetMap.set(magnet.content_id, []);
    }
    this.#magnetMap.get(magnet.content_id).push(magnet);
    
    // Indexar también por imdb_id para compatibilidad hacia atrás
    if (magnet.imdb_id && magnet.imdb_id !== magnet.content_id) {
      if (!this.#magnetMap.has(magnet.imdb_id)) {
        this.#magnetMap.set(magnet.imdb_id, []);
      }
      this.#magnetMap.get(magnet.imdb_id).push(magnet);
    }
  }

  async #fetchWithTimeout(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'VeoVeo-Search-Pro/1.3.0'
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Timeout al cargar CSV desde URL: ${url}`);
      }
      throw error;
    }
  }

  /**
   * Busca magnets por content ID.
   * @param {string} contentId - ID de contenido
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime') - no usado en CSV remoto
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByContentId(contentId, type = 'movie') {
    if (!this.#isInitialized) await this.initialize();
    const magnets = this.#magnetMap.get(contentId) || [];
    if (magnets.length === 0) {
      throw new MagnetNotFoundError(contentId);
    }
    return magnets;
  }

  /**
   * Busca magnets por IMDb ID (método legacy para compatibilidad).
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido ('movie' o 'series') - no usado en CSV remoto
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    return this.getMagnetsByContentId(imdbId, type);
  }
}