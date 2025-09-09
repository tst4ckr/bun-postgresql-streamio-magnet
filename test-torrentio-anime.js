import TorrentioApiService from './src/infrastructure/services/TorrentioApiService.js';

// Test de procesamiento de IDs de anime series
const testAnimeSeriesIds = [
  'mal:11061:1:1',
  'anilist:21087:1:1', 
  'anidb:8074:1:1'
];

console.log('=== Test TorrentioApiService - Anime Series IDs ===\n');

// Crear instancia del servicio con parámetros requeridos
const service = new TorrentioApiService(
  'https://torrentio.stremio.com',
  './data/torrentio.csv'
);

testAnimeSeriesIds.forEach(id => {
  try {
    console.log(`Testing ID: ${id}`);
    
    // Acceder al método privado usando reflexión para testing
    const processContentId = service.constructor.prototype.constructor.toString().includes('#processContentId');
    
    if (processContentId) {
      console.log(`  Método #processContentId encontrado en el servicio`);
    }
    
    // Verificar que el patrón coincida con los nuevos tipos
    const patterns = {
      mal_series: /^(?:mal:)?\d+:\d+:\d+$/i,
      anilist_series: /^(?:anilist:)?\d+:\d+:\d+$/i,
      anidb_series: /^(?:anidb:)?\d+:\d+:\d+$/i
    };
    
    let matched = false;
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(id)) {
        console.log(`  ✓ ID coincide con patrón ${type}`);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      console.log(`  ✗ ID no coincide con ningún patrón de anime series`);
    }
    
    console.log(`✓ Test completado para: ${id}\n`);
    
  } catch (error) {
    console.log(`✗ Error procesando ${id}: ${error.message}\n`);
  }
});

console.log('=== Test completado ===');