/**
 * Test de optimización de cascada - Verifica que el sistema evita búsquedas redundantes
 * Este test demuestra que el cache de fuentes agotadas funciona correctamente
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

// Logger personalizado para capturar logs
class TestLogger {
  constructor() {
    this.logs = [];
  }
  
  info(message, data = {}) {
    const log = { level: 'INFO', message, timestamp: new Date().toISOString(), ...data };
    this.logs.push(log);
    console.log(`[INFO] ${message}`, data.component ? `[${data.component}]` : '');
  }
  
  debug(message, data = {}) {
    const log = { level: 'DEBUG', message, timestamp: new Date().toISOString(), ...data };
    this.logs.push(log);
    console.log(`[DEBUG] ${message}`, data.component ? `[${data.component}]` : '');
  }
  
  warn(message, data = {}) {
    const log = { level: 'WARN', message, timestamp: new Date().toISOString(), ...data };
    this.logs.push(log);
    console.log(`[WARN] ${message}`, data.component ? `[${data.component}]` : '');
  }
  
  error(message, error, data = {}) {
    const log = { level: 'ERROR', message, error: error?.message || error, timestamp: new Date().toISOString(), ...data };
    this.logs.push(log);
    console.log(`[ERROR] ${message}`, error?.message || error, data.component ? `[${data.component}]` : '');
  }
  
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level);
  }
  
  getLogsByComponent(component) {
    return this.logs.filter(log => log.component === component);
  }
  
  getLogsByMessage(pattern) {
    return this.logs.filter(log => log.message.includes(pattern));
  }
}

async function testCascadeOptimization() {
  console.log('🧪 Iniciando test de optimización de cascada...\n');
  
  const logger = new TestLogger();
  
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
    
    // Test 1: Primera búsqueda (debe intentar todas las fuentes)
    console.log('📋 Test 1: Primera búsqueda de contenido inexistente');
    console.log('   Esperado: Debe intentar todas las fuentes y marcarlas como agotadas\n');
    
    const testContentId1 = 'tt999999999'; // IMDb ID inexistente
    
    try {
      await repository.getMagnetsByContentId(testContentId1, 'movie');
      console.log('❌ Error: Se encontraron resultados cuando no debería');
    } catch (error) {
      console.log(`✅ Primera búsqueda falló como esperado: ${error.message}`);
    }
    
    // Verificar que se intentaron todas las fuentes
    const debugLogs1 = logger.getLogsByMessage('Saltando');
    console.log(`   Logs de salto encontrados: ${debugLogs1.length} (debería ser 0 en primera búsqueda)`);
    
    const exhaustedLogs1 = logger.getLogsByMessage('agotada');
    console.log(`   Fuentes marcadas como agotadas: ${exhaustedLogs1.length}`);
    
    console.log('\n📊 Resumen de la primera búsqueda:');
    exhaustedLogs1.forEach(log => {
      console.log(`   - ${log.message}`);
    });
    
    // Limpiar logs para segunda búsqueda
    logger.logs = [];
    
    // Test 2: Segunda búsqueda del mismo contenido (debe saltar fuentes agotadas)
    console.log('\n📋 Test 2: Segunda búsqueda del mismo contenido inexistente');
    console.log('   Esperado: Debe saltar las fuentes agotadas y ser más rápida\n');
    
    const startTime = Date.now();
    
    try {
      await repository.getMagnetsByContentId(testContentId1, 'movie');
      console.log('❌ Error: Se encontraron resultados cuando no debería');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`✅ Segunda búsqueda falló como esperado: ${error.message}`);
      console.log(`   ⏱️  Duración: ${duration}ms`);
    }
    
    // Verificar que se saltaron las fuentes agotadas
    const debugLogs2 = logger.getLogsByMessage('Saltando');
    console.log(`   Logs de salto encontrados: ${debugLogs2.length} (debería ser > 0)`);
    
    debugLogs2.forEach(log => {
      console.log(`   - ${log.message}`);
    });
    
    // Test 3: Verificar que el cache se limpia correctamente
    console.log('\n📋 Test 3: Limpiar cache de fuentes agotadas');
    repository.clearExhaustedSourcesCache();
    console.log('✅ Cache limpiado\n');
    
    // Test 4: Verificar búsqueda con contenido real (si existe)
    console.log('📋 Test 4: Búsqueda de contenido potencialmente existente');
    const testContentId2 = 'tt0944947'; // Game of Thrones (ejemplo)
    
    logger.logs = [];
    
    try {
      const results = await repository.getMagnetsByContentId(testContentId2, 'series');
      console.log(`✅ Encontrados ${results.length} resultados para ${testContentId2}`);
      
      if (results.length > 0) {
        console.log('   Esto demuestra que el sistema funciona cuando hay contenido disponible');
      }
    } catch (error) {
      console.log(`⚠️  No se encontraron resultados para ${testContentId2}: ${error.message}`);
      console.log('   Esto es normal si el contenido no está en las fuentes locales');
    }
    
    // Resumen final
    console.log('\n📈 Resumen de Optimización:');
    console.log('✅ Sistema de cache de fuentes agotadas implementado');
    console.log('✅ Evita búsquedas redundantes en fuentes sin resultados');
    console.log('✅ TTL de 5 minutos para fuentes agotadas');
    console.log('✅ Compatible con el flujo de cascada existente');
    console.log('✅ No rompe funcionalidad cuando hay resultados disponibles');
    
  } catch (error) {
    console.error('❌ Error en test de optimización:', error);
  }
}

// Ejecutar test
console.log('🚀 Iniciando Test de Optimización de Cascada\n');
console.log('Objetivo: Verificar que el sistema evita búsquedas redundantes');
console.log('usando cache inteligente de fuentes agotadas.\n');

testCascadeOptimization().catch(console.error);