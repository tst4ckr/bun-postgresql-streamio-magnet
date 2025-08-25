/**
 * Script de prueba simple para validar la integración con Torrentio
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { existsSync } from 'fs';
import { join } from 'path';

// Configuración
const CONFIG = {
  torrentioUrl: 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB',
  magnetsPath: './data/magnets.csv',
  torrentioPath: './data/torrentio.csv'
};

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`✅ [INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`⚠️ [WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`❌ [ERROR] ${msg}`, ...args)
};

async function testTorrentioIntegration() {
  console.log('🚀 Iniciando pruebas de integración con Torrentio\n');
  
  try {
    // 1. Verificar archivos CSV
    console.log('📁 Verificando archivos CSV...');
    
    if (existsSync(CONFIG.magnetsPath)) {
      logger.info(`Archivo magnets.csv encontrado: ${CONFIG.magnetsPath}`);
    } else {
      logger.error(`Archivo magnets.csv NO encontrado: ${CONFIG.magnetsPath}`);
      return;
    }
    
    if (existsSync(CONFIG.torrentioPath)) {
      logger.info(`Archivo torrentio.csv encontrado: ${CONFIG.torrentioPath}`);
    } else {
      logger.error(`Archivo torrentio.csv NO encontrado: ${CONFIG.torrentioPath}`);
      return;
    }
    
    // 2. Probar conexión con API de Torrentio
    console.log('\n🌐 Probando conexión con API de Torrentio...');
    
    const apiService = new TorrentioApiService(CONFIG.torrentioUrl, CONFIG.torrentioPath, logger);
    
    // Probar con un IMDb ID conocido
    const testImdbId = 'tt0111161'; // The Shawshank Redemption
    logger.info(`Probando búsqueda para IMDb ID: ${testImdbId}`);
    
    const apiResults = await apiService.searchMagnetsByImdbId(testImdbId);
    
    if (apiResults && apiResults.length > 0) {
      logger.info(`API respondió con ${apiResults.length} resultados`);
      console.log('Primer resultado:', {
        name: apiResults[0].name,
        quality: apiResults[0].quality,
        size: apiResults[0].size
      });
    } else {
      logger.warn('API no devolvió resultados');
    }
    
    // 3. Probar repositorio en cascada
    console.log('\n🔄 Probando búsqueda en cascada...');
    
    const cascadingRepo = new CascadingMagnetRepository(
      CONFIG.magnetsPath,
      CONFIG.torrentioPath,
      CONFIG.torrentioUrl,
      logger
    );
    
    await cascadingRepo.initialize();
    
    const cascadeResults = await cascadingRepo.getMagnetsByImdbId(testImdbId);
    
    if (cascadeResults && cascadeResults.length > 0) {
      logger.info(`Búsqueda en cascada encontró ${cascadeResults.length} resultados`);
      console.log('Fuentes encontradas:', cascadeResults.map(r => r.source || 'unknown'));
    } else {
      logger.warn('Búsqueda en cascada no devolvió resultados');
    }
    
    // 4. Mostrar estadísticas
    console.log('\n📊 Estadísticas del repositorio:');
    const stats = cascadingRepo.getRepositoryStats();
    console.log(JSON.stringify(stats, null, 2));
    
    console.log('\n✅ Pruebas completadas exitosamente');
    
  } catch (error) {
    logger.error('Error durante las pruebas:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar pruebas
testTorrentioIntegration();