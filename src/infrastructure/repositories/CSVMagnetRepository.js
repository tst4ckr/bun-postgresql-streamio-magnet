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
      const { magnets, magnetMap } = await this.#loadDataFromCSV();
      this.#magnets = magnets;
      this.#magnetMap = magnetMap;
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  /**
   * Recarga los datos del CSV de forma atómica.
   * Si falla la carga, mantiene los datos anteriores.
   */
  async reload() {
    try {
      const { magnets, magnetMap } = await this.#loadDataFromCSV();
      this.#magnets = magnets;
      this.#magnetMap = magnetMap;
      this.#isInitialized = true;
      this.#logger.info(`Repositorio CSV recargado: ${this.#filePath} (${magnets.length} items)`);
    } catch (error) {
      throw new RepositoryError(`Error al recargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  async #loadDataFromCSV() {
    const magnets = [];
    const magnetMap = new Map();
    const stream = createReadStream(this.#filePath).pipe(csv());

    for await (const row of stream) {
      try {
        // Preservar content_id original para construcción de URLs
        const originalContentId = row.content_id || row.imdb_id;

        // Mapear campos para compatibilidad con el nuevo esquema
        const magnetData = {
          content_id: originalContentId, // Preservar ID original
          original_content_id: originalContentId, // Campo adicional para referencia
          name: row.name,
          magnet: row.magnet,
          quality: row.quality,
          size: row.size,
          // Campos opcionales para compatibilidad
          imdb_id: row.imdb_id,
          id_type: row.id_type || (row.imdb_id ? 'imdb' : 'unknown'),
          // Campos adicionales opcionales
          provider: row.provider,
          filename: row.filename,
          seeders: row.seeders ? parseInt(row.seeders, 10) : undefined,
          peers: row.peers ? parseInt(row.peers, 10) : undefined
        };

        // Filtrar campos undefined para mantener el objeto limpio
        Object.keys(magnetData).forEach(key => {
          if (magnetData[key] === undefined || magnetData[key] === '') {
            delete magnetData[key];
          }
        });

        const magnet = new Magnet(magnetData);
        magnets.push(magnet);
        this.#addToMap(magnet, magnetMap);
      } catch (error) {
        this.#logger.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${JSON.stringify(error.issues || error.message)}`);
      }
    }
    return { magnets, magnetMap };
  }

  #addToMap(magnet, map) {
    // Indexar por content_id (principal)
    if (!map.has(magnet.content_id)) {
      map.set(magnet.content_id, []);
    }
    map.get(magnet.content_id).push(magnet);

    // Indexar también por imdb_id para compatibilidad hacia atrás
    if (magnet.imdb_id && magnet.imdb_id !== magnet.content_id) {
      if (!map.has(magnet.imdb_id)) {
        map.set(magnet.imdb_id, []);
      }
      map.get(magnet.imdb_id).push(magnet);
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
    let magnets = this.#magnetMap.get(contentId) || [];
    if (magnets.length === 0) {
      const baseId = contentId.includes(':') ? contentId.split(':')[0] : contentId;
      const imdbish = baseId.startsWith('tt') ? baseId : `tt${baseId}`;
      magnets = this.#magnetMap.get(baseId) || this.#magnetMap.get(imdbish) || [];
    }
    if (magnets.length === 0) throw new MagnetNotFoundError(contentId);
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