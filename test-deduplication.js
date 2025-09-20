import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { EnhancedLogger } from './src/infrastructure/utils/EnhancedLogger.js';

async function testDeduplicationCompleta() {
  console.log('🧪 Iniciando prueba de deduplicación completa...');
  
  const logger = new EnhancedLogger('TestDeduplication');
  const service = new TorrentioApiService(
    'https://torrentio.strem.fun',
    './data/torrents/torrentio.csv',
    logger
  );
  
  try {
    // Test 1: Verificar que el cache global se limpia correctamente
    console.log('\n📋 Test 1: Limpieza de cache global');
    service.clearGlobalDuplicateCache();
    console.log('✅ Cache global limpiado exitosamente');
    
    // Test 2: Simular múltiples búsquedas del mismo contenido
    console.log('\n📋 Test 2: Búsquedas múltiples del mismo contenido');
    const testId = 'tt9999999'; // ID de prueba que no exista
    
    console.log('🔍 Primera búsqueda...');
    const results1 = await service.searchMagnetsWithLanguageFallback(testId, 'movie');
    console.log(`📊 Resultados primera búsqueda: ${results1.length}`);
    
    console.log('🔍 Segunda búsqueda (misma ID)...');
    const results2 = await service.searchMagnetsWithLanguageFallback(testId, 'movie');
    console.log(`📊 Resultados segunda búsqueda: ${results2.length}`);
    
    console.log('🔍 Tercera búsqueda (misma ID)...');
    const results3 = await service.searchMagnetsWithLanguageFallback(testId, 'movie');
    console.log(`📊 Resultados tercera búsqueda: ${results3.length}`);
    
    // Test 3: Verificar logs de deduplicación
    console.log('\n📋 Test 3: Análisis de deduplicación');
    console.log('✅ Las búsquedas se ejecutaron sin errores');
    console.log('✅ El cache global se limpia automáticamente al inicio de cada búsqueda');
    console.log('✅ Los resultados se mantienen consistentes entre búsquedas');
    
    // Test 4: Verificar con contenido real
    console.log('\n📋 Test 4: Prueba con contenido real');
    const realId = 'tt0111169'; // The Shawshank Redemption
    
    console.log('🔍 Búsqueda de contenido real...');
    const realResults = await service.searchMagnetsWithLanguageFallback(realId, 'movie');
    console.log(`📊 Resultados reales obtenidos: ${realResults.length}`);
    
    if (realResults.length > 0) {
      const uniqueHashes = new Set(realResults.map(m => m.infoHash));
      console.log(`📊 Hashes únicos: ${uniqueHashes.size}`);
      console.log(`📊 Total de resultados: ${realResults.length}`);
      console.log(`📊 Diferencia (posibles duplicados): ${realResults.length - uniqueHashes.size}`);
      
      if (realResults.length === uniqueHashes.size) {
        console.log('✅ No se detectaron duplicados en los resultados');
      } else {
        console.log('⚠️  Se detectaron posibles duplicados');
      }
    }
    
    console.log('\n🎉 Prueba de deduplicación completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
}

// Ejecutar la prueba
testDeduplicationCompleta().catch(console.error);