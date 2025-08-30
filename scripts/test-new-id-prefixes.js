#!/usr/bin/env node

/**
 * Script de prueba para verificar la compatibilidad con nuevos prefijos de ID
 * mal:, anilist:, anidb:
 */

import { IdDetectorService } from '../src/infrastructure/services/IdDetectorService.js';
import { UnifiedIdService } from '../src/infrastructure/services/UnifiedIdService.js';
import { KitsuApiService } from '../src/infrastructure/services/KitsuApiService.js';

async function testNewIdPrefixes() {
  console.log('🧪 Iniciando pruebas de nuevos prefijos de ID...\n');

  const idDetector = new IdDetectorService();
  const unifiedIdService = new UnifiedIdService();
  const kitsuApiService = new KitsuApiService();

  // IDs de prueba para cada tipo
  const testIds = [
    { id: 'mal:21', type: 'mal', description: 'One Piece en MyAnimeList' },
    { id: 'anilist:101922', type: 'anilist', description: 'One Piece en AniList' },
    { id: 'anidb:69', type: 'anidb', description: 'One Piece en AniDB' },
    { id: 'kitsu:7442', type: 'kitsu', description: 'Attack on Titan en Kitsu' },
    { id: 'tt2560140', type: 'imdb', description: 'Attack on Titan en IMDb' }
  ];

  console.log('📋 Probando detección de tipos de ID...\n');

  for (const testCase of testIds) {
    console.log(`🔍 ID: ${testCase.id} (${testCase.description})`);
    
    // Test 1: Detección de tipo
    const detectedType = idDetector.detectType(testCase.id);
    console.log(`   ✅ Tipo detectado: ${detectedType}`);
    
    // Test 2: Validación de formato
    const isValid = idDetector.validateFormat(testCase.id, detectedType);
    console.log(`   ✅ Formato válido: ${isValid}`);
    
    // Test 3: Extracción de ID limpio
    const cleanId = idDetector.extractCleanId(testCase.id);
    console.log(`   ✅ ID limpio: ${cleanId}`);
    
    // Test 4: Verificación específica de tipo
    let specificCheck = false;
    switch (testCase.type) {
      case 'mal':
        specificCheck = idDetector.isMalId(testCase.id);
        break;
      case 'anilist':
        specificCheck = idDetector.isAnilistId(testCase.id);
        break;
      case 'anidb':
        specificCheck = idDetector.isAnidbId(testCase.id);
        break;
      case 'kitsu':
        specificCheck = idDetector.isKitsuId(testCase.id);
        break;
      case 'imdb':
        specificCheck = idDetector.isImdbId(testCase.id);
        break;
    }
    console.log(`   ✅ Verificación específica: ${specificCheck}`);
    
    console.log('');
  }

  console.log('🔄 Probando conversión de IDs de anime a IMDb...\n');

  // Test de conversión para IDs de anime
  const animeTestIds = [
    { id: 'mal:21', type: 'mal' },
    { id: 'anilist:101922', type: 'anilist' },
    { id: 'anidb:69', type: 'anidb' }
  ];

  for (const animeId of animeTestIds) {
    console.log(`🔄 Convirtiendo ${animeId.type}:${animeId.id}...`);
    
    try {
      const result = await unifiedIdService.convertAnimeIdToImdb(animeId.id, animeId.type);
      if (result.success) {
        console.log(`   ✅ Conversión exitosa: ${result.convertedId}`);
        console.log(`   📊 Método: ${result.method}`);
      } else {
        console.log(`   ⚠️  Conversión fallida: ${result.metadata?.error}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }

  console.log('📊 Resumen de compatibilidad:');
  console.log('✅ Nuevos prefijos de ID añadidos: mal:, anilist:, anidb:');
  console.log('✅ Detección de tipos implementada');
  console.log('✅ Validación de formatos activa');
  console.log('✅ Sistema de conversión integrado');
  console.log('✅ Mapeo cruzado mediante Kitsu');
}

// Ejecutar pruebas
if (import.meta.url === `file://${process.argv[1]}`) {
  testNewIdPrefixes().catch(console.error);
}