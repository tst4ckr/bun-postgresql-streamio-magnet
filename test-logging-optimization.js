/**
 * Script de prueba para verificar optimizaciones de logging
 * con niveles dinámicos y contexto estructurado
 */

import { config } from 'dotenv';
config();

import { EnhancedLogger } from './src/infrastructure/utils/EnhancedLogger.js';
import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

async function testLoggingOptimizations() {
  console.log('🔍 PRUEBA DE OPTIMIZACIONES DE LOGGING');
  console.log('=' .repeat(50));

  // 1. Probar EnhancedLogger con diferentes niveles
  console.log('\n📝 Probando EnhancedLogger con niveles dinámicos...');
  
  const logger = new EnhancedLogger('debug', true, {
    minimalOutput: false,
    errorOnly: false
  });

  // Probar diferentes niveles
  logger.info('Mensaje de información básica');
  logger.warn('Mensaje de advertencia');
  logger.debug('Mensaje de debug detallado');
  
  // Probar logging estructurado
  logger.structured('info', 'Prueba de logging estructurado', {
    component: 'TestScript',
    operation: 'logging_test',
    data: { test: true, timestamp: new Date().toISOString() }
  });

  // Probar logging con transacción
  logger.withTransaction('info', 'TXN-001', 'Operación con ID de transacción', {
    userId: 'test-user',
    action: 'test-action'
  });

  // 2. Probar CascadingMagnetRepository con logging optimizado
  console.log('\n🗂️  Probando CascadingMagnetRepository con logging optimizado...');
  
  try {
    const repository = new CascadingMagnetRepository(
      './data/magnets.csv',
      './data/torrentio.csv', 
      './data/anime.csv',
      'https://torrentio.stremio.com',
      logger,
      5000
    );

    // Probar operación que genere logs
    console.log('   Inicializando repositorio...');
    await repository.initialize();
    console.log('   ✅ Repositorio inicializado correctamente');

  } catch (error) {
    console.log(`   ⚠️  Error esperado en inicialización: ${error.message}`);
  }

  // 3. Probar TorrentioApiService con logging optimizado
  console.log('\n🌐 Probando TorrentioApiService con logging optimizado...');
  
  try {
    const apiService = new TorrentioApiService(
      'https://torrentio.stremio.com',
      './data/torrentio.csv',
      logger,
      5000
    );

    // Probar operación que genere logs (sin hacer llamada real)
    console.log('   Servicio API creado correctamente');
    console.log('   ✅ TorrentioApiService configurado con logging optimizado');

  } catch (error) {
    console.log(`   ⚠️  Error en configuración: ${error.message}`);
  }

  // 4. Probar cambio dinámico de nivel de logging
  console.log('\n🔄 Probando cambio dinámico de nivel de logging...');
  
  console.log('   Nivel actual:', logger.getLogLevel());
  
  // Cambiar a nivel error
  logger.setLogLevel('error');
  console.log('   Cambiado a nivel ERROR');
  
  logger.info('Este mensaje NO debería aparecer (nivel info)');
  logger.error('Este mensaje SÍ debería aparecer (nivel error)');
  
  // Restaurar nivel debug
  logger.setLogLevel('debug');
  console.log('   Restaurado a nivel DEBUG');
  
  logger.info('Este mensaje SÍ debería aparecer (nivel info restaurado)');

  // 5. Probar estadísticas del logger
  console.log('\n📊 Estadísticas del logger:');
  const stats = logger.getStats();
  console.log('   Cache size:', stats.cacheSize);
  console.log('   Log level:', stats.logLevel);
  console.log('   Source tracking:', stats.sourceTracking);
  console.log('   Is production:', stats.isProduction);

  console.log('\n✅ PRUEBAS DE LOGGING COMPLETADAS');
  console.log('=' .repeat(50));
}

// Ejecutar pruebas
testLoggingOptimizations().catch(error => {
  console.error('❌ Error en pruebas de logging:', error);
  process.exit(1);
});