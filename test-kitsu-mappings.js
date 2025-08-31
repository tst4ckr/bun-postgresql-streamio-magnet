#!/usr/bin/env node

/**
 * Script para investigar la estructura real de mapeos en Kitsu API
 * Usa la estructura correcta de relaciones según JSON:API
 */

import axios from 'axios';

const BASE_URL = 'https://kitsu.io/api/edge';

async function testKitsuMappings() {
  console.log(`🔍 Investigando estructura de mapeos en Kitsu API`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  // Test 1: Obtener anime con todas sus relaciones incluidas
  console.log(`1. Obteniendo anime ID 7442 con todas las relaciones...`);
  try {
    const animeResponse = await axios.get(`${BASE_URL}/anime/7442`, {
      params: {
        'include': 'mappings,castings,categories'
      }
    });
    
    const anime = animeResponse.data.data;
    console.log(`   ✅ Título: ${anime.attributes.canonicalTitle}`);
    console.log(`   ✅ ID: ${anime.id}`);
    
    // Analizar todos los mapeos
    const included = animeResponse.data.included || [];
    const allMappings = included.filter(item => item.type === 'mappings');
    
    console.log(`   ✅ Total de mapeos: ${allMappings.length}`);
    allMappings.forEach(mapping => {
      console.log(`      → ${mapping.attributes.externalSite}: ${mapping.attributes.externalId}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 2: Buscar anime específico que sabemos tiene IMDb
  console.log(`2. Buscando anime específico con título "Shingeki no Kyojin"...`);
  try {
    const searchResponse = await axios.get(`${BASE_URL}/anime`, {
      params: {
        'filter[text]': 'Shingeki no Kyojin',
        'page[limit]': 1,
        'include': 'mappings'
      }
    });
    
    if (searchResponse.data.data.length > 0) {
      const anime = searchResponse.data.data[0];
      console.log(`   ✅ Encontrado: ${anime.attributes.canonicalTitle} (ID: ${anime.id})`);
      
      const included = searchResponse.data.included || [];
      const mappings = included.filter(item => item.type === 'mappings');
      
      console.log(`   ✅ Mapeos:`);
      mappings.forEach(mapping => {
        console.log(`      → ${mapping.attributes.externalSite}: ${mapping.attributes.externalId}`);
      });
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 3: Probar con un anime popular que definitivamente tiene IMDb
  console.log(`3. Probando con "One Piece" (ID: 12)...`);
  try {
    const onePieceResponse = await axios.get(`${BASE_URL}/anime/12`, {
      params: {
        'include': 'mappings'
      }
    });
    
    const anime = onePieceResponse.data.data;
    console.log(`   ✅ Título: ${anime.attributes.canonicalTitle}`);
    
    const included = onePieceResponse.data.included || [];
    const mappings = included.filter(item => item.type === 'mappings');
    
    console.log(`   ✅ Mapeos encontrados:`);
    mappings.forEach(mapping => {
      console.log(`      → ${mapping.attributes.externalSite}: ${mapping.attributes.externalId}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 4: Verificar si hay algún anime con mapeo IMDb
  console.log(`4. Buscando anime con "movie" que pueda tener IMDb...`);
  try {
    const searchResponse = await axios.get(`${BASE_URL}/anime`, {
      params: {
        'filter[subtype]': 'movie',
        'page[limit]': 5,
        'include': 'mappings'
      }
    });
    
    console.log(`   ✅ Películas encontradas: ${searchResponse.data.data.length}`);
    
    for (const anime of searchResponse.data.data) {
      console.log(`   📽️ ${anime.attributes.canonicalTitle} (ID: ${anime.id})`);
      
      const included = searchResponse.data.included || [];
      const mappings = included.filter(item => 
        item.type === 'mappings' && 
        item.relationships?.item?.data?.id === anime.id
      );
      
      const imdbMapping = mappings.find(m => m.attributes.externalSite === 'imdb');
      if (imdbMapping) {
        console.log(`      → IMDb: tt${imdbMapping.attributes.externalId}`);
      } else {
        console.log(`      → Sin mapeo IMDb`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }
}

console.log(`🚀 Iniciando investigación de mapeos...`);
testKitsuMappings().catch(console.error);