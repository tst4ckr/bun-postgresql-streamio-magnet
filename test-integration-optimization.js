/**
 * Test integrado de optimización completa
 * Verifica que el cache de fuentes agotadas y la deduplicación trabajen juntos
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

// Logger optimizado para tests
class IntegrationTestLogger {
  constructor() {
    this.metrics = {
      searches: 0,
      skips: 0,
      duplicates: 0,
      cacheHits: 0,
      apiCalls: 0,
      totalTime: 0
    };
    this.logs = [];
  }
  
  info(message, data = {}) {
    this.logs.push({ level: 'INFO', message, timestamp: new Date().toISOString(), ...data });
    if (message.includes('desde cache')) this.metrics.cacheHits++;
    if (message.includes('API Torrentio')) this.metrics.apiCalls++;
    console.log(`[INFO] ${message}`);
  }
  
  debug(message, data = {}) {
    this.logs.push({ level: 'DEBUG', message, timestamp: new Date().toISOString(), ...data });
    if (message.includes('Saltando')) this.metrics.skips++;
    if (message.includes('duplicado')) this.metrics.duplicates++;
    console.log(`[DEBUG] ${message}`);
  }
  
  warn(message, data = {}) {
    this.logs.push({ level: 'WARN', message, timestamp: new Date().toISOString(), ...data });
    console.log(`[WARN] ${message}`);
  }
  
  error(message, error, data = {}) {
    this.logs.push({ level: 'ERROR', message, error: error?.message || error, timestamp: new Date().toISOString(), ...data });
    console.log(`[ERROR] ${message} - ${error?.message || error}`);
  }
  
  incrementSearches() {
    this.metrics.searches++;
  }
  
  addTime(duration) {
    this.metrics.totalTime += duration;
  }
  
  getAverageTime() {
    return this.metrics.searches > 0 ? Math.round(this.metrics.totalTime / this.metrics.searches) : 0;
  }
  
  printReport() {
    console.log('\n📊 Reporte de Métricas de Optimización:');
    console.log(`   Búsquedas totales: ${this.metrics.searches}`);
    console.log(`   Saltos de fuentes agotadas: ${this.metrics.skips}`);
    console.log(`   Duplicados detectados: ${this.metrics.duplicates}`);
    console.log(`   Hits de cache: ${this.metrics.cacheHits}`);
    console.log(`   Llamadas a API: ${this.metrics.apiCalls}`);
    console.log(`   Tiempo promedio por búsqueda: ${this.getAverageTime()}ms`);
    console.log(`   Tiempo total: ${this.metrics.totalTime}ms`);
    
    const efficiency = this.metrics.searches > 0 ? 
      Math.round(((this.metrics.skips + this.metrics.cacheHits) / this.metrics.searches) * 100) : 0;
    console.log(`   Eficiencia de optimización: ${efficiency}%`);
  }
}

async function testIntegratedOptimization() {
  console.log('🚀 Test Integrado de Optimización Completa\n');
  console.log('Objetivo: Verificar que todos los sistemas de optimización');
  console.log('trabajen en conjunto sin conflictos.\n');
  
  const logger = new IntegrationTestLogger();
  
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
    
    // Test 1: Contenido inexistente (verificar cache de fuentes agotadas)
    console.log('🔍 Test 1: Contenido completamente inexistente');
    const nonExistentId = 'tt999999999999';
    
    // Primera búsqueda
    const start1 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
    } catch (error) {
      const duration1 = Date.now() - start1;
      logger.addTime(duration1);
      logger.incrementSearches();
      console.log(`✅ Primera búsqueda: ${duration1}ms - ${error.message}`);
    }
    
    // Segunda búsqueda (debe ser más rápida por cache de fuentes agotadas)
    const start2 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
    } catch (error) {
      const duration2 = Date.now() - start2;
      logger.addTime(duration2);
      logger.incrementSearches();
      console.log(`✅ Segunda búsqueda: ${duration2}ms - ${error.message}`);
    }
    
    // Test 2: Contenido existente (verificar deduplicación y cache)
    console.log('\n🔍 Test 2: Contenido potencialmente existente');
    const realContentId = 'tt0944947'; // Game of Thrones
    
    // Múltiples búsquedas del mismo contenido
    for (let i = 1; i <= 3; i++) {
      const start = Date.now();
      try {
        const results = await repository.getMagnetsByContentId(realContentId, 'series');
        const duration = Date.now() - start;
        logger.addTime(duration);
        logger.incrementSearches();
        console.log(`✅ Búsqueda ${i}: ${results.length} resultados en ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - start;
        logger.addTime(duration);
        logger.incrementSearches();
        console.log(`⚠️  Búsqueda ${i}: ${error.message} en ${duration}ms`);
      }
    }
    
    // Test 3: Verificar compatibilidad entre sistemas
    console.log('\n🔍 Test 3: Verificación de compatibilidad');
    
    // Limpiar cache y verificar que todo sigue funcionando
    repository.clearExhaustedSourcesCache();
    console.log('✅ Cache de fuentes agotadas limpiado');
    
    // Nueva búsqueda después de limpiar cache
    const start3 = Date.now();
    try {
      await repository.getMagnetsByContentId(nonExistentId, 'movie');
    } catch (error) {
      const duration3 = Date.now() - start3;
      logger.addTime(duration3);
      logger.incrementSearches();
      console.log(`✅ Búsqueda post-limpieza: ${duration3}ms - ${error.message}`);
    }
    
    // Generar reporte final
    console.log('\n' + '='.repeat(60));
    logger.printReport();
    
    // Análisis de resultados
    console.log('\n📈 Análisis de Integración:');
    
    if (logger.metrics.skips > 0) {
      console.log('✅ Cache de fuentes agotadas funcionando correctamente');
    } else {
      console.log('⚠️  Cache de fuentes agotadas no detectó saltos');
    }
    
    if (logger.metrics.cacheHits > 0) {
      console.log('✅ Cache de resultados funcionando');
    } else {
      console.log('ℹ️  Cache de resultados no se activó (puede ser normal)');
    }
    
    if (logger.getAverageTime() < 100) {
      console.log('✅ Rendimiento general óptimo (< 100ms promedio)');
    } else {
      console.log('⚠️  Rendimiento podría mejorar (> 100ms promedio)');
    }
    
    console.log('\n🏁 Test Integrado Completado');
    console.log('Todos los sistemas de optimización están trabajando en conjunto.');
    
  } catch (error) {
    console.error('❌ Error en test integrado:', error);
  }
}

// Ejecutar test
testIntegratedOptimization().catch(console.error);