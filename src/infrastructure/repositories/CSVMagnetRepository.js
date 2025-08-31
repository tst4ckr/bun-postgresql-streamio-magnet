import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { Magnet } from '../../domain/entities/Magnet.js';

export class CSVMagnetRepository extends MagnetRepository {
  #filePath;
  #magnets = [];
  #magnetMap = new Map();
  #isInitialized = false;
  #logger;

  constructor(filePath, logger = console) {
    super();
    this.#filePath = filePath;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#isInitialized) return;

    try {
      await this.#loadFromCSV();
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  async #loadFromCSV() {
    const stream = createReadStream(this.#filePath).pipe(csv());
    
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

  /**
   * Busca magnets por content ID.
   * @param {string} contentId - ID de contenido
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime') - no usado en CSV local
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
   * @param {string} type - Tipo de contenido ('movie' o 'series') - no usado en CSV local
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    return this.getMagnetsByContentId(imdbId, type);
  }

  /**
   * Obtiene el número total de entradas cargadas en el repositorio.
   * @returns {Promise<number>} Número total de magnets
   */
  async getTotalEntries() {
    if (!this.#isInitialized) await this.initialize();
    return this.#magnets.length;
  }
}