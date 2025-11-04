/**
 * @fileoverview MagnetRepository Interface - Contrato para repositorios de magnets
 * Implementa los principios de DDD con abstracción de persistencia
 * Soporte unificado para IDs de IMDb y Kitsu
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

  /**
   * Busca magnets por cualquier tipo de ID de contenido (IMDb o Kitsu).
   * Método unificado que detecta automáticamente el tipo de ID y realiza la conversión necesaria.
   * @param {string} contentId - ID de contenido (IMDb o Kitsu)
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @param {Object} options - Opciones adicionales para la búsqueda
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async getMagnetsByContentId(contentId, type = 'movie', options = {}) {
    // Implementación por defecto que delega al método específico de IMDb
    // Las clases derivadas pueden sobrescribir este método para optimización
    return await this.getMagnetsByImdbId(contentId, type);
  }

  /**
   * Configura el idioma prioritario para las búsquedas.
   * @param {string} language - Código de idioma
   */
  setPriorityLanguage(language) {
    // Implementación opcional - las clases derivadas pueden sobrescribir
  }

  /**
   * Obtiene el idioma prioritario configurado.
   * @returns {string|null} Código de idioma o null si no está configurado
   */
  getPriorityLanguage() {
    // Implementación opcional - las clases derivadas pueden sobrescribir
    return null;
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