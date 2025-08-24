#!/usr/bin/env node
/**
 * Script de prueba para verificar la funcionalidad REMOVE_INVALID_STREAMS
 * Simula la validación de canales y la desactivación automática
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from '../src/infrastructure/factories/ChannelRepositoryFactory.js';
import { StreamHealthService } from '../src/infrastructure/services/StreamHealthService.js';
import { InvalidChannelManagementService } from '../src/application/services/InvalidChannelManagementService.js';

/**
 * Configuración de prueba
 */
const TEST_CONFIG = {
  validation: {
    removeInvalidStreams: true,
    validateStreamsIntervalHours: 1
  },
  dataSources: {
    type: 'csv',
    csvPath: './data/channels.csv'
  }
};

/**
 * Logger simple para pruebas
 */
const testLogger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

/**
 * Función principal de prueba
 */
async function testRemoveInvalidStreams() {
  console.log('🧪 Iniciando prueba de REMOVE_INVALID_STREAMS\n');

  try {
    // 1. Inicializar configuración
    console.log('1. Inicializando configuración...');
    const config = new TVAddonConfig();
    
    // Sobrescribir configuración para pruebas
    Object.assign(config, TEST_CONFIG);
    console.log(`   ✓ REMOVE_INVALID_STREAMS: ${config.validation.removeInvalidStreams}`);

    // 2. Inicializar repositorio
    console.log('\n2. Inicializando repositorio de canales...');
    const channelRepository = await ChannelRepositoryFactory.create(config, testLogger);
    console.log(`   ✓ Repositorio tipo: ${config.dataSources.type}`);

    // 3. Obtener muestra de canales
    console.log('\n3. Obteniendo muestra de canales...');
    const channels = channelRepository.getChannelsPaginatedUnfiltered ? 
      await channelRepository.getChannelsPaginatedUnfiltered(0, 10) :
      await channelRepository.getChannelsPaginated(0, 10);
    console.log(`   ✓ Canales obtenidos: ${channels.length}`);

    if (channels.length === 0) {
      console.log('   ⚠️  No hay canales disponibles para probar');
      return;
    }

    // 4. Inicializar servicios
    console.log('\n4. Inicializando servicios...');
    const healthService = new StreamHealthService(config, testLogger);
    const invalidChannelService = new InvalidChannelManagementService(
      channelRepository,
      config,
      testLogger
    );
    console.log(`   ✓ Servicio de gestión de canales inválidos habilitado: ${invalidChannelService.isEnabled()}`);

    // 5. Ejecutar validación
    console.log('\n5. Ejecutando validación de streams...');
    const validationReport = await healthService.checkChannels(channels, 5, true);
    console.log(`   ✓ Validación completada: ${validationReport.ok} OK, ${validationReport.fail} fallos`);

    // 6. Procesar resultados con el servicio de gestión
    console.log('\n6. Procesando resultados con InvalidChannelManagementService...');
    const processingStats = await invalidChannelService.processValidationResults(validationReport.results);
    
    console.log('\n📊 Estadísticas del procesamiento:');
    console.log(`   • Canales validados: ${processingStats.validated}`);
    console.log(`   • Canales desactivados: ${processingStats.deactivated}`);
    console.log(`   • Errores: ${processingStats.errors.length}`);

    if (processingStats.errors.length > 0) {
      console.log('\n❌ Errores encontrados:');
      processingStats.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. Canal ${error.channelId}: ${error.error}`);
      });
    }

    // 7. Verificar estado después del procesamiento
    console.log('\n7. Verificando estado después del procesamiento...');
    const channelsAfter = await channelRepository.getChannelsPaginated(0, 10);
    console.log(`   ✓ Canales activos después del procesamiento: ${channelsAfter.length}`);

    // 8. Probar desactivación manual
    if (channels.length > 0) {
      console.log('\n8. Probando desactivación manual...');
      const testChannel = channels[0];
      const deactivated = await invalidChannelService.deactivateChannel(
        testChannel.id,
        'Prueba de desactivación manual'
      );
      console.log(`   ✓ Canal ${testChannel.id} desactivado manualmente: ${deactivated}`);
    }

    console.log('\n✅ Prueba completada exitosamente');

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Función de ayuda para mostrar uso
 */
function showUsage() {
  console.log(`
Uso: node ${process.argv[1]} [opciones]
`);
  console.log('Opciones:');
  console.log('  --help, -h    Mostrar esta ayuda');
  console.log('  --config      Usar configuración personalizada');
  console.log('');
  console.log('Este script prueba la funcionalidad REMOVE_INVALID_STREAMS:');
  console.log('1. Valida una muestra de canales');
  console.log('2. Desactiva automáticamente los canales inválidos');
  console.log('3. Marca como validados los canales válidos');
  console.log('4. Muestra estadísticas del procesamiento');
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }
  
  testRemoveInvalidStreams();
}

export { testRemoveInvalidStreams };