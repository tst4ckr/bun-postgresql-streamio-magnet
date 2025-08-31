#!/usr/bin/env node

/**
 * Script de prueba con parámetros correctos para la API de Kitsu
 * Basado en la documentación oficial de Kitsu API
 */

import axios from 'axios';

const BASE_URL = 'https://kitsu.io/api/edge';

async function testKitsuCorrect() {
  console.log(`🔍 Test correcto de API de Kitsu`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  // Test 1: Obtener anime específico con include de mappings
  console.log(`1. Obteniendo anime ID 7442 (Attack on Titan) con mappings...`);
  try {
    const animeResponse = await axios.get(`${BASE_URL}/anime/7442`, {
      params: {
        'include': 'mappings'
      }
    });
    
    const anime = animeResponse.data.data;
    console.log(`   ✅ Título: ${anime.attributes.canonicalTitle}`);
    console.log(`   ✅ ID: ${anime.id}`);
    
    // Verificar si hay mappings incluidos
    const included = animeResponse.data.included || [];
    const imdbMappings = included.filter(item => 
      item.type === 'mappings' && 
      item.attributes.externalSite === 'imdb'
    );
    
    console.log(`   ✅ Mapeos IMDb encontrados: ${imdbMappings.length}`);
    imdbMappings.forEach(mapping => {
      console.log(`      → IMDb ID: tt${mapping.attributes.externalId}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
    if (error.response?.data) {
      console.log(`      Detalles: ${JSON.stringify(error.response.data)}`);
    }
  }

  console.log();

  // Test 2: Obtener mappings directamente para Attack on Titan
  console.log(`2. Obteniendo mappings para anime 7442...`);
  try {
    // La forma correcta es usar /mappings con filter[item_id]
    const mappingsResponse = await axios.get(`${BASE_URL}/mappings`, {
      params: {
        'filter[item_id]': '7442',
        'filter[external_site]': 'imdb'
      }
    });
    
    console.log(`   ✅ Mapeos encontrados: ${mappingsResponse.data.data.length}`);
    mappingsResponse.data.data.forEach((mapping, index) => {
      console.log(`   ${index + 1}. IMDb ID: tt${mapping.attributes.externalId}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
    if (error.response?.data) {
      console.log(`      Detalles: ${JSON.stringify(error.response.data)}`);
    }
  }

  console.log();

  // Test 3: Probar con un anime que sabemos tiene IMDb (Your Name - ID 10162)
  console.log(`3. Probando Your Name (ID: 10162)...`);
  try {
    const yourNameResponse = await axios.get(`${BASE_URL}/anime/10162`, {
      params: {
        'include': 'mappings'
      }
    });
    
    const anime = yourNameResponse.data.data;
    console.log(`   ✅ Título: ${anime.attributes.canonicalTitle}`);
    
    const included = yourNameResponse.data.included || [];
    const imdbMappings = included.filter(item => 
      item.type === 'mappings' && 
      item.attributes.externalSite === 'imdb'
    );
    
    console.log(`   ✅ Mapeos IMDb encontrados: ${imdbMappings.length}`);
    imdbMappings.forEach(mapping => {
      console.log(`      → IMDb ID: tt${mapping.attributes.externalId}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }

  console.log();

  // Test 4: Buscar anime por título y verificar mappings
  console.log(`4. Buscando "Death Note" y verificando mappings...`);
  try {
    const searchResponse = await axios.get(`${BASE_URL}/anime`, {
      params: {
        'filter[text]': 'Death Note',
        'page[limit]': 3,
        'include': 'mappings'
      }
    });
    
    const results = searchResponse.data.data;
    console.log(`   ✅ Resultados encontrados: ${results.length}`);
    
    for (const anime of results) {
      console.log(`   📺 ${anime.attributes.canonicalTitle} (ID: ${anime.id})`);
      
      const included = searchResponse.data.included || [];
      const imdbMappings = included.filter(item => 
        item.type === 'mappings' && 
        item.attributes.externalSite === 'imdb' &&
        item.relationships?.item?.data?.id === anime.id
      );
      
      if (imdbMappings.length > 0) {
        imdbMappings.forEach(mapping => {
          console.log(`      → IMDb ID: tt${mapping.attributes.externalId}`);
        });
      } else {
        console.log(`      → Sin mapeo IMDb`);
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }
}

console.log(`🚀 Iniciando pruebas con parámetros correctos...`);
testKitsuCorrect().catch(console.error);