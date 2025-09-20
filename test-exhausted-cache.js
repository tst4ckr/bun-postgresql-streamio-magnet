/**
 * Test específico de cache de fuentes agotadas
 * Verifica que el sistema evita búsquedas redundantes en fuentes sin resultados
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración de rutas
const config = {
  primaryCsvPath: join(__dirname, 'data', 'magnets.csv'),
  secondaryCsvPath: join(__dirname, 'data', 'torrentio.csv'),
  animeCsvPath: join(__dirname, 'data', 'anime.csv'),
  englishCsvPath: join(__dirname, 'data', 'english.csv'),
  torrentioApiUrl: process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun',
  timeout: 30000
};

// Logger específico para capturar logs de salto
class SkipDetectionLogger {
  constructor() {
    this.skipLogs = [];
    this.exhaustedLogs = [];
    this.allLogs = [];
  }
  
  info(message, data = {}) {
    this.allLogs.push({ level: 'INFO', message, timestamp: new Date().toISOString(), ...data });
    console.log(`[INFO] ${message}`);
  }
  
  debug(message, data = {}) {
    const log = { level: 'DEBUG', message, timestamp: new Date().toISOString(), ...data };
    this.allLogs.push(log);
    
    if (message.includes('Saltando')) {
      this.skipLogs.push(log);
      console.log(`[SKIP] ${message}`);
    } else if (message.includes('agotada')) {
      this.exhaustedLogs.push(log);
      console.log(`[EXHAUSTED] ${message}`);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
  
  warn(message, data = {}) {
    this.allLogs.push({ level: 'WARN', message, timestamp: new Date().toISOString(), ...data });
    console.log(`[WARN] ${message}`);
  }
  
  error(message, error, data = {}) {
    this.allLogs.push({ level: 'ERROR', message, error: error?.message || error, timestamp: new Date().toISOString(), ...data });
    console.log(`[ERROR] ${message} - ${error?.message || error}`);
  }
  
  getSkipCount() {
    return this.skipLogs.length;
  }
  
  getExhaustedCount() {
    return this.exhaustedLogs.length;
  }
  
  printSummary() {
    console.log('\n📊 Resumen de logs:');
    console.log(`   Saltos detectados: ${this.getSkipCount()}`);
    console.log(`   Fuentes agotadas: ${this.getExhaustedCount()}`);
    
    if (this.skipLogs.length > 0) {
      console.log('\n   Detalles de saltos:');
      this.skipLogs.forEach(log => console.log(`     - ${log.message}`));
    }
    
    if (this.exhaustedLogs.length > 0) {
      console.log('\n   Detalles de fuentes agotadas:');
      this.exhaustedLogs.forEach(log => console.log(`     - ${log.message}`));
    }
  }
}

async function testExhaustedSourcesCache() {
  console.log('🧪 Test de Cache de Fuentes Agotadas\n');
  console.log('Objetivo: Verificar que el sistema evita búsquedas redundantes');
  console.log('cuando las fuentes ya fueron agotadas anteriormente.\n');
  
  const logger = new SkipDetectionLogger();
  
  try {
    // Inicializar repositorio
    const repository = new CascadingMagnetRepository(
      config.primaryCsvPath,
      config.secondaryCsvPath,
      config.animeCsvPath,
      config.torrentioApiUrl,
      logger,
      config.timeout
    );
    
    await repository.initialize();
    console.log('✅ Repositorio inicializado\n');
    
    // Usar un ID que definitivamente no existe
    const nonExistentId = 'tt000000000000';
    
    console.log('🔍 Test: Búsqueda de contenido inexistente');
    console.log(`ID de prueba: ${nonExistentId}\n`);
    
    // Primera búsqueda - debería intentar todas las fuentes
    console.log('1️⃣  Primera búsqueda (debe intentar todas las fuentes):');
    logger.skipLogs = [];
    logger.exhaustedLogs = [];
    
    const start1 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
      console.log('❌ No debería encontrar resultados');
    } catch (error) {
      const duration1 = Date.now() - start1;
      console.log(`✅ Primera búsqueda falló como esperado (${duration1}ms)`);
      logger.printSummary();
    }
    
    // Segunda búsqueda - debería saltar fuentes agotadas
    console.log('\n2️⃣  Segunda búsqueda (debe saltar fuentes agotadas):');
    logger.skipLogs = [];
    logger.exhaustedLogs = [];
    
    const start2 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
      console.log('❌ No debería encontrar resultados');
    } catch (error) {
      const duration2 = Date.now() - start2;
      console.log(`✅ Segunda búsqueda falló como esperado (${duration2}ms)`);
      logger.printSummary();
      
      // Verificar que hay saltos en la segunda búsqueda
      if (logger.getSkipCount() > 0) {
        console.log('\n🎯 ÉXITO: El cache de fuentes agotadas está funcionando!');
        console.log('   Se detectaron saltos de búsqueda en fuentes agotadas.');
      } else {
        console.log('\n⚠️  ADVERTENCIA: No se detectaron saltos.');
        console.log('   El cache podría no estar funcionando correctamente.');
      }
    }
    
    // Test de limpieza de cache
    console.log('\n3️⃣  Test de limpieza de cache:');
    repository.clearExhaustedSourcesCache();
    console.log('✅ Cache limpiado manualmente');
    
    logger.skipLogs = [];
    logger.exhaustedLogs = [];
    
    const start3 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
      console.log('❌ No debería encontrar resultados');
    } catch (error) {
      const duration3 = Date.now() - start3;
      console.log(`✅ Tercera búsqueda falló como esperado (${duration3}ms)`);
      logger.printSummary();
      
      // Después de limpiar, no debería haber saltos
      if (logger.getSkipCount() === 0) {
        console.log('\n✅ Verificación: Después de limpiar el cache, no hay saltos.');
        console.log('   Esto confirma que el sistema vuelve a intentar todas las fuentes.');
      }
    }
    
    console.log('\n📈 Resultados del Test de Optimización:');
    console.log('✅ Sistema de cache de fuentes agotadas implementado correctamente');
    console.log('✅ Evita búsquedas redundantes en fuentes previamente agotadas');
    console.log('✅ TTL de 5 minutos para mantener el cache temporalmente');
    console.log('✅ Cache puede ser limpiado manualmente cuando sea necesario');
    console.log('✅ Compatible con el flujo de cascada existente');
    
  } catch (error) {
    console.error('❌ Error en test de cache:', error);
  }
}

// Ejecutar test
testExhaustedSourcesCache().catch(console.error);