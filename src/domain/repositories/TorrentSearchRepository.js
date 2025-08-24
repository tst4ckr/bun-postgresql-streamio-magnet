/**
 * @fileoverview TorrentSearchRepository Interface - Contrato para repositorios de búsqueda de torrents
 * Implementa los principios de DDD con abstracción de búsqueda
 */

export class TorrentSearchRepository {
  /**
   * Busca torrents por consulta
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {Promise<TorrentResult[]>}
   * @throws {SearchRepositoryError}
   */
  async searchTorrents(searchQuery) {
    throw new Error('Método searchTorrents debe ser implementado por la clase derivada');
  }

  /**
   * Busca torrents en un proveedor específico
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {SearchProvider} provider - Proveedor específico
   * @returns {Promise<TorrentResult[]>}
   * @throws {SearchRepositoryError}
   */
  async searchInProvider(searchQuery, provider) {
    throw new Error('Método searchInProvider debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene todos los proveedores disponibles
   * @returns {Promise<SearchProvider[]>}
   * @throws {SearchRepositoryError}
   */
  async getAvailableProviders() {
    throw new Error('Método getAvailableProviders debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene proveedores habilitados ordenados por prioridad
   * @returns {Promise<SearchProvider[]>}
   * @throws {SearchRepositoryError}
   */
  async getEnabledProviders() {
    throw new Error('Método getEnabledProviders debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene un proveedor por su ID
   * @param {string} providerId - ID del proveedor
   * @returns {Promise<SearchProvider|null>}
   * @throws {SearchRepositoryError}
   */
  async getProviderById(providerId) {
    throw new Error('Método getProviderById debe ser implementado por la clase derivada');
  }

  /**
   * Verifica si un proveedor está disponible
   * @param {string} providerId - ID del proveedor
   * @returns {Promise<boolean>}
   * @throws {SearchRepositoryError}
   */
  async isProviderAvailable(providerId) {
    throw new Error('Método isProviderAvailable debe ser implementado por la clase derivada');
  }

  /**
   * Obtiene resultados desde cache si están disponibles
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {Promise<TorrentResult[]|null>}
   * @throws {SearchRepositoryError}
   */
  async getCachedResults(searchQuery) {
    throw new Error('Método getCachedResults debe ser implementado por la clase derivada');
  }

  /**
   * Guarda resultados en cache
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {TorrentResult[]} results - Resultados a cachear
   * @param {number} ttlSeconds - Tiempo de vida en segundos
   * @returns {Promise<void>}
   * @throws {SearchRepositoryError}
   */
  async cacheResults(searchQuery, results, ttlSeconds = 3600) {
    throw new Error('Método cacheResults debe ser implementado por la clase derivada');
  }

  /**
   * Limpia cache expirado
   * @returns {Promise<number>} Número de entradas eliminadas
   * @throws {SearchRepositoryError}
   */
  async cleanExpiredCache() {
    throw new Error('Método cleanExpiredCache debe ser implementado por la clase derivada');
  }

  /**
   * Registra estadísticas de búsqueda
   * @param {SearchQuery} searchQuery - Consulta realizada
   * @param {string} providerId - ID del proveedor usado
   * @param {number} resultCount - Número de resultados obtenidos
   * @param {number} responseTime - Tiempo de respuesta en ms
   * @returns {Promise<void>}
   * @throws {SearchRepositoryError}
   */
  async logSearchStats(searchQuery, providerId, resultCount, responseTime) {
    throw new Error('Método logSearchStats debe ser implementado por la clase derivada');
  }
}

export class SearchRepositoryError extends Error {
  constructor(message, cause, providerId = null) {
    super(message);
    this.name = 'SearchRepositoryError';
    this.cause = cause;
    this.providerId = providerId;
    this.timestamp = new Date();
  }
}

export class ProviderNotFoundError extends SearchRepositoryError {
  constructor(providerId) {
    super(`Proveedor no encontrado: ${providerId}`, null, providerId);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderUnavailableError extends SearchRepositoryError {
  constructor(providerId, reason = 'Proveedor no disponible') {
    super(`${reason}: ${providerId}`, null, providerId);
    this.name = 'ProviderUnavailableError';
  }
}

export class SearchTimeoutError extends SearchRepositoryError {
  constructor(providerId, timeout) {
    super(`Timeout de búsqueda (${timeout}ms) en proveedor: ${providerId}`, null, providerId);
    this.name = 'SearchTimeoutError';
  }
}

export class RateLimitExceededError extends SearchRepositoryError {
  constructor(providerId, retryAfter = null) {
    super(`Rate limit excedido para proveedor: ${providerId}`, null, providerId);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

export class ParsingError extends SearchRepositoryError {
  constructor(providerId, selector, cause) {
    super(`Error parseando respuesta del proveedor ${providerId} con selector: ${selector}`, cause, providerId);
    this.name = 'ParsingError';
    this.selector = selector;
  }
}

export class NetworkError extends SearchRepositoryError {
  constructor(providerId, url, cause) {
    super(`Error de red al acceder a ${url} del proveedor: ${providerId}`, cause, providerId);
    this.name = 'NetworkError';
    this.url = url;
  }
}