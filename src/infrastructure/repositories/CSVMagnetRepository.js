import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { Magnet } from '../../domain/entities/Magnet.js';

export class CSVMagnetRepository extends MagnetRepository {
  #filePath;
  #magnets = [];
  #magnetMap = new Map();
  #isInitialized = false;

  constructor(filePath) {
    super();
    this.#filePath = filePath;
  }

  async initialize() {
    if (this.#isInitialized) return;

    try {
      const stream = createReadStream(this.#filePath).pipe(csv());
      for await (const row of stream) {
        try {
          const magnet = new Magnet(row);
          this.#magnets.push(magnet);
          if (!this.#magnetMap.has(magnet.imdb_id)) {
            this.#magnetMap.set(magnet.imdb_id, []);
          }
          this.#magnetMap.get(magnet.imdb_id).push(magnet);
        } catch (error) {
          console.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${error.message}`);
        }
      }
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  async getAllMagnets() {
    if (!this.#isInitialized) await this.initialize();
    return this.#magnets;
  }

  async getMagnetsByImdbId(imdbId) {
    if (!this.#isInitialized) await this.initialize();
    const magnets = this.#magnetMap.get(imdbId) || [];
    if (magnets.length === 0) {
      throw new MagnetNotFoundError(imdbId);
    }
    return magnets;
  }

  async getMagnetsByQuality(quality) {
    if (!this.#isInitialized) await this.initialize();
    return this.#magnets.filter(magnet => magnet.quality === quality);
  }
}