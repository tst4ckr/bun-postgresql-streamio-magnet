/**
 * @fileoverview RemoteCsvTvRepository - Repositorio para cargar canales de TV desde una URL remota de CSV.
 */

import axios from 'axios';
import csv from 'csv-parser';
import { Tv } from '../../domain/entities/Tv.js';

/**
 * Repositorio para manejar la carga de canales de TV desde una URL remota de CSV.
 */
export class RemoteCsvTvRepository {
  #csvUrl;
  #logger;
  #tvs = [];

  /**
   * @param {string} csvUrl - URL del archivo CSV de canales de TV.
   * @param {EnhancedLogger} logger - Instancia del logger.
   */
  constructor(csvUrl, logger) {
    this.#csvUrl = csvUrl;
    this.#logger = logger;
  }

  /**
   * Inicializa el repositorio cargando los canales desde la URL remota.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const response = await axios.get(this.#csvUrl, { responseType: 'stream' });
      const tvs = [];

      return new Promise((resolve, reject) => {
        response.data
          .pipe(csv())
          .on('data', (data) => {
            try {
              const tv = new Tv({
                id: data.id || Tv.generateId(data.name),
                name: data.name,
                streamUrl: data.stream_url,
                logo: data.logo,
                group: data.genre,
              });
              tvs.push(tv);
            } catch (error) {
              this.#logger.warn(`Error al procesar fila de TV CSV remoto: ${error.message}`, { row: data });
            }
          })
          .on('end', () => {
            this.#tvs = tvs;
            this.#logger.info(`Cargados ${this.#tvs.length} canales de TV desde ${this.#csvUrl}`);
            resolve();
          })
          .on('error', (error) => {
            this.#logger.error(`Error al leer el CSV de TV remoto: ${error.message}`);
            reject(error);
          });
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.#logger.warn(`El archivo CSV de TV no se encontró en ${this.#csvUrl} (404). La funcionalidad de TV estará deshabilitada.`);
        this.#tvs = [];
      } else {
        this.#logger.error(`Error al descargar el archivo CSV de TV desde ${this.#csvUrl}: ${error.message}`);
        throw error; // Re-lanzar otros errores para que el proceso principal falle si es necesario
      }
    }
  }

  /**
   * Obtiene todos los canales de TV.
   * @returns {Promise<Tv[]>}
   */
  async getAllTvs() {
    return this.#tvs;
  }

  /**
   * Obtiene un canal de TV por su ID.
   * @param {string} id - ID del canal.
   * @returns {Promise<Tv|null>}
   */
  async getTvById(id) {
    return this.#tvs.find(tv => tv.id === id) || null;
  }
}