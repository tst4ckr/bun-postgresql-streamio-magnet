import { Router } from 'express';
import { TorrentSearchController } from '../controllers/TorrentSearchController.js';

/**
 * @fileoverview torrentRoutes - Definición de rutas para búsqueda de torrents
 * Compatible con el formato de addon de Stremio
 */

/**
 * Crea las rutas para el sistema de búsqueda de torrents
 * @param {TorrentSearchService} torrentSearchService - Servicio de búsqueda
 * @param {Object} logger - Logger opcional
 * @returns {Router}
 */
export function createTorrentRoutes(torrentSearchService, logger = console) {
  const router = Router();
  const controller = new TorrentSearchController(torrentSearchService, logger);

  // Middleware global para CORS
  router.use(controller.corsMiddleware.bind(controller));
  
  // Middleware para logging (opcional)
  if (process.env.NODE_ENV === 'development') {
    router.use(controller.requestLogger.bind(controller));
  }

  // === RUTAS PRINCIPALES DE STREMIO ===

  /**
   * GET /manifest.json
   * Manifiesto del addon para Stremio
   */
  router.get('/manifest.json', controller.getManifest.bind(controller));

  /**
   * GET /stream/:type/:id.json
   * Obtiene streams para un contenido específico
   * Parámetros:
   * - type: 'movie' o 'series'
   * - id: IMDB ID (formato: tt1234567)
   * Query params opcionales:
   * - season: número de temporada (solo para series)
   * - episode: número de episodio (solo para series)
   */
  router.get('/stream/:type/:id.json', controller.getStreams.bind(controller));

  // === RUTAS DE API EXTENDIDA ===

  /**
   * GET /api/search
   * Búsqueda personalizada de torrents
   * Query params:
   * - term: término de búsqueda (requerido si no hay imdbId)
   * - imdbId: IMDB ID (requerido si no hay term)
   * - type: 'movie' o 'series' (default: 'movie')
   * - year: año de lanzamiento
   * - quality: calidad deseada (SD, 720p, 1080p, 4K)
   * - language: idioma (default: 'es')
   * - season: temporada (solo para series)
   * - episode: episodio (solo para series)
   * - provider: proveedor específico
   * - maxResults: máximo número de resultados (default: 50, max: 100)
   * - sortBy: criterio de ordenación ('quality', 'seeders', 'size', 'date')
   */
  router.get('/api/search', controller.searchTorrents.bind(controller));

  /**
   * POST /api/search
   * Búsqueda personalizada de torrents (método POST)
   * Body: mismo formato que query params de GET
   */
  router.post('/api/search', controller.searchTorrents.bind(controller));

  /**
   * GET /api/providers/:providerId/search
   * Búsqueda en un proveedor específico
   * Parámetros:
   * - providerId: ID del proveedor (mejortorrent, wolfmax4k, cinecalidad)
   * Query params: mismos que /api/search
   */
  router.get('/api/providers/:providerId/search', controller.searchInProvider.bind(controller));

  /**
   * POST /api/providers/:providerId/search
   * Búsqueda en un proveedor específico (método POST)
   */
  router.post('/api/providers/:providerId/search', controller.searchInProvider.bind(controller));

  /**
   * GET /api/suggestions
   * Obtiene sugerencias de búsqueda
   * Query params:
   * - term: término parcial (mínimo 2 caracteres)
   * - type: 'movie' o 'series' (default: 'movie')
   */
  router.get('/api/suggestions', controller.getSuggestions.bind(controller));

  /**
   * GET /api/providers/stats
   * Obtiene estadísticas de proveedores
   */
  router.get('/api/providers/stats', controller.getProviderStats.bind(controller));

  /**
   * POST /api/cache/clean
   * Limpia cache expirado
   */
  router.post('/api/cache/clean', controller.cleanCache.bind(controller));

  /**
   * GET /api/health
   * Health check del servicio
   */
  router.get('/api/health', controller.healthCheck.bind(controller));

  // === RUTAS DE COMPATIBILIDAD ===

  /**
   * GET /
   * Ruta raíz - redirige al manifiesto
   */
  router.get('/', (req, res) => {
    res.redirect('/manifest.json');
  });

  /**
   * GET /configure
   * Página de configuración (placeholder)
   */
  router.get('/configure', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Torrent Search Addon - Configuración</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a1a; color: white; }
          .container { max-width: 600px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 40px; }
          .info { background: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
          .provider { background: #333; padding: 15px; border-radius: 6px; text-align: center; }
          .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
          .status.active { background: #4CAF50; }
          .status.inactive { background: #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔍 Torrent Search Addon</h1>
            <p>Addon para búsqueda de torrents en múltiples proveedores</p>
          </div>
          
          <div class="info">
            <h3>📋 Información</h3>
            <p><strong>Versión:</strong> 1.0.0</p>
            <p><strong>Tipos soportados:</strong> Películas y Series</p>
            <p><strong>Idiomas:</strong> Español (ES)</p>
            <p><strong>Formato:</strong> Compatible con Stremio</p>
          </div>
          
          <div class="info">
            <h3>🔧 Proveedores</h3>
            <div class="providers">
              <div class="provider">
                <span class="status active"></span>
                <strong>MejorTorrent</strong>
                <br><small>Español, Alta Calidad</small>
              </div>
              <div class="provider">
                <span class="status active"></span>
                <strong>Wolfmax4k</strong>
                <br><small>4K, Ultra HD</small>
              </div>
              <div class="provider">
                <span class="status active"></span>
                <strong>Cinecalidad</strong>
                <br><small>Español, Variedad</small>
              </div>
            </div>
          </div>
          
          <div class="info">
            <h3>🚀 Uso</h3>
            <p>Este addon se instala automáticamente en Stremio. No requiere configuración adicional.</p>
            <p><strong>Endpoints disponibles:</strong></p>
            <ul>
              <li><code>/manifest.json</code> - Manifiesto del addon</li>
              <li><code>/stream/:type/:id.json</code> - Streams para contenido</li>
              <li><code>/api/search</code> - Búsqueda personalizada</li>
              <li><code>/api/health</code> - Estado del servicio</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // === MIDDLEWARE DE MANEJO DE ERRORES ===

  /**
   * Middleware para rutas no encontradas
   */
  router.use('*', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(404).json({
      error: 'Endpoint no encontrado',
      message: `La ruta ${req.method} ${req.originalUrl} no existe`,
      availableEndpoints: [
        'GET /manifest.json',
        'GET /stream/:type/:id.json',
        'GET /api/search',
        'GET /api/providers/stats',
        'GET /api/health'
      ],
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Middleware global de manejo de errores
   */
  router.use((error, req, res, next) => {
    logger.error('Error no manejado en rutas:', error);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Ha ocurrido un error inesperado',
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        details: error.message 
      })
    });
  });

  return router;
}

/**
 * Configuración de rutas con validación de parámetros
 * @param {Router} router - Router de Express
 */
export function addParameterValidation(router) {
  // Middleware de validación para parámetros de stream
  router.param('type', (req, res, next, type) => {
    if (!['movie', 'series'].includes(type)) {
      return res.status(400).json({
        error: 'Tipo inválido',
        message: 'El tipo debe ser "movie" o "series"',
        received: type
      });
    }
    next();
  });

  router.param('id', (req, res, next, id) => {
    // Validar formato de IMDB ID
    if (!/^tt\d{7,}/.test(id)) {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID debe ser un IMDB ID válido (formato: tt1234567)',
        received: id
      });
    }
    next();
  });

  router.param('providerId', (req, res, next, providerId) => {
    const validProviders = ['mejortorrent', 'wolfmax4k', 'cinecalidad'];
    if (!validProviders.includes(providerId.toLowerCase())) {
      return res.status(400).json({
        error: 'Proveedor inválido',
        message: `El proveedor debe ser uno de: ${validProviders.join(', ')}`,
        received: providerId,
        available: validProviders
      });
    }
    req.params.providerId = providerId.toLowerCase();
    next();
  });
}

export default createTorrentRoutes;