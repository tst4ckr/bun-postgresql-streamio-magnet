import { CSVMagnetRepository } from '../repositories/CSVMagnetRepository.js';
import { RemoteCSVMagnetRepository } from '../repositories/RemoteCSVMagnetRepository.js';

/**
 * Factory para crear repositorios de magnets basándose en la fuente de datos.
 * Implementa el patrón Factory Method para abstraer la creación de repositorios.
 */
export class MagnetRepositoryFactory {
  /**
   * Crea un repositorio de magnets apropiado basándose en la fuente.
   * @param {string} source - Ruta del archivo local o URL remota
   * @param {Object} logger - Logger para registrar eventos
   * @param {number} timeout - Timeout para URLs remotas (ms)
   * @returns {MagnetRepository} Instancia del repositorio apropiado
   */
  static create(source, logger = console, timeout = 30000) {
    if (this.#isUrl(source)) {
      logger.info(`Creando repositorio remoto para URL: ${source}`);
      return new RemoteCSVMagnetRepository(source, logger, timeout);
    } else {
      logger.info(`Creando repositorio local para archivo: ${source}`);
      return new CSVMagnetRepository(source, logger);
    }
  }

  /**
   * Determina si una fuente es una URL o un archivo local.
   * @param {string} source - Fuente a evaluar
   * @returns {boolean} true si es URL, false si es archivo local
   * @private
   */
  static #isUrl(source) {
    try {
      const url = new URL(source);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Valida que la fuente sea accesible.
   * @param {string} source - Fuente a validar
   * @returns {Promise<boolean>} true si es válida
   */
  static async validate(source) {
    if (this.#isUrl(source)) {
      try {
        const response = await fetch(source, { method: 'HEAD' });
        return response.ok;
      } catch {
        return false;
      }
    } else {
      try {
        const { access } = await import('fs/promises');
        await access(source);
        return true;
      } catch {
        return false;
      }
    }
  }
}