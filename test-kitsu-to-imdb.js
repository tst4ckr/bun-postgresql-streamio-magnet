#!/usr/bin/env node

/**
 * Script de prueba para verificar la conversión de Kitsu ID a IMDb ID
 * Uso: node test-kitsu-to-imdb.js [kitsu-id]
 * Ejemplo: node test-kitsu-to-imdb.js kitsu:11665
 */

import { kitsuApiService } from './src/infrastructure/services/KitsuApiService.js';

async function testKitsuToImdbConversion(kitsuId) {
  console.log(`🔍 Probando conversión de Kitsu ID a IMDb ID`);
  console.log(`Kitsu ID: ${kitsuId}`);
  console.log(`-`.repeat(50));

  try {
    // Validar formato del ID
    if (!kitsuApiService.isKitsuId(kitsuId)) {
      console.error(`❌ Formato de Kitsu ID inválido: ${kitsuId}`);
      console.log(`Formato esperado: kitsu:12345`);
      process.exit(1);
    }

    console.log(`✅ Formato de Kitsu ID válido`);

    // Obtener IMDb ID
    console.log(`🔄 Consultando API de Kitsu...`);
    const imdbId = await kitsuApiService.getImdbIdFromKitsu(kitsuId);

    if (imdbId) {
      console.log(`✅ Conversión exitosa:`);
      console.log(`   Kitsu ID: ${kitsuId}`);
      console.log(`   IMDb ID:  ${imdbId}`);
      console.log(`🔗 URL IMDb: https://www.imdb.com/title/${imdbId}`);
    } else {
      console.log(`⚠️  No se encontró mapeo IMDb para ${kitsuId}`);
      console.log(`   Esto puede significar que:`);
      console.log(`   - El anime no tiene IMDb ID registrado en Kitsu`);
      console.log(`   - El ID de Kitsu no existe`);
      console.log(`   - Hay un problema temporal con la API`);
    }

    // También obtener metadatos completos para más información
    console.log(`\n📋 Obteniendo metadatos completos...`);
    const metadata = await kitsuApiService.getAnimeMetadata(kitsuId);
    
    if (metadata) {
      console.log(`📊 Metadatos encontrados:`);
      console.log(`   Título: ${metadata.title}`);
      console.log(`   Episodios: ${metadata.episodeCount || 'Desconocido'}`);
      console.log(`   Estado: ${metadata.status || 'Desconocido'}`);
      console.log(`   Calificación: ${metadata.ageRating || 'Desconocida'}`);
      
      if (metadata.mappings && Object.keys(metadata.mappings).length > 0) {
        console.log(`   Mapeos disponibles:`, metadata.mappings);
      }
    }

  } catch (error) {
    console.error(`❌ Error durante la prueba:`, error.message);
    process.exit(1);
  }
}

// Obtener ID de línea de comandos o usar uno de ejemplo
const kitsuId = process.argv[2] || 'kitsu:11665'; // One Piece por defecto

console.log(`🚀 Iniciando prueba de conversión Kitsu → IMDb`);
console.log(`📅 ${new Date().toISOString()}`);
console.log();

testKitsuToImdbConversion(kitsuId).catch(console.error);