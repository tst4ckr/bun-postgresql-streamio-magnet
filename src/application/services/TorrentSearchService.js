import { SearchQuery } from '../../domain/value-objects/SearchQuery.js';
import { SearchRepositoryError, ProviderUnavailableError, SearchTimeoutError } from '../../domain/repositories/TorrentSearchRepository.js';

/**
 * @fileoverview TorrentSearchService - Servicio de aplicación para búsqueda de torrents
 * Orquesta las búsquedas entre múltiples proveedores y maneja la lógica de negocio
 */

export class TorrentSearchService {
  constructor(searchRepositories = [], cacheService = null, configService = null) {
    this.searchRepositories = new Map();
    this.cacheService = cacheService;
    this.configService = configService;
    this.defaultTimeout = 30000; // 30 segundos
    this.maxConcurrentSearches = 3;
    this.stats = {
      totalSearches: 0,
      cacheHits: 0,
      errors: 0
    };
    
    // Los repositorios se inicializan externamente de forma asíncrona
  }

  /**
   * Inicializa los repositorios de forma asíncrona
   * @param {TorrentSearchRepository[]} repositories - Repositorios a registrar
   */
  async initializeRepositories(repositories) {
    for (const repository of repositories) {
      await this.registerRepository(repository);
    }
  }

  /**
   * Registra un repositorio de búsqueda
   * @param {TorrentSearchRepository} repository - Repositorio a registrar
   */
  async registerRepository(repository) {
    const providers = repository.getAvailableProviders ? 
      await repository.getAvailableProviders() : 
      [repository.provider];
    
    providers.forEach(provider => {
      this.searchRepositories.set(provider.id, repository);
    });
  }

  /**
   * Busca torrents en todos los proveedores disponibles
   * @param {Object} searchParams - Parámetros de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object>}
   */
  async searchTorrents(searchParams, options = {}) {
    try {
      // Validar y crear consulta de búsqueda
      const searchQuery = this.createSearchQuery(searchParams);
      
      // Configurar opciones
      const searchOptions = {
        providers: options.providers || this.getDefaultProviders(),
        timeout: options.timeout || this.defaultTimeout,
        maxResults: options.maxResults || 50,
        includeStats: options.includeStats || false,
        sortBy: options.sortBy || 'quality',
        filterDuplicates: options.filterDuplicates !== false
      };

      // Verificar cache global primero
      if (this.cacheService && !options.skipCache) {
        const cachedResults = await this.getCachedResults(searchQuery, searchOptions);
        if (cachedResults) {
          return this.formatSearchResponse(cachedResults, searchQuery, searchOptions, true);
        }
      }

      // Realizar búsquedas en paralelo
      const searchResults = await this.performParallelSearches(searchQuery, searchOptions);
      
      // Procesar y combinar resultados
      const processedResults = await this.processSearchResults(searchResults, searchQuery, searchOptions);
      
      // Cachear resultados combinados
      if (this.cacheService && processedResults.results.length > 0) {
        await this.cacheSearchResults(searchQuery, processedResults, searchOptions);
      }

      return this.formatSearchResponse(processedResults, searchQuery, searchOptions, false);
    } catch (error) {
      throw new SearchRepositoryError(
        `Error en búsqueda de torrents: ${error.message}`,
        error
      );
    }
  }

  /**
   * Busca torrents en un proveedor específico
   * @param {Object} searchParams - Parámetros de búsqueda
   * @param {string} providerId - ID del proveedor
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object>}
   */
  async searchInProvider(searchParams, providerId, options = {}) {
    const repository = this.searchRepositories.get(providerId);
    if (!repository) {
      throw new SearchRepositoryError(`Proveedor no encontrado: ${providerId}`);
    }

    const searchQuery = this.createSearchQuery(searchParams);
    const searchOptions = { ...options, providers: [providerId] };

    try {
      const results = await repository.searchTorrents(searchQuery);
      const processedResults = {
        results: this.sortResults(results, searchOptions.sortBy || 'quality'),
        totalResults: results.length,
        providers: [{ id: providerId, resultCount: results.length, status: 'success' }]
      };

      return this.formatSearchResponse(processedResults, searchQuery, searchOptions, false);
    } catch (error) {
      throw new SearchRepositoryError(
        `Error buscando en proveedor ${providerId}: ${error.message}`,
        error,
        providerId
      );
    }
  }

