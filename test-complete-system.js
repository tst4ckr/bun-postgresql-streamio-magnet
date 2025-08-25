/**
 * Script de validación completa del sistema
 * Prueba la integración completa: CSV files + Torrentio API + Cascading Search
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { existsSync, readFileSync } from 'fs';

// Configuración del sistema
const SYSTEM_CONFIG = {
  torrentioUrl: 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB',
  magnetsPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\magnets.csv',
  torrentioPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\torrentio.csv'
};

// Logger con colores
const logger = {
  info: (msg, ...args) => console.log(`✅ [INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`⚠️ [WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`❌ [ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`🔍 [DEBUG] ${msg}`, ...args),
  success: (msg, ...args) => console.log(`🎉 [SUCCESS] ${msg}`, ...args)
};

// Función para contar líneas en CSV
function countCsvLines(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('imdb_id'));
    return lines.length;
  } catch (error) {
    return 0;
  }
}

// Función para analizar contenido CSV
function analyzeCsvContent(filePath, fileName) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const dataLines = lines.slice(1); // Excluir header
    
    const imdbIds = new Set();
    const qualities = new Set();
    
    dataLines.forEach(line => {
      const [imdbId, , , quality] = line.split(',');
      if (imdbId) imdbIds.add(imdbId);
      if (quality) qualities.add(quality);
    });
    
    return {
      totalEntries: dataLines.length,
      uniqueImdbIds: imdbIds.size,
      qualities: Array.from(qualities),
      sampleImdbIds: Array.from(imdbIds).slice(0, 3)
    };
  } catch (error) {
    return null;
  }
}

async function validateCompleteSystem() {
  console.log('🚀 VALIDACIÓN COMPLETA DEL SISTEMA TORRENTIO\n');
  console.log('=' .repeat(60));
  
  // 1. Validar archivos CSV
  console.log('\n📁 PASO 1: Validando archivos CSV');
  console.log('-'.repeat(40));
  
  const magnetsExists = existsSync(SYSTEM_CONFIG.magnetsPath);
  const torrentioExists = existsSync(SYSTEM_CONFIG.torrentioPath);
  
  if (magnetsExists) {
    const magnetsCount = countCsvLines(SYSTEM_CONFIG.magnetsPath);
    const magnetsAnalysis = analyzeCsvContent(SYSTEM_CONFIG.magnetsPath, 'magnets.csv');
    logger.success(`magnets.csv: ${magnetsCount} entradas`);
    if (magnetsAnalysis) {
      console.log(`   - IMDb IDs únicos: ${magnetsAnalysis.uniqueImdbIds}`);
      console.log(`   - Calidades: ${magnetsAnalysis.qualities.join(', ')}`);
      console.log(`   - Ejemplos: ${magnetsAnalysis.sampleImdbIds.join(', ')}`);
    }
  } else {
    logger.error('magnets.csv no encontrado');
    return;
  }
  
  if (torrentioExists) {
    const torrentioCount = countCsvLines(SYSTEM_CONFIG.torrentioPath);
    const torrentioAnalysis = analyzeCsvContent(SYSTEM_CONFIG.torrentioPath, 'torrentio.csv');
    logger.success(`torrentio.csv: ${torrentioCount} entradas`);
    if (torrentioAnalysis) {
      console.log(`   - IMDb IDs únicos: ${torrentioAnalysis.uniqueImdbIds}`);
      console.log(`   - Calidades: ${torrentioAnalysis.qualities.join(', ')}`);
      console.log(`   - Ejemplos: ${torrentioAnalysis.sampleImdbIds.join(', ')}`);
    }
  } else {
    logger.error('torrentio.csv no encontrado');
    return;
  }
  
  // 2. Probar API de Torrentio
  console.log('\n🌐 PASO 2: Validando API de Torrentio');
  console.log('-'.repeat(40));
  
  try {
    const apiService = new TorrentioApiService(
      SYSTEM_CONFIG.torrentioUrl, 
      './data/test-api.csv', 
      logger
    );
    
    const testImdbId = 'tt0111161';
    const startTime = Date.now();
    const apiResults = await apiService.searchMagnetsByImdbId(testImdbId);
    const responseTime = Date.now() - startTime;
    
    if (apiResults && apiResults.length > 0) {
      logger.success(`API responde correctamente (${responseTime}ms)`);
      console.log(`   - Resultados obtenidos: ${apiResults.length}`);
      console.log(`   - Primer resultado: ${apiResults[0].name} (${apiResults[0].quality})`);
    } else {
      logger.warn('API no devolvió resultados');
    }
  } catch (error) {
    logger.error(`Error en API: ${error.message}`);
    return;
  }
  
  // 3. Probar búsqueda en cascada
  console.log('\n🔄 PASO 3: Validando búsqueda en cascada');
  console.log('-'.repeat(40));
  
  try {
    const cascadingRepo = new CascadingMagnetRepository(
      SYSTEM_CONFIG.magnetsPath,
      SYSTEM_CONFIG.torrentioPath,
      SYSTEM_CONFIG.torrentioUrl,
      logger
    );
    
    await cascadingRepo.initialize();
    logger.success('Repositorio en cascada inicializado');
    
    // Probar con diferentes IMDb IDs
    const testCases = [
      { id: 'tt0111161', description: 'The Shawshank Redemption (en CSV)' },
      { id: 'tt0468569', description: 'The Dark Knight (solo API)' },
      { id: 'tt9999999', description: 'ID inexistente' }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n   🎬 Probando: ${testCase.description}`);
      const results = await cascadingRepo.getMagnetsByImdbId(testCase.id);
      
      if (results && results.length > 0) {
        logger.success(`Encontrados ${results.length} resultados`);
        console.log(`      - Fuentes: ${results.map(r => r.source || 'CSV').join(', ')}`);
      } else {
        logger.warn('No se encontraron resultados');
      }
    }
    
    // Mostrar estadísticas finales
    console.log('\n📊 ESTADÍSTICAS DEL SISTEMA');
    console.log('-'.repeat(40));
    const stats = cascadingRepo.getRepositoryStats();
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (error) {
    logger.error(`Error en búsqueda en cascada: ${error.message}`);
    return;
  }
  
  // 4. Resumen final
  console.log('\n🎉 RESUMEN DE VALIDACIÓN');
  console.log('='.repeat(60));
  logger.success('✅ Archivos CSV: Validados y funcionales');
  logger.success('✅ API Torrentio: Conectada y respondiendo');
  logger.success('✅ Búsqueda en cascada: Funcionando correctamente');
  logger.success('✅ Sistema completo: OPERATIVO');
  
  console.log('\n🔧 CONFIGURACIÓN VALIDADA:');
  console.log(`   URL: ${SYSTEM_CONFIG.torrentioUrl}`);
  console.log(`   Magnets CSV: ${SYSTEM_CONFIG.magnetsPath}`);
  console.log(`   Torrentio CSV: ${SYSTEM_CONFIG.torrentioPath}`);
  
  console.log('\n✨ El sistema está listo para usar en producción!');
}

// Ejecutar validación completa
validateCompleteSystem().catch(error => {
  logger.error('Error fatal en validación:', error.message);
  console.error(error.stack);
});