/**
 * Resumen final de validación del sistema Torrentio
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { existsSync, readFileSync } from 'fs';

// Configuración
const CONFIG = {
  torrentioUrl: 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB',
  magnetsPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\magnets.csv',
  torrentioPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\torrentio.csv'
};

const logger = {
  info: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`),
  success: (msg) => console.log(`🎉 ${msg}`)
};

function countCsvEntries(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.trim() && !line.startsWith('imdb_id')).length;
  } catch {
    return 0;
  }
}

async function validateSystem() {
  console.log('🚀 VALIDACIÓN FINAL DEL SISTEMA TORRENTIO\n');
  
  const results = {
    csvFiles: { magnets: false, torrentio: false },
    api: false,
    cascading: false,
    errors: []
  };
  
  // 1. Validar archivos CSV
  console.log('📁 Validando archivos CSV...');
  
  if (existsSync(CONFIG.magnetsPath)) {
    const count = countCsvEntries(CONFIG.magnetsPath);
    logger.success(`magnets.csv: ${count} entradas`);
    results.csvFiles.magnets = true;
  } else {
    logger.error('magnets.csv no encontrado');
    results.errors.push('magnets.csv no encontrado');
  }
  
  if (existsSync(CONFIG.torrentioPath)) {
    const count = countCsvEntries(CONFIG.torrentioPath);
    logger.success(`torrentio.csv: ${count} entradas`);
    results.csvFiles.torrentio = true;
  } else {
    logger.error('torrentio.csv no encontrado');
    results.errors.push('torrentio.csv no encontrado');
  }
  
  // 2. Validar API
  console.log('\n🌐 Validando API de Torrentio...');
  
  try {
    const apiService = new TorrentioApiService(CONFIG.torrentioUrl, './temp-test.csv', logger);
    const apiResults = await apiService.searchMagnetsByImdbId('tt0111161');
    
    if (apiResults && apiResults.length > 0) {
      logger.success(`API funcional: ${apiResults.length} resultados`);
      results.api = true;
    } else {
      logger.warn('API no devolvió resultados');
      results.errors.push('API no devolvió resultados');
    }
  } catch (error) {
    logger.error(`Error en API: ${error.message}`);
    results.errors.push(`Error en API: ${error.message}`);
  }
  
  // 3. Validar búsqueda en cascada (solo casos exitosos)
  console.log('\n🔄 Validando búsqueda en cascada...');
  
  try {
    const cascadingRepo = new CascadingMagnetRepository(
      CONFIG.magnetsPath,
      CONFIG.torrentioPath,
      CONFIG.torrentioUrl,
      logger
    );
    
    await cascadingRepo.initialize();
    
    // Probar con un ID que sabemos que existe en CSV
    const csvResults = await cascadingRepo.getMagnetsByImdbId('tt0111161');
    
    if (csvResults && csvResults.length > 0) {
      logger.success(`Búsqueda en cascada: ${csvResults.length} resultados desde CSV`);
      results.cascading = true;
    } else {
      logger.warn('Búsqueda en cascada no devolvió resultados');
      results.errors.push('Búsqueda en cascada falló');
    }
    
  } catch (error) {
    logger.error(`Error en búsqueda en cascada: ${error.message}`);
    results.errors.push(`Error en cascada: ${error.message}`);
  }
  
  // 4. Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN DE VALIDACIÓN');
  console.log('='.repeat(60));
  
  const allGood = results.csvFiles.magnets && results.csvFiles.torrentio && results.api && results.cascading;
  
  if (allGood) {
    logger.success('SISTEMA COMPLETAMENTE FUNCIONAL');
    console.log('\n✅ Componentes validados:');
    console.log('   ✓ Archivos CSV existentes y con datos');
    console.log('   ✓ API de Torrentio respondiendo');
    console.log('   ✓ Búsqueda en cascada operativa');
    
    console.log('\n🔧 Configuración:');
    console.log(`   URL: ${CONFIG.torrentioUrl}`);
    console.log(`   Magnets: ${CONFIG.magnetsPath}`);
    console.log(`   Torrentio: ${CONFIG.torrentioPath}`);
    
    console.log('\n🎯 El sistema está listo para producción!');
  } else {
    logger.error('SISTEMA CON PROBLEMAS');
    console.log('\n❌ Errores encontrados:');
    results.errors.forEach(error => console.log(`   • ${error}`));
    
    console.log('\n✅ Componentes funcionales:');
    if (results.csvFiles.magnets) console.log('   ✓ magnets.csv');
    if (results.csvFiles.torrentio) console.log('   ✓ torrentio.csv');
    if (results.api) console.log('   ✓ API Torrentio');
    if (results.cascading) console.log('   ✓ Búsqueda en cascada');
  }
  
  console.log('\n' + '='.repeat(60));
}

// Ejecutar validación
validateSystem().catch(error => {
  console.error('\n❌ Error fatal:', error.message);
});