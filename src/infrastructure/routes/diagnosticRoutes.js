/**
 * Rutas de diagnóstico para verificar el estado del addon
 * Proporciona endpoints útiles para debugging y verificación
 * NOTA: Los servicios de mapeo Kitsu han sido eliminados del proyecto
 */

// Función para crear las rutas de diagnóstico
export function setupDiagnosticRoutes(app) {

/**
 * GET /diagnostic/kitsu-mappings
 * Endpoint deshabilitado - servicios Kitsu eliminados
 */
app.get('/diagnostic/kitsu-mappings', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Servicio de mapeo Kitsu eliminado del proyecto',
    message: 'Los servicios de mapeo Kitsu han sido descontinuados'
  });
});

/**
 * GET /diagnostic/test-mapping/:kitsuId
 * Endpoint deshabilitado - servicios Kitsu eliminados
 */
app.get('/diagnostic/test-mapping/:kitsuId', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Servicio de mapeo Kitsu eliminado del proyecto',
    message: 'Los servicios de mapeo Kitsu han sido descontinuados'
  });
});

/**
 * GET /diagnostic/search-anime/:query
 * Endpoint deshabilitado - servicios Kitsu eliminados
 */
app.get('/diagnostic/search-anime/:query', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Servicio de búsqueda Kitsu eliminado del proyecto',
    message: 'Los servicios de mapeo Kitsu han sido descontinuados'
  });
});

/**
 * GET /diagnostic/popular-anime
 * Endpoint deshabilitado - servicios Kitsu eliminados
 */
app.get('/diagnostic/popular-anime', (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Servicio de mapeo Kitsu eliminado del proyecto',
    message: 'Los servicios de mapeo Kitsu han sido descontinuados'
  });
});

/**
 * GET /diagnostic/health
 * Verifica el estado general del addon (sin servicios Kitsu)
 */
app.get('/diagnostic/health', async (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    services: {
      kitsuMappingFallback: {
        status: 'removed',
        message: 'Servicio eliminado del proyecto'
      },
      kitsuApiService: {
        status: 'removed', 
        message: 'Servicio eliminado del proyecto'
      }
    },
    endpoints: {
      manifest: 'http://127.0.0.1:3003/manifest.json',
      diagnostics: 'http://127.0.0.1:3003/diagnostic/',
      popularAnime: 'http://127.0.0.1:3003/diagnostic/popular-anime'
    }
  });
});

}