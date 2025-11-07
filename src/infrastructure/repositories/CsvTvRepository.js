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
      // Las cabeceras esperadas en el CSV son 'name' y 'url'.
      const expectedHeaders = ['name', 'stream_url'];

      fs.createReadStream(this.#csvPath)
        .pipe(csv())
        .on('headers', (headers) => {
          const trimmedHeaders = headers.map(h => h.trim());
          const missingHeaders = expectedHeaders.filter(h => !trimmedHeaders.includes(h));
          if (missingHeaders.length > 0) {
            const error = new Error(`Cabeceras CSV faltantes o incorrectas. Se esperaban: ${expectedHeaders.join(', ')}. Faltan: ${missingHeaders.join(', ')}`);
            this.#logger.error(error.message, { path: this.#csvPath, foundHeaders: headers });
            // Rechazar la promesa para detener la inicialización.
            return reject(error);
          }
        })
        .on('data', (data) => {
          try {
            // Validación de datos de fila: asegurarse de que 'name' y 'url' existan.
            if (!data.name || !data.stream_url) {
              this.#logger.warn('Fila de TV CSV omitida por falta de datos esenciales (name o url)', { row: data });
              return;
            }

            // Fallbacks: si no existen poster o background, usar el logo temporalmente
            const logoValue = data.logo || data['tvg-logo'];
            const posterValue = data.poster || logoValue;
            const backgroundValue = data.background || logoValue;

            const tv = new Tv({
              id: data.id || Tv.generateId(data.name),
              name: data.name,
              streamUrl: data.stream_url,
              // Pasar valores tal como vienen del CSV (pueden ser rutas relativas o URLs absolutas)
              // La entidad Tv se encargará de normalizarlas y construir la URL final (BASE_URL + /static)
              poster: posterValue || undefined,
              logo: logoValue || undefined,
              group: data.genre || data['group-title'],
              tvgId: data['tvg-id'],
              tvgName: data['tvg-name'],
              description: data.description,
              background: backgroundValue || undefined,
            });
            tvs.push(tv);
          } catch (error) {
            this.#logger.warn(`Error al procesar fila de TV CSV: ${error.message}`, { row: data });
          }
        })
        .on('end', () => {
          this.#tvs = tvs;
          if (this.#tvs.length === 0) {
            this.#logger.warn(`No se cargaron canales de TV desde ${this.#csvPath}. El archivo podría estar vacío o todas las filas son inválidas.`);
          } else {
            this.#logger.info(`Cargados ${this.#tvs.length} canales de TV desde ${this.#csvPath}`);
          }
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