/**
 * Script para probar específicamente la URL de Torrentio proporcionada
 */

import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

// URL específica proporcionada por el usuario
const TORRENTIO_URL = 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`✅ [INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`⚠️ [WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`❌ [ERROR] ${msg}`, ...args)
};

// IMDb IDs de prueba
const TEST_IMDB_IDS = [
  'tt0111161', // The Shawshank Redemption
  'tt0109830', // Forrest Gump
  'tt1254207', // Big Buck Bunny
  'tt0468569', // The Dark Knight
  'tt0137523'  // Fight Club
];

async function testTorrentioUrl() {
  console.log('🎬 Probando URL de Torrentio específica\n');
  console.log(`🔗 URL: ${TORRENTIO_URL}\n`);
  
  const apiService = new TorrentioApiService(TORRENTIO_URL, './data/torrentio-test.csv', logger);
  
  for (const imdbId of TEST_IMDB_IDS) {
    console.log(`\n🔍 Probando IMDb ID: ${imdbId}`);
    
    try {
      const startTime = Date.now();
      const results = await apiService.searchMagnetsByImdbId(imdbId);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (results && results.length > 0) {
        logger.info(`Encontrados ${results.length} resultados en ${duration}ms`);
        
        // Mostrar detalles de los primeros resultados
        results.slice(0, 2).forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.name}`);
          console.log(`     Calidad: ${result.quality}`);
          console.log(`     Tamaño: ${result.size}`);
          console.log(`     Magnet: ${result.magnet.substring(0, 80)}...`);
        });
      } else {
        logger.warn(`No se encontraron resultados para ${imdbId}`);
      }
      
    } catch (error) {
      logger.error(`Error al buscar ${imdbId}: ${error.message}`);
    }
    
    // Pausa pequeña entre requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ Prueba de URL completada');
}

// Función para probar la estructura de la URL
function analyzeUrl() {
  console.log('🔬 Análisis de la URL de Torrentio:\n');
  
  const url = new URL(TORRENTIO_URL);
  console.log(`Base URL: ${url.origin}${url.pathname}`);
  
  // Parsear parámetros
  const params = url.pathname.split('/').filter(p => p.includes('='));
  
  params.forEach(param => {
    const [key, value] = param.split('=');
    console.log(`${key}: ${decodeURIComponent(value)}`);
  });
  
  console.log('\n📋 Configuración detectada:');
  console.log('- Proveedores: mejortorrent, wolfmax4k, cinecalidad');
  console.log('- Ordenamiento: por seeders');
  console.log('- Filtro de calidad: excluye scr, cam, unknown');
  console.log('- Límite: 2 resultados');
  console.log('- Filtro de tamaño: máximo 12GB');
}

// Ejecutar análisis y pruebas
analyzeUrl();
testTorrentioUrl();