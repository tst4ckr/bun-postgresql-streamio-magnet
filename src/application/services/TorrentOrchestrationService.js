/**
 * @fileoverview TorrentOrchestrationService - Servicio de orquestación para búsquedas automatizadas
 * Coordina múltiples proveedores, agrega resultados y optimiza para formato Stremio
 */

import { TermExtractionService } from '../../domain/services/TermExtractionService.js';

export class TorrentOrchestrationService {
  constructor(torrentSearchService, cacheService, config) {
    this.torrentSearchService = torrentSearchService;
    this.cacheService = cacheService;
    this.config = config;
    this.termExtractor = new TermExtractionService();
    
    // Configuración de orquestación
    this.orchestrationConfig = {
      maxConcurrentSearches: 3,
      searchTimeout: 30000, // 30 segundos
      minResultsThreshold: 5,
      qualityPriority: ['4K', '1080p', '720p', '480p'],
      languagePriority: ['español', 'latino', 'castellano', 'english'],
      providerWeights: {
        mejortorrent: 1.0,
        wolfmax4k: 0.8,
        cinecalidad: 0.6
      }
    };
  }

  /**
   * Realiza búsqueda orquestada con múltiples estrategias
   * @param {string} query - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object>} Resultados agregados y optimizados
   */
  async orchestratedSearch(query, options = {}) {
    const {
      type = 'movie',
      imdbId = null,
      maxResults = 50,
      includeMetadata = true,
      enableSmartSearch = true,
      cacheResults = true
    } = options;

    try {
      // Generar clave de cache
      const cacheKey = this.generateCacheKey(query, options);
      
      // Verificar cache
      if (cacheResults) {
        const cachedResults = this.cacheService.get(cacheKey);
        if (cachedResults) {
          console.log(`Cache hit para búsqueda: ${query}`);
          return this.enhanceResults(cachedResults, { fromCache: true });
        }
      }

      console.log(`Iniciando búsqueda orquestada: ${query}`);
      const startTime = Date.now();

      // Estrategia de búsqueda inteligente
      const searchStrategies = enableSmartSearch 
        ? await this.generateSearchStrategies(query, type)
        : [{ query, weight: 1.0 }];

      // Ejecutar búsquedas en paralelo
      const searchPromises = searchStrategies.map(strategy => 
        this.executeSearchStrategy(strategy, options)
      );

      const strategyResults = await Promise.allSettled(searchPromises);
      
      // Agregar y procesar resultados
      const aggregatedResults = this.aggregateResults(strategyResults, query);
      
      // Optimizar para Stremio
      const optimizedResults = this.optimizeForStremio(aggregatedResults, {
        type,
        imdbId,
        maxResults
      });

      // Agregar metadata
      const finalResults = {
        ...optimizedResults,
        metadata: {
          query,
          type,
          imdbId,
          searchTime: Date.now() - startTime,
          strategiesUsed: searchStrategies.length,
          totalResults: optimizedResults.streams?.length || 0,
          providersUsed: this.getUsedProviders(strategyResults),
          generatedAt: new Date().toISOString()
        }
      };

      // Cachear resultados
      if (cacheResults && finalResults.streams?.length > 0) {
        this.cacheService.set(cacheKey, finalResults, 1800); // 30 minutos
      }

      console.log(`Búsqueda completada: ${finalResults.streams?.length || 0} resultados en ${finalResults.metadata.searchTime}ms`);
      return finalResults;

    } catch (error) {
      console.error('Error en búsqueda orquestada:', error.message);
      return this.createErrorResponse(query, error);
    }
  }

  /**
   * Búsqueda automatizada basada en contenido de archivos
   * @param {string[]} filePaths - Rutas de archivos a analizar
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object[]>} Array de resultados de búsqueda
   */
  async automatedSearch(filePaths, options = {}) {
    const {
      maxQueriesPerFile = 5,
      batchSize = 3,
      delayBetweenBatches = 2000
    } = options;

    try {
      console.log(`Iniciando búsqueda automatizada para ${filePaths.length} archivos`);
      
      // Extraer términos de todos los archivos
      const extractedTerms = await this.termExtractor.extractFromFiles(filePaths);
      
      // Generar consultas optimizadas
      const queries = this.termExtractor.generateSearchQueries(extractedTerms, {
        maxQueries: maxQueriesPerFile * filePaths.length
      });

      console.log(`Generadas ${queries.length} consultas de búsqueda`);

      // Ejecutar búsquedas en lotes
      const results = [];
      for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);
        
        const batchPromises = batch.map(query => 
          this.orchestratedSearch(query, {
            ...options,
            enableSmartSearch: false // Ya tenemos consultas optimizadas
          })
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.streams?.length > 0) {
            results.push(result.value);
          }
        }

