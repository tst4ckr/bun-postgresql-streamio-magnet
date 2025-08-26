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
        const magnet = new Magnet(row);
        this.#magnets.push(magnet);
        this.#addToMap(magnet);
      } catch (error) {
        this.#logger.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${error.message}`);
      }
    }
  }

  #addToMap(magnet) {
    if (!this.#magnetMap.has(magnet.imdb_id)) {
      this.#magnetMap.set(magnet.imdb_id, []);
    }
    this.#magnetMap.get(magnet.imdb_id).push(magnet);
  }

  /**
   * Busca magnets por IMDb ID.
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido ('movie' o 'series') - no usado en CSV local
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    if (!this.#isInitialized) await this.initialize();
    const magnets = this.#magnetMap.get(imdbId) || [];
    if (magnets.length === 0) {
      throw new MagnetNotFoundError(imdbId);
    }
    return magnets;
  }
}