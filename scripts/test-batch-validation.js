#!/usr/bin/env node
/**
 * Script de prueba para verificar la validación por lotes
 * Simula la validación completa de todos los canales
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from '../src/infrastructure/factories/ChannelRepositoryFactory.js';
import { StreamHealthService } from '../src/infrastructure/services/StreamHealthService.js';
import { InvalidChannelManagementService } from '../src/application/services/InvalidChannelManagementService.js';

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
async function testBatchValidation() {
  console.log('🧪 Iniciando prueba de validación por lotes\n');

  try {
    // 1. Inicializar configuración
    console.log('1. Inicializando configuración...');
    const config = TVAddonConfig.getInstance();
    console.log(`   ✓ Configuración cargada`);
    console.log(`   ✓ Validar todos los canales: ${config.getConfig('validation').validateAllChannels}`);
    console.log(`   ✓ Tamaño de lote: ${config.getConfig('validation').validationBatchSize}`);
    console.log(`   ✓ Concurrencia máxima: ${config.getConfig('validation').maxValidationConcurrency}`);
    console.log(`   ✓ Remover streams inválidos: ${config.getConfig('validation').removeInvalidStreams}`);

    // 2. Inicializar repositorio
    console.log('\n2. Inicializando repositorio de canales...');
    const channelRepository = await ChannelRepositoryFactory.createRepository(config, testLogger);
    console.log(`   ✓ Repositorio inicializado`);

    // 3. Obtener estadísticas iniciales
    console.log('\n3. Obteniendo estadísticas iniciales...');
    const allChannels = await channelRepository.getAllChannels();
    console.log(`   ✓ Total de canales disponibles: ${allChannels.length}`);

    // Mostrar algunos canales de ejemplo
    if (allChannels.length > 0) {
      console.log('\n   📺 Primeros 5 canales:');
      allChannels.slice(0, 5).forEach((channel, index) => {
        console.log(`      ${index + 1}. ${channel.name} (${channel.id}) - ${channel.country}`);
      });
    }

    // 4. Inicializar servicios
    console.log('\n4. Inicializando servicios...');
    const healthService = new StreamHealthService(config.getAll(), testLogger);
    const invalidChannelService = new InvalidChannelManagementService(
      channelRepository,
      config.getAll(),
      testLogger
    );
    console.log(`   ✓ StreamHealthService inicializado`);
    console.log(`   ✓ InvalidChannelManagementService habilitado: ${invalidChannelService.isEnabled()}`);

    // 5. Ejecutar validación por lotes
    console.log('\n5. Ejecutando validación por lotes...');
    const getChannelsFunction = (offset, limit) => 
      channelRepository.getChannelsPaginatedUnfiltered ? 
        channelRepository.getChannelsPaginatedUnfiltered(offset, limit) :
        channelRepository.getChannelsPaginated(offset, limit);
    
    const startTime = Date.now();
    const validationReport = await healthService.validateAllChannelsBatched(
      getChannelsFunction,
      {
        batchSize: config.getConfig('validation').validationBatchSize,
        concurrency: config.getConfig('validation').maxValidationConcurrency,
        showProgress: true
      }
    );
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n📊 Resultados de validación por lotes:');
    console.log(`   • Total procesado: ${validationReport.total}`);
    console.log(`   • Canales válidos: ${validationReport.ok}`);
    console.log(`   • Canales inválidos: ${validationReport.fail}`);
    console.log(`   • Lotes procesados: ${validationReport.batches}`);
    console.log(`   • Tiempo total: ${duration} segundos`);
    console.log(`   • Tasa de éxito: ${((validationReport.ok / validationReport.total) * 100).toFixed(1)}%`);

    // 6. Procesar resultados con InvalidChannelManagementService
    console.log('\n6. Procesando resultados con InvalidChannelManagementService...');
    const processingStats = await invalidChannelService.processValidationResults(validationReport.results);
    
    console.log('\n📈 Estadísticas del procesamiento:');
    console.log(`   • Canales validados: ${processingStats.validated}`);
    console.log(`   • Canales desactivados: ${processingStats.deactivated}`);
    console.log(`   • Errores: ${processingStats.errors.length}`);

    if (processingStats.errors.length > 0) {
      console.log('\n❌ Errores encontrados:');
      processingStats.errors.slice(0, 5).forEach((error, index) => {
        console.log(`   ${index + 1}. Canal ${error.channelId}: ${error.error}`);
      });
      if (processingStats.errors.length > 5) {
        console.log(`   ... y ${processingStats.errors.length - 5} errores más`);
      }
    }

    // 7. Verificar estado después del procesamiento
    console.log('\n7. Verificando estado después del procesamiento...');
    const channelsAfter = await channelRepository.getAllChannels();
    console.log(`   ✓ Canales activos después del procesamiento: ${channelsAfter.length}`);
    
    const deactivatedCount = allChannels.length - channelsAfter.length;
    if (deactivatedCount > 0) {
      console.log(`   ✓ Canales desactivados automáticamente: ${deactivatedCount}`);
    }

    // 8. Resumen final
    console.log('\n🎯 Resumen de la prueba:');
    console.log(`   • Canales iniciales: ${allChannels.length}`);
    console.log(`   • Canales procesados: ${validationReport.total}`);
    console.log(`   • Canales válidos: ${validationReport.ok}`);
    console.log(`   • Canales finales activos: ${channelsAfter.length}`);
    console.log(`   • Tiempo de procesamiento: ${duration}s`);
    console.log(`   • Lotes utilizados: ${validationReport.batches}`);
    
    if (config.getConfig('validation').removeInvalidStreams) {
      console.log('\n✅ La funcionalidad REMOVE_INVALID_STREAMS está HABILITADA');
      console.log('   Los canales inválidos han sido automáticamente desactivados');
    } else {
      console.log('\n⚠️  La funcionalidad REMOVE_INVALID_STREAMS está DESHABILITADA');
      console.log('   Los canales inválidos se mantienen activos');
    }

    console.log('\n🎉 Prueba de validación por lotes completada exitosamente!');

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    process.exit(1);
  }
}

/**
 * Mostrar ayuda
 */
function showHelp() {
  console.log(`
Script de prueba para validación por lotes

Uso:
  node scripts/test-batch-validation.js

Este script:
  1. Carga la configuración actual
  2. Inicializa el repositorio de canales
  3. Ejecuta validación por lotes de todos los canales
  4. Procesa los resultados automáticamente
  5. Muestra estadísticas detalladas

Configuración relevante:
  VALIDATE_ALL_CHANNELS=true     # Validar todos los canales
  VALIDATION_BATCH_SIZE=50       # Tamaño de cada lote
  MAX_VALIDATION_CONCURRENCY=10  # Concurrencia por lote
  REMOVE_INVALID_STREAMS=true    # Desactivar canales inválidos
`);
}

// Ejecutar script
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
} else {
  testBatchValidation();
}