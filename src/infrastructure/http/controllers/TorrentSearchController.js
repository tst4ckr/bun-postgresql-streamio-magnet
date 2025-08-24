import { TorrentSearchService } from '../../../application/services/TorrentSearchService.js';
import { SearchRepositoryError } from '../../../domain/repositories/TorrentSearchRepository.js';

/**
 * @fileoverview TorrentSearchController - Controlador HTTP para búsqueda de torrents
 * Maneja las peticiones HTTP y las convierte al formato esperado por Stremio
 */

export class TorrentSearchController {
  constructor(torrentSearchService, logger = console) {
    this.torrentSearchService = torrentSearchService;
    this.logger = logger;
  }

  /**
   * Manifiesto del addon para Stremio
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getManifest(req, res) {
    try {
      const manifest = {
        id: 'org.torrent.search.addon',
        version: '1.0.0',
        name: 'Torrent Search Addon',
        description: 'Addon para búsqueda de torrents en múltiples proveedores',
        logo: 'https://via.placeholder.com/256x256/000000/FFFFFF?text=TS',
        background: 'https://via.placeholder.com/1920x1080/1a1a1a/FFFFFF?text=Torrent+Search',
        resources: [
          {
            name: 'stream',
            types: ['movie', 'series'],
            idPrefixes: ['tt']
          }
        ],
        types: ['movie', 'series'],
        catalogs: [],
        behaviorHints: {
          configurable: true,
          configurationRequired: false
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(200).json(manifest);
    } catch (error) {
      this.handleError(res, error, 'Error obteniendo manifiesto');
    }
  }

  /**
   * Busca streams para un contenido específico
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getStreams(req, res) {
    try {
      const { type, id } = req.params;
      const { season, episode } = req.query;

      // Validar parámetros
      if (!type || !id) {
        return res.status(400).json({
          error: 'Parámetros requeridos: type, id'
        });
      }

      if (!['movie', 'series'].includes(type)) {
        return res.status(400).json({
          error: 'Tipo debe ser movie o series'
        });
      }

      // Extraer IMDB ID
      const imdbId = this.extractImdbId(id);
      if (!imdbId) {
        return res.status(400).json({
          error: 'ID debe ser un IMDB ID válido (formato: tt1234567)'
        });
      }

      // Construir parámetros de búsqueda
      const searchParams = {
        imdbId,
        type
      };

      // Agregar temporada y episodio para series
      if (type === 'series') {
        if (season) searchParams.season = parseInt(season);
        if (episode) searchParams.episode = parseInt(episode);
      }

      // Configurar opciones de búsqueda
      const searchOptions = {
        maxResults: 50,
        timeout: 30000,
        sortBy: 'quality',
        filterDuplicates: true,
        includeStats: false
      };

      // Realizar búsqueda
      const searchResult = await this.torrentSearchService.searchTorrents(searchParams, searchOptions);

      // Formatear respuesta para Stremio
      const stremioResponse = {
        streams: searchResult.results || []
      };

      // Headers para Stremio
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Cache-Control', 'public, max-age=1800'); // 30 minutos

      res.status(200).json(stremioResponse);

      // Log de la búsqueda
      this.logger.info(`Búsqueda completada: ${type}/${imdbId} - ${searchResult.results.length} streams encontrados`);
    } catch (error) {
      this.handleError(res, error, 'Error buscando streams');
    }
  }

  /**
   * Busca torrents con parámetros personalizados
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async searchTorrents(req, res) {
    try {
      const {
        term,
        type = 'movie',
        imdbId,
        year,
        quality,
        language = 'es',
        season,
        episode,
        provider,
        maxResults = 50,
        sortBy = 'quality'
      } = req.query;

      // Validar parámetros mínimos
      if (!term && !imdbId) {
        return res.status(400).json({
          error: 'Se requiere term o imdbId'
        });
      }

      // Construir parámetros de búsqueda
      const searchParams = {
        type,
        language
      };

      if (term) searchParams.term = term;
      if (imdbId) searchParams.imdbId = imdbId;
      if (year) searchParams.year = parseInt(year);
      if (quality) searchParams.quality = quality;
      if (season) searchParams.season = parseInt(season);
      if (episode) searchParams.episode = parseInt(episode);

      // Configurar opciones
      const searchOptions = {
        maxResults: Math.min(parseInt(maxResults), 100),
        timeout: 30000,
        sortBy,
        filterDuplicates: true,
        includeStats: true
      };

      if (provider) {
        searchOptions.providers = [provider];
      }

      // Realizar búsqueda
      const searchResult = await this.torrentSearchService.searchTorrents(searchParams, searchOptions);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(200).json(searchResult);
    } catch (error) {
      this.handleError(res, error, 'Error en búsqueda personalizada');
    }
  }

  /**
   * Busca en un proveedor específico
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async searchInProvider(req, res) {
    try {
      const { providerId } = req.params;
      const searchParams = req.body || req.query;

      if (!providerId) {
        return res.status(400).json({
          error: 'Provider ID requerido'
        });
      }

      if (!searchParams.term && !searchParams.imdbId) {
        return res.status(400).json({
          error: 'Se requiere term o imdbId'
        });
      }

      const searchOptions = {
        maxResults: 50,
        timeout: 30000,
        sortBy: 'quality',
        includeStats: true
      };

      const searchResult = await this.torrentSearchService.searchInProvider(
        searchParams,
        providerId,
        searchOptions
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(searchResult);
    } catch (error) {
      this.handleError(res, error, `Error buscando en proveedor ${req.params.providerId}`);
    }
  }

  /**
   * Obtiene sugerencias de búsqueda
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getSuggestions(req, res) {
    try {
      const { term, type = 'movie' } = req.query;

      if (!term || term.length < 2) {
        return res.status(400).json({
          error: 'Term debe tener al menos 2 caracteres'
        });
      }

      const suggestions = await this.torrentSearchService.getSearchSuggestions(term, type);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hora
      res.status(200).json({ suggestions });
    } catch (error) {
      this.handleError(res, error, 'Error obteniendo sugerencias');
    }
  }

  /**
   * Obtiene estadísticas de proveedores
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getProviderStats(req, res) {
    try {
      const stats = await this.torrentSearchService.getProviderStats();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutos
      res.status(200).json(stats);
    } catch (error) {
      this.handleError(res, error, 'Error obteniendo estadísticas');
    }
  }

  /**
   * Limpia cache expirado
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async cleanCache(req, res) {
    try {
      const cleaned = await this.torrentSearchService.cleanExpiredCache();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json({
        message: 'Cache limpiado exitosamente',
        entriesRemoved: cleaned
      });
    } catch (error) {
      this.handleError(res, error, 'Error limpiando cache');
    }
  }

  /**
   * Health check endpoint
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async healthCheck(req, res) {
    try {
      const stats = await this.torrentSearchService.getProviderStats();
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        providers: {
          total: stats.totalProviders,
          available: stats.availableProviders
        },
        uptime: process.uptime()
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(health);
    } catch (error) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  // Métodos auxiliares

  /**
   * Extrae IMDB ID del parámetro
   * @param {string} id - ID parameter
   * @returns {string|null}
   */
  extractImdbId(id) {
    if (!id) return null;
    
    // Si ya es un IMDB ID válido
    if (/^tt\d{7,}$/.test(id)) {
      return id;
    }
    
    // Intentar extraer de URL o formato extendido
    const match = id.match(/tt\d{7,}/);
    return match ? match[0] : null;
  }

  /**
   * Maneja errores de forma consistente
   * @param {Object} res - Response object
   * @param {Error} error - Error object
   * @param {string} message - Mensaje de contexto
   */
  handleError(res, error, message) {
    this.logger.error(`${message}:`, error);

    let statusCode = 500;
    let errorMessage = 'Error interno del servidor';

    if (error instanceof SearchRepositoryError) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = `Datos inválidos: ${error.message}`;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      statusCode = 503;
      errorMessage = 'Servicio no disponible temporalmente';
    } else if (error.code === 'ETIMEDOUT') {
      statusCode = 408;
      errorMessage = 'Tiempo de espera agotado';
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(statusCode).json({
      error: errorMessage,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }

  /**
   * Middleware para CORS
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  corsMiddleware(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  }

  /**
   * Middleware para logging de requests
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  requestLogger(req, res, next) {
    const start = Date.now();
    const originalSend = res.send;

    res.send = function(data) {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
      originalSend.call(this, data);
    };

    next();
  }
}