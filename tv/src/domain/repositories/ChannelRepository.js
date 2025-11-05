/**
 * @fileoverview ChannelRepository Interface - Contrato para repositorios de canales
 * Implementa los principios de DDD con abstracción de persistencia
 */

/**
 * Interfaz abstracta para repositorios de canales
 * Define el contrato que deben cumplir todas las implementaciones
 */
export class ChannelRepository {
  /**
   * Obtiene todos los canales activos
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getAllChannels() {
    throw new Error('Método getAllChannels debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene un canal por su ID
   * @param {string} id - ID del canal
   * @returns {Promise<Channel|null>}
   * @throws {RepositoryError}
   */
  async getChannelById(id) {
    throw new Error('Método getChannelById debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales filtrados por género
   * @param {string} genre - Género a filtrar
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsByGenre(genre) {
    throw new Error('Método getChannelsByGenre debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales filtrados por país
   * @param {string} country - País a filtrar
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsByCountry(country) {
    throw new Error('Método getChannelsByCountry debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales filtrados por idioma
   * @param {string} language - Idioma a filtrar
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsByLanguage(language) {
    throw new Error('Método getChannelsByLanguage debe ser implementado por la clase derivada');
  }

  /**
   * Busca canales por nombre
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async searchChannels(searchTerm) {
    throw new Error('Método searchChannels debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales paginados
   * @param {number} skip - Número de elementos a saltar
   * @param {number} limit - Número máximo de elementos a retornar
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsPaginated(skip = 0, limit = 20) {
    throw new Error('Método getChannelsPaginated debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales filtrados con múltiples criterios
   * @param {Object} filters - Objeto con filtros
   * @param {string} [filters.genre] - Género
   * @param {string} [filters.country] - País
   * @param {string} [filters.language] - Idioma
   * @param {string} [filters.quality] - Calidad
   * @param {boolean} [filters.isActive] - Estado activo
   * @param {number} [filters.skip] - Elementos a saltar
   * @param {number} [filters.limit] - Límite de elementos
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsFiltered(filters = {}) {
    throw new Error('Método getChannelsFiltered debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene todos los géneros disponibles
   * @returns {Promise<string[]>}
   * @throws {RepositoryError}
   */
  async getAvailableGenres() {
    throw new Error('Método getAvailableGenres debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene todos los países disponibles
   * @returns {Promise<string[]>}
   * @throws {RepositoryError}
   */
  async getAvailableCountries() {
    throw new Error('Método getAvailableCountries debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene todos los idiomas disponibles
   * @returns {Promise<string[]>}
   * @throws {RepositoryError}
   */
  async getAvailableLanguages() {
    throw new Error('Método getAvailableLanguages debe ser implementado por la clase derivada');
  }

  /**
   * Valida si un canal existe
   * @param {string} id - ID del canal
   * @returns {Promise<boolean>}
   * @throws {RepositoryError}
   */
  async channelExists(id) {
    throw new Error('Método channelExists debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene el conteo total de canales
   * @returns {Promise<number>}
   * @throws {RepositoryError}
   */
  async getChannelsCount() {
    throw new Error('Método getChannelsCount debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene el conteo de canales por género
   * @returns {Promise<Object>} Objeto con géneros como clave y conteo como valor
   * @throws {RepositoryError}
   */
  async getChannelsCountByGenre() {
    throw new Error('Método getChannelsCountByGenre debe ser implementado por la clase derivada');
  }

  /**
   * Actualiza la información de un canal existente
   * @param {Channel} channel - Canal a actualizar
   * @returns {Promise<Channel>}
   * @throws {RepositoryError}
   */
  async updateChannel(channel) {
    throw new Error('Método updateChannel debe ser implementado por la clase derivada');
  }

  /**
   * Marca un canal como validado
   * @param {string} id - ID del canal
   * @returns {Promise<Channel>}
   * @throws {RepositoryError}
   */
  async markChannelAsValidated(id) {
    throw new Error('Método markChannelAsValidated debe ser implementado por la clase derivada');
  }

  /**
   * Desactiva un canal
   * @param {string} id - ID del canal
   * @returns {Promise<Channel>}
   * @throws {RepositoryError}
   */
  async deactivateChannel(id) {
    throw new Error('Método deactivateChannel debe ser implementado por la clase derivada');
  }

  /**
   * Refresca los datos desde la fuente remota (si aplica)
   * @returns {Promise<void>}
   * @throws {RepositoryError}
   */
  async refreshFromRemote() {
    throw new Error('Método refreshFromRemote debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene canales que necesitan validación
   * @param {number} hoursThreshold - Horas desde la última validación
   * @returns {Promise<Channel[]>}
   * @throws {RepositoryError}
   */
  async getChannelsNeedingValidation(hoursThreshold = 6) {
    throw new Error('Método getChannelsNeedingValidation debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene estadísticas del repositorio
   * @returns {Promise<Object>}
   * @throws {RepositoryError}
   */
  async getRepositoryStats() {
    throw new Error('Método getRepositoryStats debe ser implementado por la clase derivada');
  }
}

/**
 * Error específico del repositorio
 */
export class RepositoryError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
    this.timestamp = new Date();
  }
}

/**
 * Error de canal no encontrado
 */
export class ChannelNotFoundError extends RepositoryError {
  constructor(channelId) {
    super(`Canal no encontrado: ${channelId}`);
    this.name = 'ChannelNotFoundError';
    this.channelId = channelId;
  }
}

/**
 * Error de validación del repositorio
 */
export class RepositoryValidationError extends RepositoryError {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = 'RepositoryValidationError';
    this.validationErrors = validationErrors;
  }
}

export default ChannelRepository;
