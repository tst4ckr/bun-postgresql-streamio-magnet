/**
 * @fileoverview ValidatedChannelsCsvService - Servicio para escribir canales validados a CSV
 * Implementa los principios de Clean Architecture con responsabilidad única
 */

import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs/promises';

/**
 * Servicio para escribir canales validados a archivo CSV
 * Responsabilidad única: gestionar la exportación de canales validados
 */
export class ValidatedChannelsCsvService {
  /**
   * @private
   */
  #config;
  #logger;
  #csvFilePath;

  /**
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#csvFilePath = this.#resolveCsvFilePath();
  }

  /**
   * Resuelve la ruta del archivo CSV
   * @private
   * @returns {string}
   */
  #resolveCsvFilePath() {
    const csvFileName = this.#config.dataSources?.validatedChannelsCsv || 'tv.csv';
    
    // Si es una ruta absoluta, usarla directamente
    if (path.isAbsolute(csvFileName)) {
      return csvFileName;
    }
    
    // Si es relativa, resolverla desde la raíz del proyecto
    return path.resolve(process.cwd(), csvFileName);
  }

  /**
   * Escribe los canales validados al archivo CSV
   * @param {Channel[]} validatedChannels - Array de canales validados
   * @returns {Promise<void>}
   * @throws {Error}
   */
  async writeValidatedChannels(validatedChannels) {
    if (!Array.isArray(validatedChannels)) {
      throw new Error('validatedChannels debe ser un array');
    }

    if (validatedChannels.length === 0) {
      this.#logger.warn('No hay canales validados para escribir');
      return;
    }

    try {
      // Asegurar que el directorio existe
      await this.#ensureDirectoryExists();

      // Configurar el escritor CSV
      const csvWriter = this.#createCsvWriter();

      // Convertir canales a formato CSV
      const csvData = this.#convertChannelsToCsvFormat(validatedChannels);

      // Escribir al archivo
      await csvWriter.writeRecords(csvData);

      this.#logger.info(`✅ ${validatedChannels.length} canales validados escritos en: ${this.#csvFilePath}`);
      
    } catch (error) {
      this.#logger.error('Error al escribir CSV:', error);
      throw new Error(`Error escribiendo CSV: ${error.message}`);
    }
  }

  /**
   * Asegura que el directorio del archivo CSV existe
   * @private
   * @returns {Promise<void>}
   */
  async #ensureDirectoryExists() {
    const directory = path.dirname(this.#csvFilePath);
    
    try {
      await fs.access(directory);
    } catch (error) {
      // El directorio no existe, crearlo
      await fs.mkdir(directory, { recursive: true });
      this.#logger.info(`Directorio creado: ${directory}`);
    }
  }

  /**
   * Crea el escritor CSV con la configuración apropiada
   * @private
   * @returns {Object}
   */
  #createCsvWriter() {
    return createObjectCsvWriter({
      path: this.#csvFilePath,
      header: [
        { id: 'id', title: 'id' },
        { id: 'name', title: 'name' },
        { id: 'logo', title: 'logo' },
        { id: 'stream_url', title: 'stream_url' },
        { id: 'genre', title: 'genre' },
        { id: 'country', title: 'country' },
        { id: 'language', title: 'language' },
        { id: 'quality', title: 'quality' },
        { id: 'type', title: 'type' },
        { id: 'is_active', title: 'is_active' }
      ],
      encoding: 'utf8'
    });
  }

  /**
   * Convierte canales a formato CSV
   * @private
   * @param {Channel[]} channels
   * @returns {Object[]}
   */
  #convertChannelsToCsvFormat(channels) {
    return channels
      .filter(channel => channel && channel.isActive) // Solo canales activos
      .map(channel => {
        const channelData = channel.toJSON();
        
        return {
          id: channelData.id,
          name: channelData.name,
          logo: channelData.logo || '',
          stream_url: channelData.streamUrl,
          genre: channelData.genre,
          country: channelData.country,
          language: channelData.language,
          quality: channelData.quality?.value || channelData.quality,
          type: channelData.type,
          is_active: channelData.isActive ? 'true' : 'false'
        };
      });
  }

  /**
   * Obtiene la ruta del archivo CSV
   * @returns {string}
   */
  getCsvFilePath() {
    return this.#csvFilePath;
  }

  /**
   * Verifica si el archivo CSV existe
   * @returns {Promise<boolean>}
   */
  async csvFileExists() {
    try {
      await fs.access(this.#csvFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene estadísticas del archivo CSV
   * @returns {Promise<Object|null>}
   */
  async getCsvFileStats() {
    try {
      const stats = await fs.stat(this.#csvFilePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: this.#csvFilePath
      };
    } catch (error) {
      this.#logger.debug(`Estadísticas de CSV no disponibles: ${error.message}`);
      return null;
    }
  }

  /**
   * Elimina el archivo CSV si existe
   * @returns {Promise<boolean>}
   */
  async deleteCsvFile() {
    try {
      await fs.unlink(this.#csvFilePath);
      this.#logger.info(`CSV eliminado: ${this.#csvFilePath}`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.#logger.error(`Error al eliminar CSV: ${error.message}`);
      }
      return false;
    }
  }
}

export default ValidatedChannelsCsvService;