#!/usr/bin/env node

/**
 * Script para buscar específicamente mapeos IMDb en Kitsu
 * Busca en toda la base de datos de mapeos
 */

import axios from 'axios';

const BASE_URL = 'https://kitsu.io/api/edge';

async function testKitsuImdbSearch() {
  console.log(`🔍 Búsqueda específica de mapeos IMDb en Kitsu`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  // Test 1: Buscar directamente en el endpoint de mappings
  console.log(`1. Buscando mappings con external_site=imdb...`);
  try {
    const mappingsResponse = await axios.get(`${BASE_URL}/mappings`, {
      params: {
        'filter[external_site]': 'imdb',
        'page[limit]': 20
      }
    });
    
    console.log(`   ✅ Mapeos IMDb encontrados: ${mappingsResponse.data.data.length}`);
    mappingsResponse.data.data.forEach(mapping => {
      console.log(`      → IMDb: tt${mapping.attributes.externalId} → Kitsu: ${mapping.relationships.item.data.id}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
    if (error.response?.data) {
      console.log(`      Detalles: ${JSON.stringify(error.response.data)}`);
    }
  }

  console.log();

  // Test 2: Buscar anime populares y verificar si alguno tiene IMDb
  console.log(`2. Buscando anime populares y verificando IMDb...`);
  const popularAnime = [
    11061, // Your Name
    10067, // A Silent Voice
    5114,  // Fullmetal Alchemist: Brotherhood
    9253,  // Steins;Gate
    11741  // Your Lie in April
  ];

  for (const animeId of popularAnime) {
    try {
      const animeResponse = await axios.get(`${BASE_URL}/anime/${animeId}`, {
        params: {
          'include': 'mappings'
        }
      });
      
      const anime = animeResponse.data.data;
      const included = animeResponse.data.included || [];
      const imdbMappings = included.filter(item => 
        item.type === 'mappings' && 
        item.attributes.externalSite === 'imdb'
      );
      
      console.log(`   📺 ${anime.attributes.canonicalTitle} (ID: ${animeId}):`);
      if (imdbMappings.length > 0) {
        imdbMappings.forEach(mapping => {
          console.log(`      ✅ IMDb ID: tt${mapping.attributes.externalId}`);
        });
      } else {
        console.log(`      ❌ Sin mapeo IMDb`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error con ID ${animeId}: ${error.response?.status}`);
    }
  }

  console.log();

  // Test 3: Verificar documentación de la API
  console.log(`3. Verificando tipos de external_site disponibles...`);
  try {
    // Buscar algunos mappings para ver tipos disponibles
    const mappingsResponse = await axios.get(`${BASE_URL}/mappings`, {
      params: {
        'page[limit]': 50
      }
    });
    
    const uniqueSites = new Set();
    mappingsResponse.data.data.forEach(mapping => {
      uniqueSites.add(mapping.attributes.externalSite);
    });
    
    console.log(`   ✅ Tipos de external_site encontrados:`);
    Array.from(uniqueSites).sort().forEach(site => {
      console.log(`      → ${site}`);
    });
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText}`);
  }
}

console.log(`🚀 Iniciando búsqueda exhaustiva de IMDb...`);
testKitsuImdbSearch().catch(console.error);