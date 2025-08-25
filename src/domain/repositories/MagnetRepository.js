/**
 * @fileoverview MagnetRepository Interface - Contrato para repositorios de magnets
 * Implementa los principios de DDD con abstracción de persistencia
 */

export class MagnetRepository {
  /**
   * Busca magnets por su IMDb ID
   * @param {string} imdbId
   * @returns {Promise<Magnet[]>}
   * @throws {MagnetNotFoundError} Si no se encuentran magnets para el ID
   */
  async getMagnetsByImdbId(imdbId) {
    throw new Error('Método getMagnetsByImdbId debe ser implementado por la clase derivada');
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