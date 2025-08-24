/**
 * @fileoverview MagnetService - Orquesta las operaciones relacionadas con los magnets.
 * Actúa como un intermediario entre los handlers y los repositorios, aplicando la lógica de negocio.
 */

import { MagnetNotFoundError, RepositoryError } from '../../domain/repositories/MagnetRepository.js';

/**
 * Servicio para la gestión de magnets.
 * Separa la lógica de la aplicación de la capa de acceso a datos.
 */
export class MagnetService {
  /**
   * @private
   */
  #magnetRepository;
  #logger;

  /**
   * @param {import('../../domain/repositories/MagnetRepository.js').MagnetRepository} magnetRepository
   * @param {Object} logger
   */
  constructor(magnetRepository, logger = console) {
    this.#magnetRepository = magnetRepository;
    this.#logger = logger;
  }

  /**
   * Obtiene todos los magnets disponibles.
   * @returns {Promise<Magnet[]>}
   */
  async getAllMagnets() {
    try {
      return await this.#magnetRepository.getAllMagnets();
    } catch (error) {
      this.#logger.error('Error al obtener todos los magnets:', error);
      if (error instanceof RepositoryError) {
        throw new Error('No se pudo acceder a la fuente de datos de magnets.');
      }
      throw error;
    }
  }

  /**
   * Busca magnets por su IMDb ID.
   * @param {string} imdbId
   * @returns {Promise<Magnet[]>}
   * @throws {MagnetNotFoundError} Si no se encuentran magnets para el ID.
   */
  async getMagnetsByImdbId(imdbId) {
    if (!imdbId || typeof imdbId !== 'string') {
      throw new Error('IMDb ID inválido.');
    }

    try {
      return await this.#magnetRepository.getMagnetsByImdbId(imdbId);
    } catch (error) {
      this.#logger.error(`Error al buscar magnets para ${imdbId}:`, error);
      if (error instanceof MagnetNotFoundError) {
        throw error;
      }
      throw new Error('Ocurrió un error al buscar los magnets.');
    }
  }

  /**
   * Filtra magnets por calidad.
   * @param {string} quality
   * @returns {Promise<Magnet[]>}
   */
  async getMagnetsByQuality(quality) {
    if (!quality || typeof quality !== 'string') {
      throw new Error('Calidad inválida.');
    }

    try {
      return await this.#magnetRepository.getMagnetsByQuality(quality);
    } catch (error) {
      this.#logger.error(`Error al filtrar magnets por calidad ${quality}:`, error);
      throw new Error('No se pudo realizar el filtrado por calidad.');
    }
  }
}

export default MagnetService;