  /**
   * Obtiene sugerencias de búsqueda basadas en el término
   * @param {string} term - Término de búsqueda
   * @param {string} type - Tipo de contenido
   * @returns {Promise<string[]>}
   */
  async getSearchSuggestions(term, type = 'movie') {
    if (!term || term.length < 2) {
      return [];
    }

    try {
      // Buscar en cache de búsquedas anteriores
      const cacheKey = `suggestions:${type}:${term.toLowerCase()}`;
      if (this.cacheService) {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      }

      // Generar sugerencias básicas
      const suggestions = this.generateBasicSuggestions(term, type);
      
      // Cachear sugerencias
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, suggestions, 3600); // 1 hora
      }

      return suggestions;
    } catch (error) {
      console.warn(`Error generando sugerencias: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene estadísticas de proveedores
   * @returns {Promise<Object>}
   */
  async getProviderStats() {
    const stats = {
      totalProviders: this.searchRepositories.size,
      availableProviders: 0,
      providers: []
    };

    for (const [providerId, repository] of this.searchRepositories) {
      try {
        const isAvailable = await repository.isProviderAvailable(providerId);
        const provider = await repository.getProviderById(providerId);
        
        stats.providers.push({
          id: providerId,
          name: provider?.name || providerId,
          available: isAvailable,
          language: provider?.language || 'unknown',
          priority: provider?.priority || 0,
          capabilities: provider?.capabilities || {}
        });

        if (isAvailable) {
          stats.availableProviders++;
        }
      } catch (error) {
        stats.providers.push({
          id: providerId,
          name: providerId,
          available: false,
          error: error.message
        });
      }
    }

    return stats;
  }

  /**
   * Limpia cache expirado
   * @returns {Promise<number>}
   */
  async cleanExpiredCache() {
    if (!this.cacheService) return 0;
    
    let totalCleaned = 0;
    for (const repository of this.searchRepositories.values()) {
      try {
        const cleaned = await repository.cleanExpiredCache();
        totalCleaned += cleaned;
      } catch (error) {
        console.warn(`Error limpiando cache: ${error.message}`);
      }
    }
    
    return totalCleaned;
  }

  // Métodos privados

  /**
   * Crea una consulta de búsqueda validada
   * @param {Object} searchParams - Parámetros de búsqueda
   * @returns {SearchQuery}
   */
  createSearchQuery(searchParams) {
    try {
      return new SearchQuery(searchParams);
    } catch (error) {
      throw new SearchRepositoryError(
        `Parámetros de búsqueda inválidos: ${error.message}`,
        error
      );
    }
  }

  /**
   * Obtiene proveedores por defecto
   * @returns {string[]}
   */
  getDefaultProviders() {
    const config = this.configService?.get('torrent.defaultProviders');
    if (config && Array.isArray(config)) {
      return config;
    }
    
    // Retornar todos los proveedores disponibles ordenados por prioridad
    return Array.from(this.searchRepositories.keys());
  }

  /**
   * Realiza búsquedas en paralelo
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Array>}
   */
  async performParallelSearches(searchQuery, options) {
    const searchPromises = options.providers
      .filter(providerId => this.searchRepositories.has(providerId))
      .slice(0, this.maxConcurrentSearches)
      .map(async (providerId) => {
        const repository = this.searchRepositories.get(providerId);
        const startTime = Date.now();
        
        try {
          const results = await Promise.race([
            repository.searchTorrents(searchQuery),
            new Promise((_, reject) => 
              setTimeout(() => reject(new SearchTimeoutError(providerId, options.timeout)), options.timeout)
            )
          ]);
          
          return {
            providerId,
            results,
            status: 'success',
            responseTime: Date.now() - startTime,
            resultCount: results.length
          };
        } catch (error) {
          return {
            providerId,
            results: [],
            status: 'error',
            error: error.message,
            responseTime: Date.now() - startTime,
            resultCount: 0
          };
        }
      });

    return Promise.all(searchPromises);
  }

  /**
   * Procesa y combina resultados de búsqueda
   * @param {Array} searchResults - Resultados de búsquedas
   * @param {SearchQuery} searchQuery - Consulta original
   * @param {Object} options - Opciones de búsqueda
   * @returns {Object}
   */
  async processSearchResults(searchResults, searchQuery, options) {
    let allResults = [];
    const providerStats = [];

    // Combinar resultados de todos los proveedores
    for (const searchResult of searchResults) {
      allResults = allResults.concat(searchResult.results);
      providerStats.push({
        id: searchResult.providerId,
        status: searchResult.status,
        resultCount: searchResult.resultCount,
        responseTime: searchResult.responseTime,
        error: searchResult.error
      });
    }

    // Filtrar duplicados si está habilitado
    if (options.filterDuplicates) {
      allResults = this.removeDuplicates(allResults);
    }

    // Ordenar resultados
    const sortedResults = this.sortResults(allResults, options.sortBy);

    // Limitar resultados
    const limitedResults = sortedResults.slice(0, options.maxResults);

    return {
      results: limitedResults,
      totalResults: allResults.length,
      providers: providerStats
    };
  }

  /**
   * Elimina resultados duplicados
   * @param {Array} results - Resultados a filtrar
   * @returns {Array}
   */
  removeDuplicates(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = result.infoHash || `${result.title}-${result.size}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Ordena resultados según criterio
   * @param {Array} results - Resultados a ordenar
   * @param {string} sortBy - Criterio de ordenación
   * @returns {Array}
   */
  sortResults(results, sortBy) {
    switch (sortBy) {
      case 'quality':
        return results.sort((a, b) => b.getQualityScore() - a.getQualityScore());
      case 'seeders':
        return results.sort((a, b) => b.seeders - a.seeders);
      case 'size':
        return results.sort((a, b) => this.compareSizes(b.size, a.size));
      case 'date':
        return results.sort((a, b) => {
          const dateA = a.uploadDate ? new Date(a.uploadDate) : new Date(0);
          const dateB = b.uploadDate ? new Date(b.uploadDate) : new Date(0);
          return dateB - dateA;
        });
      default:
        return results;
    }
  }

  /**
   * Compara tamaños de archivos
   * @param {string} sizeA - Tamaño A
   * @param {string} sizeB - Tamaño B
   * @returns {number}
   */
  compareSizes(sizeA, sizeB) {
    const parseSize = (size) => {
      if (!size || size === 'Desconocido') return 0;
      const match = size.match(/([0-9.,]+)\s*(GB|MB|KB|TB)/i);
      if (!match) return 0;
      
      const value = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toUpperCase();
      
      const multipliers = { KB: 1, MB: 1024, GB: 1024 * 1024, TB: 1024 * 1024 * 1024 };
      return value * (multipliers[unit] || 1);
    };
    
    return parseSize(sizeA) - parseSize(sizeB);
  }

  /**
   * Genera sugerencias básicas
   * @param {string} term - Término de búsqueda
   * @param {string} type - Tipo de contenido
   * @returns {string[]}
   */
  generateBasicSuggestions(term, type) {
    const suggestions = [term];
    
    // Agregar variaciones comunes
    if (type === 'movie') {
      suggestions.push(
        `${term} 1080p`,
        `${term} 720p`,
        `${term} 4K`,
        `${term} BluRay`
      );
    } else if (type === 'series') {
      suggestions.push(
        `${term} S01`,
        `${term} temporada completa`,
        `${term} serie completa`
      );
    }
    
    return suggestions.slice(0, 5);
  }

  /**
   * Obtiene resultados cacheados
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object|null>}
   */
  async getCachedResults(searchQuery, options) {
    const cacheKey = `search:${searchQuery.getCacheKey()}:${JSON.stringify(options.providers.sort())}`;
    return this.cacheService.get(cacheKey);
  }

  /**
   * Cachea resultados de búsqueda
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} results - Resultados a cachear
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<void>}
   */
  async cacheSearchResults(searchQuery, results, options) {
    const cacheKey = `search:${searchQuery.getCacheKey()}:${JSON.stringify(options.providers.sort())}`;
    const ttl = this.configService?.get('torrent.cache.searchTtl') || 1800; // 30 minutos
    await this.cacheService.set(cacheKey, results, ttl);
  }

  /**
   * Formatea la respuesta de búsqueda
   * @param {Object} results - Resultados procesados
   * @param {SearchQuery} searchQuery - Consulta original
   * @param {Object} options - Opciones de búsqueda
   * @param {boolean} fromCache - Si viene del cache
   * @returns {Object}
   */
  formatSearchResponse(results, searchQuery, options, fromCache) {
    const response = {
      query: {
        term: searchQuery.term,
        type: searchQuery.type,
        imdbId: searchQuery.imdbId,
        year: searchQuery.year,
        quality: searchQuery.quality,
        language: searchQuery.language
      },
      results: results.results.map(result => result.toStremioStream()),
      totalResults: results.totalResults,
      fromCache,
      timestamp: new Date().toISOString()
    };

    if (options.includeStats) {
      response.stats = {
        providers: results.providers,
        searchTime: results.providers.reduce((sum, p) => sum + (p.responseTime || 0), 0),
        successfulProviders: results.providers.filter(p => p.status === 'success').length
      };
    }

    return response;
  }
}