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
   * Middleware de validación para rutas de stream
   */
  const validateStreamParams = (req, res, next) => {
    const { type, id } = req.params;
    
    // Validar type
    if (!['movie', 'series'].includes(type)) {
      return res.status(400).json({
        error: 'Tipo inválido',
        message: 'El tipo debe ser "movie" o "series"',
        received: type
      });
    }
    
    // Validar id (IMDB ID)
    if (!/^tt\d{7,}/.test(id)) {
      return res.status(400).json({
        error: 'ID inválido',
        message: 'El ID debe ser un IMDB ID válido (formato: tt1234567)',
        received: id
      });
    }
    
    next();
  };

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
  router.get('/stream/:type/:id.json', validateStreamParams, controller.getStreams.bind(controller));

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
   * - providerId: ID del proveedor (todos los proveedores han sido eliminados)
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

  // Nota: La ruta raíz (/) se maneja directamente en Express para evitar
  // conflictos con el middleware catch-all de este router

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
          .logo { font-size: 2em; margin-bottom: 10px; }
          .subtitle { color: #888; }
          .section { background: #2a2a2a; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .endpoint { background: #333; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace; }
          .method { color: #4CAF50; font-weight: bold; }
          .url { color: #2196F3; }
          .description { color: #ccc; margin-top: 5px; }
          .install-btn { 
            background: #7B68EE; 
            color: white; 
            padding: 15px 30px; 
            border: none; 
            border-radius: 5px; 
            font-size: 1.1em; 
            cursor: pointer; 
            text-decoration: none; 
            display: inline-block; 
            margin: 10px 0;
          }
          .install-btn:hover { background: #6A5ACD; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎬 Torrent Search Addon</div>
            <div class="subtitle">Addon de búsqueda de torrents para Stremio</div>
          </div>
          
          <div class="section">
            <h3>📦 Instalación en Stremio</h3>
            <p>Copia la siguiente URL en Stremio para instalar el addon:</p>
            <div class="endpoint">
              <span class="url">${req.protocol}://${req.get('host')}/manifest.json</span>
            </div>
            <a href="stremio://${req.get('host')}/manifest.json" class="install-btn">
              🚀 Instalar en Stremio
            </a>
          </div>
          
          <div class="section">
            <h3>🔗 Endpoints Disponibles</h3>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/</span>
              <div class="description">Ruta raíz - redirige al manifiesto</div>
            </div>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/manifest.json</span>
              <div class="description">Manifiesto del addon para Stremio</div>
            </div>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/stream/:type/:id.json</span>
              <div class="description">Obtiene streams para contenido específico</div>
            </div>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/api/search</span>
              <div class="description">Búsqueda personalizada de torrents</div>
            </div>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/api/providers/stats</span>
              <div class="description">Estadísticas de proveedores</div>
            </div>
            
            <div class="endpoint">
              <span class="method">GET</span> <span class="url">/api/health</span>
              <div class="description">Estado del servicio</div>
            </div>
          </div>
          
          <div class="section">
            <h3>ℹ️ Información</h3>
            <p>Este addon permite buscar torrents en múltiples proveedores españoles y convertirlos en streams compatibles con Stremio.</p>
            <p><strong>Proveedores soportados:</strong> Todos los proveedores han sido eliminados</p>
            <p><strong>Idiomas:</strong> Español (ES)</p>
            <p><strong>Tipos de contenido:</strong> Películas y Series</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // === MIDDLEWARE DE MANEJO DE ERRORES ===

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

  /**
   * Middleware para rutas no encontradas (DEBE IR AL FINAL)
   */
  router.use('*', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(404).json({
      error: 'Endpoint no encontrado',
      message: `La ruta ${req.method} ${req.originalUrl} no existe`,
      availableEndpoints: [
        'GET /',
        'GET /manifest.json',
        'GET /stream/:type/:id.json',
        'GET /api/search',
        'GET /api/providers/stats',
        'GET /api/health',
        'GET /configure'
      ],
      timestamp: new Date().toISOString()
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
    const validProviders = []; // Todos los proveedores han sido eliminados
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