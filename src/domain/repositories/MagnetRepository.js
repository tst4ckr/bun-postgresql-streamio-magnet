/**
 * @fileoverview MagnetRepository Interface - Contrato para repositorios de magnets
 * Implementa los principios de DDD con abstracción de persistencia
 */

export class MagnetRepository {
  /**
   * Busca magnets por IMDb ID.
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido ('movie' o 'series')
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
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