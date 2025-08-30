/**
 * Rutas de diagnóstico para verificar el estado del addon
 * Proporciona endpoints útiles para debugging y verificación
 */

import { kitsuMappingFallback } from '../services/KitsuMappingFallback.js';
import { kitsuApiService } from '../services/KitsuApiService.js';

// Función para crear las rutas de diagnóstico
export function setupDiagnosticRoutes(app) {

/**
 * GET /diagnostic/kitsu-mappings
 * Muestra todos los mapeos disponibles de Kitsu → IMDb
 */
app.get('/diagnostic/kitsu-mappings', (req, res) => {
  try {
    const stats = kitsuMappingFallback.getStats();
    const mappings = kitsuMappingFallback.getAllMappings();
    
    res.json({
      success: true,
      stats,
      mappings,
      usage: {
        example: 'http://127.0.0.1:3003/stream/anime/kitsu:1.json',
        description: 'Usa cualquier kitsuId de la lista para probar streams'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /diagnostic/test-mapping/:kitsuId
 * Prueba un mapeo específico de Kitsu → IMDb
 */
app.get('/diagnostic/test-mapping/:kitsuId', async (req, res) => {
  try {
    const { kitsuId } = req.params;
    const numericId = kitsuId.replace('kitsu:', '');
    
    // Probar mapeo manual
    const manualMapping = kitsuMappingFallback.getImdbIdFromKitsu(numericId);
    const metadata = kitsuMappingFallback.getAnimeMetadata(numericId);
    
    // Probar mapeo via API
    const apiMapping = await kitsuApiService.getImdbIdFromKitsu(`kitsu:${numericId}`);
    
    res.json({
      success: true,
      kitsuId: `kitsu:${numericId}`,
      mappings: {
        manual: {
          imdbId: manualMapping,
          metadata,
          available: !!manualMapping
        },
        api: {
          imdbId: apiMapping,
          available: !!apiMapping
        }
      },
      streamUrl: `http://127.0.0.1:3003/stream/anime/kitsu:${numericId}.json`,
      recommendation: manualMapping ? 
        'Mapeo manual disponible - debería funcionar' : 
        'Sin mapeo manual - puede no funcionar'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /diagnostic/search-anime/:query
 * Busca animes por título en los mapeos manuales
 */
app.get('/diagnostic/search-anime/:query', (req, res) => {
  try {
    const { query } = req.params;
    const results = kitsuMappingFallback.searchByTitle(query);
    
    res.json({
      success: true,
      query,
      results: results.map(result => ({
        ...result,
        streamUrl: `http://127.0.0.1:3003/stream/anime/${result.kitsuId}.json`
      })),
      count: results.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /diagnostic/popular-anime
 * Muestra animes populares disponibles para testing
 */
app.get('/diagnostic/popular-anime', (req, res) => {
  try {
    const popularAnimes = [
      { kitsuId: 'kitsu:1', title: 'Cowboy Bebop', year: 1998 },
      { kitsuId: 'kitsu:1376', title: 'Death Note', year: 2006 },
      { kitsuId: 'kitsu:11469', title: 'Steins;Gate', year: 2011 },
      { kitsuId: 'kitsu:7442', title: 'Attack on Titan', year: 2013 },
      { kitsuId: 'kitsu:41370', title: 'Demon Slayer', year: 2019 }
    ];
    
    const results = popularAnimes.map(anime => {
      const numericId = anime.kitsuId.replace('kitsu:', '');
      const imdbId = kitsuMappingFallback.getImdbIdFromKitsu(numericId);
      const metadata = kitsuMappingFallback.getAnimeMetadata(numericId);
      
      return {
        ...anime,
        imdbId,
        metadata,
        streamUrl: `http://127.0.0.1:3003/stream/anime/${anime.kitsuId}.json`,
        available: !!imdbId
      };
    });
    
    res.json({
      success: true,
      animes: results,
      instructions: {
        usage: 'Copia cualquier streamUrl en tu navegador para probar',
        stremio: 'Agrega http://127.0.0.1:3003/manifest.json a Stremio para usar el addon'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /diagnostic/health
 * Verifica el estado general del addon
 */
app.get('/diagnostic/health', async (req, res) => {
  try {
    const stats = kitsuMappingFallback.getStats();
    
    // Probar un mapeo conocido
    const testMapping = await kitsuApiService.getImdbIdFromKitsu('kitsu:1');
    
    res.json({
      success: true,
      status: 'healthy',
      services: {
        kitsuMappingFallback: {
          status: 'active',
          mappings: stats.totalMappings,
          coverage: `${stats.coverage}%`
        },
        kitsuApiService: {
          status: testMapping ? 'active' : 'limited',
          testResult: testMapping || 'fallback working'
        }
      },
      endpoints: {
        manifest: 'http://127.0.0.1:3003/manifest.json',
        diagnostics: 'http://127.0.0.1:3003/diagnostic/',
        popularAnime: 'http://127.0.0.1:3003/diagnostic/popular-anime'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message
    });
  }
});

}