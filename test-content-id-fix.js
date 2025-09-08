#!/usr/bin/env node

/**
 * Script para probar la compatibilidad mejorada de content_id
 * Verifica que todos los tipos de ID se manejen correctamente
 */

import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { addonConfig } from './src/config/addonConfig.js';
import { join } from 'path';

const testIds = [
  // IMDb IDs
  { id: 'tt0111161', expected: 'tt0111161', type: 'imdb' },
  { id: 'tt0944947', expected: 'tt0944947', type: 'imdb' },
  
  // TMDB IDs
  { id: '550', expected: 'tmdb:550', type: 'tmdb' },
  { id: 'tmdb:550', expected: 'tmdb:550', type: 'tmdb' },
  
  // TVDB IDs
  { id: '121361', expected: 'tvdb:121361', type: 'tvdb' },
  { id: 'tvdb:121361', expected: 'tvdb:121361', type: 'tvdb' },
  
  // Kitsu IDs
  { id: '1', expected: 'kitsu:1', type: 'kitsu' },
  { id: 'kitsu:1', expected: 'kitsu:1', type: 'kitsu' },
  { id: 'one-piece', expected: 'kitsu:one-piece', type: 'kitsu' },
  { id: 'kitsu:one-piece', expected: 'kitsu:one-piece', type: 'kitsu' },
  { id: 'kitsu:1:1:1', expected: 'kitsu:1:1:1', type: 'kitsu' }, // Con temporada/episodio
  
  // AniList IDs
  { id: '21', expected: 'anilist:21', type: 'anilist' },
  { id: 'anilist:21', expected: 'anilist:21', type: 'anilist' },
  
  // MAL IDs
  { id: '16498', expected: 'mal:16498', type: 'mal' },
  { id: 'mal:16498', expected: 'mal:16498', type: 'mal' }
];

async function testContentIdCompatibility() {
  console.log('🧪 Probando compatibilidad de content_id...');
  
  try {
    // Crear instancia del servicio
    const service = new TorrentioApiService(
      addonConfig.repository.torrentioApiUrl,
      addonConfig.repository.secondaryCsvPath,
      console,
      addonConfig.repository.timeout,
      { enabled: false },
      addonConfig.repository.englishCsvPath
    );
    
    let passedTests = 0;
    let totalTests = testIds.length;
    
    for (const test of testIds) {
      try {
        // Simular la lógica de procesamiento de content_id
        const originalId = test.id.trim();
        let processedId = originalId;
        let idType = 'imdb'; // Por defecto
        
        // Detectar tipo de ID
        if (originalId.match(/^tt\d+$/i)) {
          processedId = originalId;
          idType = 'imdb';
        } else if (originalId.match(/^(?:tmdb:)?\d+$/i)) {
          processedId = originalId.replace(/^tmdb:/i, '');
          idType = 'tmdb';
        } else if (originalId.match(/^(?:tvdb:)?\d+$/i)) {
          processedId = originalId.replace(/^tvdb:/i, '');
          idType = 'tvdb';
        } else if (originalId.match(/^(?:kitsu:)?(?:\d+|[\w-]+)$/i)) {
          processedId = originalId.replace(/^kitsu:/i, '');
          idType = 'kitsu';
        } else if (originalId.match(/^(?:anilist:)?\d+$/i)) {
          processedId = originalId.replace(/^anilist:/i, '');
          idType = 'anilist';
        } else if (originalId.match(/^(?:mal:)?\d+$/i)) {
          processedId = originalId.replace(/^mal:/i, '');
          idType = 'mal';
        }
        
        // Simular la lógica de finalContentId
        let finalContentId;
        if (idType === 'kitsu') {
          finalContentId = test.id.includes(':') ? test.id : `kitsu:${processedId}`;
        } else if (idType === 'imdb') {
          finalContentId = processedId;
        } else {
          finalContentId = `${idType}:${processedId}`;
        }
        
        const passed = finalContentId === test.expected;
        console.log(`   ${passed ? '✅' : '❌'} ${test.id} → ${finalContentId} (esperado: ${test.expected})`);
        
        if (passed) passedTests++;
        
      } catch (error) {
        console.log(`   ❌ ${test.id} → Error: ${error.message}`);
      }
    }
    
    console.log(`\n📊 Resultados: ${passedTests}/${totalTests} pruebas pasaron`);
    
    if (passedTests === totalTests) {
      console.log('✅ Todas las pruebas de compatibilidad pasaron!');
    } else {
      console.log('❌ Algunas pruebas fallaron. Revisar implementación.');
    }
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
  }
}

// Ejecutar pruebas
testContentIdCompatibility();