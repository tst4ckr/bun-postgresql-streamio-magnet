/**
 * @fileoverview ChannelPersistenceService - Servicio para persistir cambios en canales
 * Responsabilidad única: gestión de persistencia de canales actualizados
 * Arquitectura: Lógica de negocio separada de herramientas auxiliares
 */

import { RepositoryError } from '../repositories/ChannelRepository.js';
import {
  createChannelCSVWriter,
  channelsToCSVRecords,
  separateValidChannels,
  calculateChannelStatistics,
  generateBackupTimestamp,
  generateBackupPath,
  fileExists,
  copyFile,
  writeCSVRecords,
  createRepositoryError
} from './ChannelPersistenceService_tools.js';

/**
 * Servicio para persistir cambios en canales
 * Implementa la funcionalidad de escritura de canales actualizados al archivo CSV
 */
export class ChannelPersistenceService {
  /**
   * @private
   */
  #config;
  #logger;

  /**
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Persiste canales actualizados al archivo CSV
   * @param {Array<Channel>} channels - Canales a persistir
   * @param {string} filePath - Ruta del archivo CSV
   * @returns {Promise<void>}
   * @throws {RepositoryError}
   */
  async persistChannelsToCSV(channels, filePath) {
    try {
      this.#logger.info(`Persistiendo ${channels.length} canales al archivo CSV: ${filePath}`);

      // Configurar el escritor CSV usando herramientas auxiliares
      const csvWriter = createChannelCSVWriter(filePath);

      // Convertir canales al formato CSV usando herramientas auxiliares
      const csvRecords = channelsToCSVRecords(channels);

      // Escribir al archivo usando herramientas auxiliares
      await writeCSVRecords(csvWriter, csvRecords);

      this.#logger.info(`✅ ${channels.length} canales persistidos exitosamente en ${filePath}`);

    } catch (error) {
      const errorMsg = `Error persistiendo canales al CSV: ${error.message}`;
      this.#logger.error(errorMsg, error);
      throw createRepositoryError(errorMsg, error);
    }
  }

  /**
   * Crea una copia de respaldo del archivo CSV antes de sobrescribirlo
   * @param {string} filePath - Ruta del archivo original
   * @returns {Promise<string>} - Ruta del archivo de respaldo
   * @throws {RepositoryError}
   */
  async createBackup(filePath) {
    try {
      // Generar timestamp y ruta de respaldo usando herramientas auxiliares
      const timestamp = generateBackupTimestamp();
      const backupPath = generateBackupPath(filePath, timestamp);
      
      // Verificar si el archivo original existe usando herramientas auxiliares
      if (await fileExists(filePath)) {
        await copyFile(filePath, backupPath);
        this.#logger.info(`📋 Respaldo creado: ${backupPath}`);
        return backupPath;
      } else {
        this.#logger.warn(`⚠️  Archivo original no existe, no se creará respaldo: ${filePath}`);
        return null;
      }
    } catch (error) {
      const errorMsg = `Error creando respaldo del CSV: ${error.message}`;
      this.#logger.error(errorMsg, error);
      throw createRepositoryError(errorMsg, error);
    }
  }

  /**
   * Persiste canales con respaldo automático
   * @param {Array<Channel>} channels - Canales a persistir
   * @param {string} filePath - Ruta del archivo CSV
   * @param {boolean} createBackup - Si crear respaldo antes de sobrescribir
   * @returns {Promise<{backupPath: string|null, channelsPersisted: number}>}
   * @throws {RepositoryError}
   */
  async persistChannelsWithBackup(channels, filePath, createBackup = true) {
    let backupPath = null;

    try {
      // Crear respaldo si se solicita
      if (createBackup) {
        backupPath = await this.createBackup(filePath);
      }

      // Persistir canales
      await this.persistChannelsToCSV(channels, filePath);

      return {
        backupPath,
        channelsPersisted: channels.length
      };

    } catch (error) {
      // Si hay error y se creó respaldo, intentar restaurar usando herramientas auxiliares
      if (backupPath) {
        try {
          await copyFile(backupPath, filePath);
          this.#logger.warn(`🔄 Archivo restaurado desde respaldo debido a error`);
        } catch (restoreError) {
          this.#logger.error(`❌ Error restaurando respaldo: ${restoreError.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Valida que los canales tengan los campos mínimos requeridos
   * @param {Array<Channel>} channels - Canales a validar
   * @returns {Array<Channel>} - Canales válidos
   * @throws {RepositoryError}
   */
  validateChannelsForPersistence(channels) {
    // Separar canales válidos e inválidos usando herramientas auxiliares
    const { validChannels, invalidChannels } = separateValidChannels(channels);

    // Reportar canales inválidos si los hay
    if (invalidChannels.length > 0) {
      this.#logger.warn(`⚠️  ${invalidChannels.length} canales inválidos omitidos:`);
      invalidChannels.forEach(({ index, reason }) => {
        this.#logger.warn(`  - Canal ${index}: ${reason}`);
      });
    }

    // Validar que hay canales válidos para procesar
    if (validChannels.length === 0) {
      throw createRepositoryError('No hay canales válidos para persistir');
    }

    this.#logger.info(`✅ ${validChannels.length} canales válidos para persistencia`);
    return validChannels;
  }

  /**
   * Obtiene estadísticas de los canales a persistir
   * @param {Array<Channel>} channels - Canales a analizar
   * @returns {Object} - Estadísticas
   */
  getChannelStatistics(channels) {
    // Delegar el cálculo de estadísticas a las herramientas auxiliares
    return calculateChannelStatistics(channels);
  }
}

export default ChannelPersistenceService;