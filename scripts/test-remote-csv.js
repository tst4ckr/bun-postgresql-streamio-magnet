#!/usr/bin/env node

/**
 * @fileoverview Script de prueba para cargar magnets desde URLs remotas
 * Demuestra el uso de la nueva funcionalidad de URLs remotas
 */

import { MagnetRepositoryFactory } from '../src/infrastructure/factories/MagnetRepositoryFactory.js';
import { addonConfig } from '../src/config/addonConfig.js';

/**
 * Logger simple para el script de prueba
 */
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

/**
 * Prueba la carga de magnets desde diferentes fuentes
 */
async function testMagnetSources() {
  logger.info('🧪 Iniciando pruebas de fuentes de magnets...');
  
  // Prueba 1: Archivo local
  try {
    logger.info('\n📁 Probando archivo local...');
    const localRepo = MagnetRepositoryFactory.create('./data/magnets.csv', logger);
    await localRepo.initialize();
    const localMagnets = await localRepo.getAllMagnets();
    logger.info(`✅ Archivo local: ${localMagnets.length} magnets cargados`);
  } catch (error) {
    logger.error(`❌ Error con archivo local: ${error.message}`);
  }

  // Prueba 2: URL remota (ejemplo)
  try {
    logger.info('\n🌐 Probando URL remota de ejemplo...');
    // Nota: Esta URL es solo un ejemplo, reemplazar con una URL real
    const remoteUrl = 'https://raw.githubusercontent.com/example/magnets/main/magnets.csv';
    
    // Validar primero si la URL es accesible
    const isValid = await MagnetRepositoryFactory.validate(remoteUrl);
    if (!isValid) {
      logger.warn(`⚠️  URL no accesible: ${remoteUrl}`);
      return;
    }
    
    const remoteRepo = MagnetRepositoryFactory.create(remoteUrl, logger, 10000);
    await remoteRepo.initialize();
    const remoteMagnets = await remoteRepo.getAllMagnets();
    logger.info(`✅ URL remota: ${remoteMagnets.length} magnets cargados`);
  } catch (error) {
    logger.error(`❌ Error con URL remota: ${error.message}`);
  }

  // Prueba 3: Configuración actual
  try {
    logger.info('\n⚙️  Probando configuración actual...');
    const currentRepo = MagnetRepositoryFactory.create(
      addonConfig.repository.csvSource,
      logger,
      addonConfig.repository.timeout
    );
    await currentRepo.initialize();
    const currentMagnets = await currentRepo.getAllMagnets();
    logger.info(`✅ Configuración actual: ${currentMagnets.length} magnets cargados`);
    
    // Mostrar algunos ejemplos
    if (currentMagnets.length > 0) {
      logger.info('\n📋 Ejemplos de magnets cargados:');
      currentMagnets.slice(0, 3).forEach((magnet, index) => {
        logger.info(`  ${index + 1}. ${magnet.title} (${magnet.quality}) - IMDB: ${magnet.imdb_id}`);
      });
    }
  } catch (error) {
    logger.error(`❌ Error con configuración actual: ${error.message}`);
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    await testMagnetSources();
    logger.info('\n🎉 Pruebas completadas');
  } catch (error) {
    logger.error(`💥 Error general: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}