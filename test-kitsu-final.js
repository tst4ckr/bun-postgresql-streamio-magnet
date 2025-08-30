#!/usr/bin/env bun
/**
 * Script final de prueba para verificar el flujo completo Kitsu → IMDb → Magnet
 * Usa los servicios reales y verifica cada paso del proceso
 */

import { UnifiedIdService } from './src/infrastructure/services/UnifiedIdService.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import path from 'path';
import fs from 'fs';

// Logger simple
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: (msg, data) => console.debug(`[DEBUG] ${msg}`, data || '')
};

// Kitsu IDs conocidos para prueba
const TEST_KITSU_IDS = [
  'kitsu:1',    // Cowboy Bebop
  'kitsu:5',    // Naruto
  'kitsu:11',   // Attack on Titan
  'kitsu:12',   // Death Note
  'kitsu:21',   // One Piece
  'kitsu:48671', // Sword Art Online
  'kitsu:3937'  // Fullmetal Alchemist
];

// IMDb IDs conocidos de anime para prueba directa
const TEST_IMDB_IDS = [
  'tt0111161', // The Shawshank Redemption (control)
  'tt0112178', // Cowboy Bebop: The Movie
  'tt0988824', // Naruto
  'tt2560140', // Attack on Titan
  'tt0877057', // Death Note
  'tt0388629'  // One Piece
];

async function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

async function testKitsuFlow() {
  console.log('🧪 Iniciando prueba completa de flujo Kitsu');
  console.log('='.repeat(70));

  try {
    // Asegurar directorio de datos
    const dataDir = await ensureDataDirectory();
    
    // Inicializar servicios
    console.log('📦 Inicializando servicios...');
    
    const unifiedIdService = new UnifiedIdService(logger);
    const animeRepo = new CSVMagnetRepository(
      path.join(dataDir, 'anime.csv'),
      logger
    );
    
    // Crear archivo anime.csv si no existe
    const animeCsvPath = path.join(dataDir, 'anime.csv');
    if (!fs.existsSync(animeCsvPath)) {
      fs.writeFileSync(animeCsvPath, 'imdb_id,title,magnet_url,quality,size,seeders\n');
      console.log('✅ Creado anime.csv vacío');
    }
    
    await animeRepo.initialize();
    console.log('✅ Repositorio anime inicializado');

    const results = [];

    // Prueba 1: Conversión Kitsu → IMDb
    console.log('\n🔍 PRUEBA 1: Conversión Kitsu → IMDb');
    console.log('-'.repeat(50));
    
    for (const kitsuId of TEST_KITSU_IDS) {
      console.log(`\n📋 Procesando: ${kitsuId}`);
      
      try {
        const conversion = await unifiedIdService.processContentId(kitsuId, 'imdb');
        
        if (conversion.success) {
          console.log(`   ✅ IMDb: ${conversion.processedId}`);
          console.log(`   📊 Método: ${conversion.metadata?.sourceType} → ${conversion.metadata?.targetType}`);
          
          // Paso 2: Buscar en anime.csv
          console.log(`   → Buscando en anime.csv...`);
          const animeMagnets = await animeRepo.getMagnetsByImdbId(conversion.processedId);
          
          if (animeMagnets.length > 0) {
            console.log(`   ✅ Encontrados ${animeMagnets.length} magnets`);
            results.push({
              kitsuId,
              imdbId: conversion.processedId,
              source: 'anime.csv',
              magnets: animeMagnets.length,
              titles: animeMagnets.map(m => m.title).slice(0, 3)
            });
          } else {
            console.log(`   ⚠️  No encontrado en anime.csv`);
            results.push({
              kitsuId,
              imdbId: conversion.processedId,
              source: 'anime.csv',
              magnets: 0,
              note: 'No encontrado localmente'
            });
          }
        } else {
          console.log(`   ❌ Error: ${conversion.metadata?.error || 'Conversión fallida'}`);
          results.push({ 
            kitsuId, 
            error: conversion.metadata?.error || 'Conversión fallida' 
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({ kitsuId, error: error.message });
      }
    }

    // Prueba 2: Búsqueda directa con IMDb IDs conocidos
    console.log('\n🔍 PRUEBA 2: Búsqueda directa con IMDb IDs');
    console.log('-'.repeat(50));
    
    for (const imdbId of TEST_IMDB_IDS) {
      console.log(`\n📋 Procesando: ${imdbId}`);
      
      try {
        const animeMagnets = await animeRepo.getMagnetsByImdbId(imdbId);
        
        if (animeMagnets.length > 0) {
          console.log(`   ✅ Encontrados ${animeMagnets.length} magnets`);
          results.push({
            imdbId,
            source: 'anime.csv',
            magnets: animeMagnets.length,
            titles: animeMagnets.map(m => m.title).slice(0, 3)
          });
        } else {
          console.log(`   ⚠️  No encontrado en anime.csv`);
          results.push({
            imdbId,
            source: 'anime.csv',
            magnets: 0,
            note: 'No encontrado'
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({ imdbId, error: error.message });
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE PRUEBA COMPLETA');
    console.log('='.repeat(70));
    
    const kitsuResults = results.filter(r => r.kitsuId);
    const imdbResults = results.filter(r => r.imdbId && !r.kitsuId);
    
    console.log('\n🎯 Resultados Kitsu → IMDb:');
    kitsuResults.forEach(r => {
      if (r.error) {
        console.log(`❌ ${r.kitsuId}: ${r.error}`);
      } else {
        console.log(`✅ ${r.kitsuId} → ${r.imdbId}: ${r.magnets} magnets (${r.source})`);
        if (r.titles && r.titles.length > 0) {
          console.log(`   Títulos: ${r.titles.join(', ')}`);
        }
      }
    });

    console.log('\n🎯 Resultados IMDb directos:');
    imdbResults.forEach(r => {
      if (r.error) {
        console.log(`❌ ${r.imdbId}: ${r.error}`);
      } else {
        console.log(`✅ ${r.imdbId}: ${r.magnets} magnets (${r.source})`);
        if (r.titles && r.titles.length > 0) {
          console.log(`   Títulos: ${r.titles.join(', ')}`);
        }
      }
    });

    // Estadísticas
    const successfulKitsu = kitsuResults.filter(r => !r.error).length;
    const withMagnetsKitsu = kitsuResults.filter(r => r.magnets > 0).length;
    const successfulImdb = imdbResults.filter(r => !r.error).length;
    const withMagnetsImdb = imdbResults.filter(r => r.magnets > 0).length;

    console.log('\n📈 Estadísticas finales:');
    console.log(`   Kitsu IDs procesados: ${kitsuResults.length}`);
    console.log(`   Kitsu → IMDb exitosos: ${successfulKitsu}`);
    console.log(`   Kitsu con magnets: ${withMagnetsKitsu}`);
    console.log(`   IMDb IDs procesados: ${imdbResults.length}`);
    console.log(`   IMDb con magnets: ${withMagnetsImdb}`);

    console.log('\n✅ Prueba completada exitosamente');

  } catch (error) {
    console.error('Error general:', error);
    console.error(error.stack);
  }
}

// Ejecutar si es el archivo principal
if (import.meta.main) {
  testKitsuFlow();
}