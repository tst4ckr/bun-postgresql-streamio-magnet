/**
 * Script de prueba para verificar la implementación de Tor en TorrentioApiService
 * Ejecutar con: node test_tor_implementation.js
 */

import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

async function testTorImplementation() {
  console.log('🔧 Iniciando prueba de implementación Tor...');
  
  // Configuración de prueba con Tor habilitado
  const torConfig = {
    enabled: true,
    host: '127.0.0.1',
    port: 9050,
    controlPort: 9051,
    maxRetries: 3,
    retryDelay: 2000
  };
  
  try {
    // Crear instancia del servicio con Tor habilitado
    console.log('📡 Creando servicio con configuración Tor...');
    const service = new TorrentioApiService(
      'https://torrentio.strem.fun',
      './data/torrentio_magnets.csv',
      console,
      30000,
      torConfig
    );
    
    // Probar con un ID de contenido real
    const testContentId = 'tt0111161'; // The Shawshank Redemption
    console.log(`🎬 Probando búsqueda para contenido: ${testContentId}`);
    
    const startTime = Date.now();
    const result = await service.searchMagnetsById(testContentId);
    const endTime = Date.now();
    
    console.log(`✅ Prueba completada en ${endTime - startTime}ms`);
    console.log(`📊 Resultados encontrados: ${result.length} magnets`);
    
    if (result.length > 0) {
      console.log('🔍 Primer resultado:');
      console.log(`   Título: ${result[0].title}`);
      console.log(`   Tamaño: ${result[0].size}`);
      console.log(`   Calidad: ${result[0].quality}`);
    }
    
    console.log('🎉 ¡Implementación Tor funcionando correctamente!');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 Sugerencia: Asegúrate de que Tor esté ejecutándose en el puerto 9050');
      console.log('   Instalar Tor: https://www.torproject.org/download/');
      console.log('   Configurar ControlPort en torrc: ControlPort 9051');
    }
    
    // Probar sin Tor como fallback
    console.log('🔄 Probando sin Tor como fallback...');
    try {
      const serviceNoTor = new TorrentioApiService(
        'https://torrentio.strem.fun',
        './data/torrentio_magnets.csv',
        console,
        30000,
        { enabled: false }
      );
      
      const fallbackResult = await serviceNoTor.searchMagnetsById(testContentId);
      console.log(`✅ Fallback exitoso: ${fallbackResult.length} resultados`);
      
    } catch (fallbackError) {
      console.error('❌ Error también en fallback:', fallbackError.message);
    }
  }
}

// Ejecutar prueba
testTorImplementation().catch(console.error);