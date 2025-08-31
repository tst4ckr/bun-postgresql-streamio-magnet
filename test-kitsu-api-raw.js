#!/usr/bin/env node

/**
 * Script de prueba directa con la API de Kitsu
 * Para verificar el funcionamiento real de los endpoints
 */

import axios from 'axios';

const BASE_URL = 'https://kitsu.io/api/edge';

async function testKitsuApiRaw() {
  console.log(`🔍 Test directo de API de Kitsu`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  // Test 1: Obtener anime específico
  console.log(`1. Obteniendo anime ID 918 (Your Name)...`);
  try {
    const animeResponse = await axios.get(`${BASE_URL}/anime/918`);
    const anime = animeResponse.data.data;
    console.log(`   ✅ Título: ${anime.attributes.canonicalTitle}`);
    console.log(`   ✅ ID: ${anime.id}`);
    console.log(`   ✅ Tipo: ${anime.attributes.subtype}`);
    console.log(`   ✅ Episodios: ${anime.attributes.episodeCount}`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 2: Obtener mapeos para anime 918
  console.log(`2. Obteniendo mapeos para anime 918...`);
  try {
    const mappingsResponse = await axios.get(`${BASE_URL}/mappings`, {
      params: {
        'filter[itemId]': '918',
        'filter[externalSite]': 'imdb'
      }
    });
    
    console.log(`   ✅ Mapeos encontrados: ${mappingsResponse.data.data.length}`);
    
    mappingsResponse.data.data.forEach((mapping, index) => {
      console.log(`   ${index + 1}. ${mapping.attributes.externalSite} → ${mapping.attributes.externalId}`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 3: Buscar anime por título
  console.log(`3. Buscando "Attack on Titan"...`);
  try {
    const searchResponse = await axios.get(`${BASE_URL}/anime`, {
      params: {
        'filter[text]': 'Attack on Titan',
        'page[limit]': 5
      }
    });
    
    console.log(`   ✅ Resultados: ${searchResponse.data.data.length}`);
    
    searchResponse.data.data.forEach((anime, index) => {
      console.log(`   ${index + 1}. ${anime.attributes.canonicalTitle} (ID: ${anime.id})`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 4: Verificar mapeos IMDb para Attack on Titan
  console.log(`4. Verificando mapeos IMDb para Attack on Titan (ID: 7442)...`);
  try {
    const titanMappings = await axios.get(`${BASE_URL}/mappings`, {
      params: {
        'filter[itemId]': '7442',
        'filter[externalSite]': 'imdb'
      }
    });
    
    console.log(`   ✅ Mapeos encontrados: ${titanMappings.data.data.length}`);
    
    titanMappings.data.data.forEach((mapping, index) => {
      console.log(`   ${index + 1}. IMDb ID: tt${mapping.attributes.externalId}`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }
}

console.log(`🚀 Iniciando pruebas directas de API...`);
testKitsuApiRaw().catch(console.error);