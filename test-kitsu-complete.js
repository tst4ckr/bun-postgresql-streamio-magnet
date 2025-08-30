#!/usr/bin/env bun
/**
 * Script de prueba completo para verificar el flujo de Kitsu ID → IMDb → Magnet
 * Este script prueba el flujo completo con Kitsu IDs conocidos
 */

import { UnifiedIdService } from './src/application/services/UnifiedIdService.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import path from 'path';

// Logger simple para evitar problemas de configuración
const logger = {
  info: (msg, data) => console.info(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: (msg, data) => console.debug(`[DEBUG] ${msg}`, data || '')
};

// Kitsu IDs conocidos para probar
const TEST_KITSU_IDS = [
  'kitsu:1',    // Sword Art Online
  'kitsu:5',    // Attack on Titan
  'kitsu:11',   // Kimetsu no Yaiba
  'kitsu:12',   // Jujutsu Kaisen
  'kitsu:21'    // One Punch Man
];

async function testKitsuFlow() {
  console.log('🧪 Iniciando prueba de flujo Kitsu → IMDb → Magnet');
  console.log('='.repeat(60));

  try {
    // Inicializar servicios con configuración básica
    const unifiedIdService = new UnifiedIdService(logger);
    
    // Repositorio de anime.csv
    const animeRepo = new CSVMagnetRepository(
      path.join(process.cwd(), 'data', 'anime.csv'),
      logger
    );
    
    // Servicio Torrentio
    const torrentioService = new TorrentioApiService(
      'https://torrentio.strem.fun',
      path.join(process.cwd(), 'data', 'torrentio.csv'),
      logger
    );

    await animeRepo.initialize();

    const results = [];

    for (const kitsuId of TEST_KITSU_IDS) {
      console.log(`\n🔍 Procesando: ${kitsuId}`);
      
      try {
        // Paso 1: Convertir Kitsu ID a IMDb
        console.log(`   → Convirtiendo Kitsu ID a IMDb...`);
        const conversion = await unifiedIdService.processContentId(kitsuId);
        
        if (!conversion.success) {
          console.log(`   ❌ Error: ${conversion.error}`);
          results.push({ kitsuId, error: conversion.error });
          continue;
        }

        const imdbId = conversion.imdbId;
        console.log(`   ✅ IMDb ID: ${imdbId}`);

        // Paso 2: Buscar en anime.csv
        console.log(`   → Buscando en anime.csv...`);
        const animeMagnets = await animeRepo.getMagnetsByImdbId(imdbId);
        
        if (animeMagnets.length > 0) {
          console.log(`   ✅ Encontrados ${animeMagnets.length} magnets en anime.csv`);
          results.push({ 
            kitsuId, 
            imdbId, 
            source: 'anime.csv',
            magnets: animeMagnets.length,
            firstMagnet: animeMagnets[0]?.title || 'Sin título'
          });
          continue;
        }

        // Paso 3: Buscar en Torrentio API
        console.log(`   → Consultando API Torrentio...`);
        const torrentioMagnets = await torrentioService.searchMagnetsByImdbId(imdbId, 'anime');
        
        if (torrentioMagnets.length > 0) {
          console.log(`   ✅ Encontrados ${torrentioMagnets.length} magnets en Torrentio`);
          results.push({ 
            kitsuId, 
            imdbId, 
            source: 'torrentio.api',
            magnets: torrentioMagnets.length,
            firstMagnet: torrentioMagnets[0]?.title || 'Sin título'
          });
        } else {
          console.log(`   ⚠️  No se encontraron magnets`);
          results.push({ 
            kitsuId, 
            imdbId, 
            source: 'none',
            magnets: 0,
            error: 'No se encontraron magnets'
          });
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({ kitsuId, error: error.message });
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE PRUEBA');
    console.log('='.repeat(60));
    
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.kitsuId}: ${result.error}`);
      } else {
        console.log(`✅ ${result.kitsuId} → ${result.imdbId}: ${result.magnets} magnets (${result.source})`);
        if (result.firstMagnet) {
          console.log(`   Título: ${result.firstMagnet}`);
        }
      }
    });

    // Estadísticas
    const successful = results.filter(r => !r.error).length;
    const withMagnets = results.filter(r => r.magnets > 0).length;
    console.log(`\n📈 Estadísticas:`);
    console.log(`   - Total procesados: ${results.length}`);
    console.log(`   - Exitosos: ${successful}`);
    console.log(`   - Con magnets: ${withMagnets}`);

  } catch (error) {
    console.error('Error general:', error);
  }
}

// Ejecutar prueba
if (import.meta.main) {
  testKitsuFlow();
}