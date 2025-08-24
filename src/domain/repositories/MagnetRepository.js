/**
 * @fileoverview MagnetRepository Interface - Contrato para repositorios de magnets
 * Implementa los principios de DDD con abstracción de persistencia
 */

export class MagnetRepository {
  /**
   * Obtiene todos los magnets disponibles
   * @returns {Promise<Magnet[]>}
   * @throws {RepositoryError}
   */
  async getAllMagnets() {
    throw new Error('Método getAllMagnets debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene magnets por ID de IMDB
   * @param {string} imdbId - ID de IMDB (formato tt*)
   * @returns {Promise<Magnet[]>}
   * @throws {RepositoryError}
   */
  async getMagnetsByImdbId(imdbId) {
    throw new Error('Método getMagnetsByImdbId debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene magnets por calidad
   * @param {string} quality - Calidad del video (e.g., '720p', '1080p', '4K')
   * @returns {Promise<Magnet[]>}
   * @throws {RepositoryError}
   */
  async getMagnetsByQuality(quality) {
    throw new Error('Método getMagnetsByQuality debe ser implementado por la clase derivada');
  }
}

export class RepositoryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
  }
}

export class MagnetNotFoundError extends Error {
  constructor(imdbId) {
    super(`No se encontraron magnets para el ID de IMDB: ${imdbId}`);
    this.name = 'MagnetNotFoundError';
    this.imdbId = imdbId;
  }
}