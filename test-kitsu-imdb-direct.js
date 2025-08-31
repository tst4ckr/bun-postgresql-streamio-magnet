#!/usr/bin/env node

/**
 * Script directo para probar la conversión Kitsu ID → IMDb ID
 * Usa ejemplos reales y verificados
 */

import { kitsuApiService } from './src/infrastructure/services/KitsuApiService.js';

// Ejemplos conocidos de Kitsu IDs que deberían tener mapeo IMDb
const testCases = [
  'kitsu:918',   // Your Name (Kimi no Na wa)
  'kitsu:10162', // Demon Slayer
  'kitsu:11061', // Jujutsu Kaisen
  'kitsu:7442',  // Attack on Titan
  'kitsu:10067', // My Hero Academia
];

async function testConversion() {
  console.log(`🧪 Test de conversión Kitsu ID → IMDb ID`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  for (const kitsuId of testCases) {
    console.log(`🔍 Probando: ${kitsuId}`);
    
    try {
      // Obtener IMDb ID
      const imdbId = await kitsuApiService.getImdbIdFromKitsu(kitsuId);
      
      // Obtener metadatos para contexto
      const metadata = await kitsuApiService.getAnimeMetadata(kitsuId);
      
      if (imdbId && metadata) {
        console.log(`   ✅ ÉXITO`);
        console.log(`   🎬 Anime: ${metadata.title}`);
        console.log(`   🏷️  IMDb: ${imdbId}`);
        console.log(`   🔗 URL: https://www.imdb.com/title/${imdbId}`);
      } else if (metadata) {
        console.log(`   ⚠️  Sin mapeo IMDb`);
        console.log(`   🎬 Anime: ${metadata.title}`);
        console.log(`   📊 Episodios: ${metadata.episodeCount || 'N/A'}`);
      } else {
        console.log(`   ❌ Anime no encontrado`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log(`   ${'-'.repeat(40)}`);
    
    // Pequeña pausa para no saturar la API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n✅ Pruebas completadas`);
}

// También probar con un ID específico si se proporciona
const specificId = process.argv[2];
if (specificId) {
  console.log(`🎯 ID específico proporcionado: ${specificId}`);
  testCases.unshift(specificId);
}

testConversion().catch(console.error);