/**
 * @fileoverview CsvTvRepository - Repositorio para cargar canales de TV desde un archivo CSV.
 */

import fs from 'fs';
import csv from 'csv-parser';
import { Tv } from '../../domain/entities/Tv.js';

/**
 * Repositorio para manejar la carga de canales de TV desde un archivo CSV.
 */
export class CsvTvRepository {
  #csvPath;
  #logger;
  #tvs = [];

  /**
   * @param {string} csvPath - Ruta al archivo CSV de canales de TV.
   * @param {EnhancedLogger} logger - Instancia del logger.
   */
  constructor(csvPath, logger) {
    this.#csvPath = csvPath;
    this.#logger = logger;
  }

  /**
   * Inicializa el repositorio cargando los canales desde el archivo CSV.
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const tvs = [];
      let headersValidated = false;
      const expectedHeaders = ['name', 'stream_url']; // Cabeceras mínimas requeridas

      fs.createReadStream(this.#csvPath)
        .pipe(csv())
        .on('headers', (headers) => {
          const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
          if (missingHeaders.length > 0) {
            const error = new Error(`Cabeceras CSV faltantes: ${missingHeaders.join(', ')}`);
            this.#logger.error(error.message, { path: this.#csvPath });
            reject(error);
            // Detener el stream si las cabeceras no son válidas
            // Esto es un poco complicado con la API de streams, pero el reject debería ser suficiente
          }
          headersValidated = true;
        })
        .on('data', (data) => {
          if (!headersValidated) return; // No procesar datos si las cabeceras no son válidas

          try {
            // Validación de datos de fila
            if (!data.name || !data.stream_url) {
              this.#logger.warn('Fila de TV CSV omitida por falta de datos esenciales (name o stream_url)', { row: data });
              return;
            }

            const tv = new Tv({
              id: data.id || Tv.generateId(data.name),
              name: data.name,
              streamUrl: data.stream_url, // Corregido: usar stream_url en lugar de url
              logo: data.logo,
              group: data.genre, // Corregido: usar genre en lugar de category
            });
            tvs.push(tv);
          } catch (error) {
            this.#logger.warn(`Error al procesar fila de TV CSV: ${error.message}`, { row: data });
          }
        })
        .on('end', () => {
          this.#tvs = tvs;
          this.#logger.info(`Cargados ${this.#tvs.length} canales de TV desde ${this.#csvPath}`);
          resolve();
        })
        .on('error', (error) => {
          this.#logger.error(`Error al leer el archivo CSV de TV: ${error.message}`);
          reject(error);
        });
    });
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