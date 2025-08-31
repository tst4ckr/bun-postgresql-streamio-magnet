#!/usr/bin/env node

/**
 * Script de depuración para verificar el funcionamiento de la API de Kitsu
 * y encontrar animes que tengan mapeo IMDb
 */

import Kitsu from 'kitsu';

const api = new Kitsu({
  baseURL: 'https://kitsu.io/api/edge'
});

async function debugKitsuApi() {
  console.log(`🔍 Depurando API de Kitsu`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log();

  try {
    // 1. Probar endpoint básico de anime
    console.log(`1. Probando endpoint /anime...`);
    const animeResponse = await api.get('anime', {
      params: {
        page: { limit: 5 }
      }
    });
    
    console.log(`   ✅ Respuesta recibida`);
    console.log(`   📊 Total de animes: ${animeResponse?.meta?.count || 'Desconocido'}`);
    
    if (animeResponse?.data?.length > 0) {
      console.log(`   📋 Primeros 5 animes:`);
      animeResponse.data.forEach((anime, index) => {
        console.log(`   ${index + 1}. ${anime.attributes?.canonicalTitle || 'Sin título'} (ID: ${anime.id})`);
      });
    }

    console.log();

    // 2. Probar mapeos con un anime específico que sabemos que existe
    console.log(`2. Probando mapeos para anime ID 1...`);
    const mappingsResponse = await api.get('mappings', {
      params: {
        filter: {
          itemId: 1
        },
        include: 'item'
      }
    });

    console.log(`   📊 Mapeos encontrados para anime 1: ${mappingsResponse?.data?.length || 0}`);
    if (mappingsResponse?.data?.length > 0) {
      mappingsResponse.data.forEach((mapping, index) => {
        console.log(`   ${index + 1}. ${mapping.attributes?.externalSite} → ${mapping.attributes?.externalId}`);
      });
    }

    console.log();

    // 3. Buscar mapeos IMDb específicamente
    console.log(`3. Buscando mapeos IMDb...`);
    const imdbMappings = await api.get('mappings', {
      params: {
        filter: {
          externalSite: 'imdb'
        },
        page: { limit: 10 },
        include: 'item'
      }
    });

    console.log(`   📊 Mapeos IMDb encontrados: ${imdbMappings?.data?.length || 0}`);
    if (imdbMappings?.data?.length > 0) {
      console.log(`   📋 Primeros 10 mapeos IMDb:`);
      imdbMappings.data.forEach((mapping, index) => {
        const animeTitle = mapping.item?.data?.attributes?.canonicalTitle || 'Sin título';
        const kitsuId = mapping.item?.data?.id;
        console.log(`   ${index + 1}. Kitsu:${kitsuId} → IMDb:tt${mapping.attributes?.externalId} (${animeTitle})`);
      });
    }

    console.log();

    // 4. Buscar anime popular y verificar mapeos
    console.log(`4. Buscando anime "Attack on Titan"...`);
    const searchResponse = await api.get('anime', {
      params: {
        filter: {
          text: 'Attack on Titan'
        },
        page: { limit: 3 },
        include: 'mappings'
      }
    });

    console.log(`   📊 Resultados encontrados: ${searchResponse?.data?.length || 0}`);
    if (searchResponse?.data?.length > 0) {
      for (const anime of searchResponse.data) {
        console.log(`   📺 ${anime.attributes?.canonicalTitle} (ID: ${anime.id})`);
        
        // Verificar mapeos de este anime
        const animeMappings = await api.get(`anime/${anime.id}/mappings`);
        if (animeMappings?.data?.length > 0) {
          const imdbMapping = animeMappings.data.find(m => m.attributes?.externalSite === 'imdb');
          if (imdbMapping) {
            console.log(`      ✅ IMDb: tt${imdbMapping.attributes?.externalId}`);
          } else {
            console.log(`      ❌ Sin mapeo IMDb`);
          }
        }
      }
    }

  } catch (error) {
    console.error(`❌ Error durante depuración:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url
    });
  }
}

console.log(`🚀 Iniciando depuración de API de Kitsu`);
debugKitsuApi().catch(console.error);