        // Delay entre lotes para evitar sobrecarga
        if (i + batchSize < queries.length) {
          await this.delay(delayBetweenBatches);
        }
      }

      console.log(`Búsqueda automatizada completada: ${results.length} resultados exitosos`);
      return results;

    } catch (error) {
      console.error('Error en búsqueda automatizada:', error.message);
      return [];
    }
  }

  /**
   * Obtiene estadísticas de rendimiento de proveedores
   * @returns {Promise<Object>} Estadísticas detalladas
   */
  async getProviderStats() {
    try {
      const providers = await this.torrentSearchService.getAvailableProviders();
      const stats = {
        totalProviders: providers.length,
        enabledProviders: providers.filter(p => p.enabled).length,
        providerDetails: {},
        aggregatedStats: {
          totalSearches: 0,
          totalResults: 0,
          averageResponseTime: 0,
          successRate: 0
        }
      };

      for (const provider of providers) {
        const providerStats = await this.torrentSearchService.getProviderStats(provider.id);
        stats.providerDetails[provider.id] = {
          ...providerStats,
          weight: this.orchestrationConfig.providerWeights[provider.id] || 0.5,
          priority: this.getProviderPriority(provider.id)
        };
        
        // Agregar a estadísticas globales
        stats.aggregatedStats.totalSearches += providerStats.searches || 0;
        stats.aggregatedStats.totalResults += providerStats.results || 0;
      }

      // Calcular promedios
      if (stats.aggregatedStats.totalSearches > 0) {
        stats.aggregatedStats.averageResponseTime = 
          Object.values(stats.providerDetails)
            .reduce((sum, p) => sum + (p.averageResponseTime || 0), 0) / providers.length;
        
        stats.aggregatedStats.successRate = 
          (stats.aggregatedStats.totalResults / stats.aggregatedStats.totalSearches) * 100;
      }

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error.message);
      return { error: error.message };
    }
  }

  // Métodos privados

  /**
   * Genera estrategias de búsqueda inteligentes
   * @param {string} query - Consulta original
   * @param {string} type - Tipo de contenido
   * @returns {Promise<Object[]>} Array de estrategias
   */
  async generateSearchStrategies(query, type) {
    const strategies = [{ query, weight: 1.0 }]; // Estrategia base

    try {
      // Extraer términos de la consulta
      const terms = this.termExtractor.extractTerms(query);
      
      // Estrategias basadas en títulos
      for (const title of terms.titles.slice(0, 2)) {
        if (title !== query.toLowerCase()) {
          strategies.push({ query: title, weight: 0.8 });
        }
      }

      // Estrategias con modificadores de calidad
      if (type === 'movie') {
        strategies.push({ query: `${query} 1080p`, weight: 0.7 });
        strategies.push({ query: `${query} 4K`, weight: 0.6 });
      }

      // Estrategias con idioma
      strategies.push({ query: `${query} español`, weight: 0.6 });
      strategies.push({ query: `${query} latino`, weight: 0.5 });

      return strategies.slice(0, 5); // Máximo 5 estrategias
    } catch (error) {
      console.warn('Error generando estrategias:', error.message);
      return strategies;
    }
  }

  /**
   * Ejecuta una estrategia de búsqueda específica
   * @param {Object} strategy - Estrategia a ejecutar
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Object>} Resultados de la estrategia
   */
  async executeSearchStrategy(strategy, options) {
    try {
      const results = await Promise.race([
        this.torrentSearchService.search(strategy.query, options),
        this.createTimeoutPromise(this.orchestrationConfig.searchTimeout)
      ]);

      return {
        strategy,
        results: results || [],
        success: true,
        responseTime: Date.now()
      };
    } catch (error) {
      return {
        strategy,
        results: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Agrega resultados de múltiples estrategias
   * @param {Object[]} strategyResults - Resultados de estrategias
   * @param {string} originalQuery - Consulta original
   * @returns {Object[]} Resultados agregados
   */
  aggregateResults(strategyResults, originalQuery) {
    const allResults = [];
    const seenHashes = new Set();

    for (const strategyResult of strategyResults) {
      if (strategyResult.status !== 'fulfilled' || !strategyResult.value.success) {
        continue;
      }

      const { strategy, results } = strategyResult.value;
      
      for (const result of results) {
        // Evitar duplicados basados en hash del torrent
        const resultHash = this.generateResultHash(result);
        if (seenHashes.has(resultHash)) {
          continue;
        }
        seenHashes.add(resultHash);

        // Calcular puntuación basada en estrategia y calidad
        const score = this.calculateResultScore(result, strategy, originalQuery);
        
        allResults.push({
          ...result,
          score,
          strategy: strategy.query,
          weight: strategy.weight
        });
      }
    }

    // Ordenar por puntuación
    return allResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Optimiza resultados para formato Stremio
   * @param {Object[]} results - Resultados agregados
   * @param {Object} options - Opciones de optimización
   * @returns {Object} Resultados en formato Stremio
   */
  optimizeForStremio(results, options) {
    const { type, imdbId, maxResults } = options;
    
    const streams = results
      .slice(0, maxResults)
      .map(result => this.convertToStremioStream(result, type))
      .filter(stream => stream !== null)
      .sort((a, b) => {
        // Priorizar streams con más seeders
        const seedersA = a._meta?.seeders || 0;
        const seedersB = b._meta?.seeders || 0;
        return seedersB - seedersA;
      });

    return {
      streams,
      cacheMaxAge: 1800, // 30 minutos
      staleRevalidate: 3600, // 1 hora
      staleError: 86400 // 24 horas
    };
  }

  /**
   * Convierte resultado a formato stream de Stremio
   * @param {Object} result - Resultado del torrent
   * @param {string} type - Tipo de contenido
   * @returns {Object|null} Stream en formato Stremio
   */
  convertToStremioStream(result, type) {
    try {
      // Si el resultado ya es un TorrentResult, usar su método toStremioStream
      if (result.toStremioStream && typeof result.toStremioStream === 'function') {
        return result.toStremioStream();
      }
      
      // Fallback para resultados que no son TorrentResult
      const title = this.buildStreamTitle(result);
      
      const stream = {
        name: this.buildStreamName(result),
        description: title,
        infoHash: result.infoHash,
        sources: this.buildSources(result),
        behaviorHints: {
          bingeGroup: `${result.provider}-${result.quality}`,
          countryWhitelist: ['esp', 'arg', 'mex', 'col', 'chl', 'per', 'ven'],
          notWebReady: true
        }
      };
      
      // Agregar fileIdx si está disponible
      if (result.fileIndex !== undefined) {
        stream.fileIdx = result.fileIndex;
      }
      
      // Agregar URL magnet como fallback
      if (result.magnetLink || result.torrentUrl) {
        stream.url = result.magnetLink || result.torrentUrl;
      }
      
      return stream;
    } catch (error) {
      console.warn('Error convirtiendo a stream Stremio:', error.message);
      return null;
    }
  }

  /**
   * Construye el título del stream
   * @param {Object} result - Resultado del torrent
   * @returns {string} Título formateado
   */
  buildStreamTitle(result) {
    const parts = [];
    
    if (result.quality) parts.push(result.quality);
    if (result.language) parts.push(result.language);
    if (result.size) parts.push(result.size);
    if (result.seeders) parts.push(`👥 ${result.seeders}`);
    
    return parts.join(' | ');
  }

  /**
   * Construye el nombre del stream para Stremio
   * @param {Object} result - Resultado del torrent
   * @returns {string} Nombre del stream
   */
  buildStreamName(result) {
    const parts = [];
    
    // Calidad
    if (result.quality) {
      parts.push(result.quality);
    }
    
    // Tamaño
    if (result.size) {
      parts.push(result.size);
    }
    
    // Seeders si están disponibles
    if (result.seeders > 0) {
      parts.push(`👥${result.seeders}`);
    }
    
    // Verificado
    if (result.verified) {
      parts.push('✅');
    }
    
    // Proveedor
    if (result.provider) {
      parts.push(`[${result.provider}]`);
    }
    
    return parts.join(' ');
  }

  /**
   * Construye las fuentes para el torrent
   * @param {Object} result - Resultado del torrent
   * @returns {string[]} Array de fuentes
   */
  buildSources(result) {
    const sources = [];
    
    // Agregar trackers comunes para mejorar conectividad
    const commonTrackers = [
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.opentrackr.org:1337',
      'udp://9.rarbg.to:2710',
      'udp://exodus.desync.com:6969',
      'udp://tracker.torrent.eu.org:451',
      'udp://open.stealth.si:80'
    ];
    
    commonTrackers.forEach(tracker => {
      sources.push(`tracker:${tracker}`);
    });
    
    return sources;
  }

  /**
   * Calcula puntuación de resultado
   * @param {Object} result - Resultado a puntuar
   * @param {Object} strategy - Estrategia utilizada
   * @param {string} originalQuery - Consulta original
   * @returns {number} Puntuación calculada
   */
  calculateResultScore(result, strategy, originalQuery) {
    let score = 0;

    // Puntuación base por estrategia
    score += strategy.weight * 100;

    // Puntuación por calidad
    const qualityIndex = this.orchestrationConfig.qualityPriority.indexOf(result.quality);
    if (qualityIndex !== -1) {
      score += (this.orchestrationConfig.qualityPriority.length - qualityIndex) * 10;
    }

    // Puntuación por seeders
    if (result.seeders) {
      score += Math.min(result.seeders * 2, 50);
    }

    // Puntuación por proveedor
    const providerWeight = this.orchestrationConfig.providerWeights[result.provider] || 0.5;
    score *= providerWeight;

    // Penalización por tamaño excesivo (>10GB)
    if (result.sizeBytes && result.sizeBytes > 10 * 1024 * 1024 * 1024) {
      score *= 0.8;
    }

    return Math.round(score);
  }

  /**
   * Genera hash único para resultado
   * @param {Object} result - Resultado a hashear
   * @returns {string} Hash único
   */
  generateResultHash(result) {
    const hashInput = `${result.title}-${result.size}-${result.provider}`;
    return Buffer.from(hashInput).toString('base64').slice(0, 16);
  }

  /**
   * Genera clave de cache
   * @param {string} query - Consulta
   * @param {Object} options - Opciones
   * @returns {string} Clave de cache
   */
  generateCacheKey(query, options) {
    const keyParts = [
      'orchestrated',
      query.toLowerCase().replace(/\s+/g, '-'),
      options.type || 'movie',
      options.maxResults || 50
    ];
    return keyParts.join(':');
  }

  /**
   * Obtiene proveedores utilizados
   * @param {Object[]} strategyResults - Resultados de estrategias
   * @returns {string[]} Lista de proveedores
   */
  getUsedProviders(strategyResults) {
    const providers = new Set();
    
    for (const result of strategyResults) {
      if (result.status === 'fulfilled' && result.value.success) {
        for (const torrent of result.value.results) {
          if (torrent.provider) {
            providers.add(torrent.provider);
          }
        }
      }
    }
    
    return Array.from(providers);
  }

  /**
   * Obtiene prioridad de proveedor
   * @param {string} providerId - ID del proveedor
   * @returns {number} Prioridad (1-10)
   */
  getProviderPriority(providerId) {
    const priorities = {
      mejortorrent: 10,
      wolfmax4k: 8,
      cinecalidad: 6
    };
    return priorities[providerId] || 5;
  }

  /**
   * Mejora resultados con metadata adicional
   * @param {Object} results - Resultados a mejorar
   * @param {Object} options - Opciones de mejora
   * @returns {Object} Resultados mejorados
   */
  enhanceResults(results, options = {}) {
    return {
      ...results,
      metadata: {
        ...results.metadata,
        enhanced: true,
        enhancedAt: new Date().toISOString(),
        ...options
      }
    };
  }

  /**
   * Crea respuesta de error
   * @param {string} query - Consulta que falló
   * @param {Error} error - Error ocurrido
   * @returns {Object} Respuesta de error
   */
  createErrorResponse(query, error) {
    return {
      streams: [],
      error: {
        message: error.message,
        query,
        timestamp: new Date().toISOString()
      },
      metadata: {
        query,
        searchTime: 0,
        totalResults: 0,
        success: false
      }
    };
  }

  /**
   * Crea promesa con timeout
   * @param {number} timeout - Timeout en ms
   * @returns {Promise} Promesa que rechaza después del timeout
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), timeout);
    });
  }

  /**
   * Delay asíncrono
   * @param {number} ms - Milisegundos a esperar
   * @returns {Promise} Promesa que resuelve después del delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}