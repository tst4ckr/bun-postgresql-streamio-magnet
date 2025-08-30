#!/usr/bin/env bun

/**
 * Script para probar mapeos de Kitsu a IMDb
 * Busca animes populares que tengan mapeos IMDb disponibles
 */

import Kitsu from 'kitsu';

const api = new Kitsu({
  baseURL: 'https://kitsu.io/api/edge'
});

async function findAnimesWithImdbMappings() {
  console.log('🔍 Buscando animes populares con mapeos IMDb...');
  
  try {
    // Buscar animes populares
    const response = await api.get('anime', {
      params: {
        sort: '-averageRating',
        filter: {
          subtype: 'TV'
        },
        page: {
          limit: 20
        }
      }
    });

    console.log(`📺 Encontrados ${response.data.length} animes populares`);
    
    for (const anime of response.data) {
      // La estructura de Kitsu ya tiene los atributos hoisted al nivel superior
      const title = anime.canonicalTitle || anime.titles?.en || anime.titles?.en_jp || 'Sin título';
      console.log(`\n🎬 Verificando: ${title} (ID: ${anime.id})`);
      
      try {
        // Buscar mapeos IMDb para este anime
        const mappingsResponse = await api.get(`anime/${anime.id}/mappings`, {
          params: {
            filter: {
              externalSite: 'imdb'
            }
          }
        });
        
        if (mappingsResponse.data && mappingsResponse.data.length > 0) {
          const mapping = mappingsResponse.data[0];
          const imdbId = mapping.externalId ? `tt${mapping.externalId}` : null;
          
          if (imdbId) {
            console.log(`✅ MAPEO ENCONTRADO: kitsu:${anime.id} → ${imdbId}`);
            console.log(`   Título: ${title}`);
            console.log(`   Rating: ${anime.averageRating || 'N/A'}`);
            console.log(`   Episodios: ${anime.episodeCount || 'N/A'}`);
            
            // Probar la URL del addon
            console.log(`   🔗 URL de prueba: http://127.0.0.1:3003/stream/anime/kitsu:${anime.id}.json`);
            
            return {
              kitsuId: `kitsu:${anime.id}`,
              imdbId,
              title,
              rating: anime.averageRating,
              episodes: anime.episodeCount
            };
          }
        }
        
        console.log(`❌ Sin mapeo IMDb`);
        
      } catch (error) {
        console.log(`⚠️  Error verificando mapeos: ${error.message}`);
      }
      
      // Pequeña pausa para no sobrecargar la API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n❌ No se encontraron animes con mapeos IMDb en esta búsqueda');
    return null;
    
  } catch (error) {
    console.error('❌ Error buscando animes:', error.message);
    return null;
  }
}

async function testSpecificAnimes() {
  console.log('\n🎯 Probando animes específicos conocidos...');
  
  // IDs de animes populares que probablemente tengan mapeos IMDb
  const knownAnimes = [
    { id: '1', name: 'Cowboy Bebop' },
    { id: '5', name: 'Trigun' },
    { id: '7', name: 'Neon Genesis Evangelion' },
    { id: '43', name: 'Ghost in the Shell: Stand Alone Complex' },
    { id: '269', name: 'Bleach' },
    { id: '1376', name: 'Death Note' },
    { id: '1555', name: 'Code Geass' },
    { id: '11469', name: 'Steins;Gate' },
    { id: '7442', name: 'Attack on Titan' },
    { id: '11757', name: 'Sword Art Online' }
  ];
  
  for (const anime of knownAnimes) {
    console.log(`\n🔍 Verificando ${anime.name} (kitsu:${anime.id})...`);
    
    try {
      const mappingsResponse = await api.get(`anime/${anime.id}/mappings`, {
        params: {
          filter: {
            externalSite: 'imdb'
          }
        }
      });
      
      if (mappingsResponse.data && mappingsResponse.data.length > 0) {
        const mapping = mappingsResponse.data[0];
        const imdbId = mapping.externalId ? `tt${mapping.externalId}` : null;
        
        if (imdbId) {
          console.log(`✅ MAPEO ENCONTRADO: kitsu:${anime.id} → ${imdbId}`);
          console.log(`   🔗 URL de prueba: http://127.0.0.1:3003/stream/anime/kitsu:${anime.id}.json`);
          return {
            kitsuId: `kitsu:${anime.id}`,
            imdbId,
            title: anime.name
          };
        }
      }
      
      console.log(`❌ Sin mapeo IMDb`);
      
    } catch (error) {
      console.log(`⚠️  Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return null;
}

async function main() {
  console.log('🚀 Iniciando búsqueda de mapeos Kitsu → IMDb\n');
  
  // Primero probar animes específicos conocidos
  let result = await testSpecificAnimes();
  
  // Si no encontramos ninguno, buscar en animes populares
  if (!result) {
    result = await findAnimesWithImdbMappings();
  }
  
  if (result) {
    console.log('\n🎉 ¡Mapeo encontrado! Puedes probar con:');
    console.log(`   Kitsu ID: ${result.kitsuId}`);
    console.log(`   IMDb ID: ${result.imdbId}`);
    console.log(`   Título: ${result.title}`);
    console.log(`   URL: http://127.0.0.1:3003/stream/anime/${result.kitsuId}.json`);
  } else {
    console.log('\n😞 No se encontraron mapeos IMDb disponibles');
    console.log('   Esto puede indicar que:');
    console.log('   1. La API de Kitsu tiene pocos mapeos IMDb');
    console.log('   2. Los animes populares no están en IMDb');
    console.log('   3. Hay un problema con la consulta de mapeos');
  }
}

main().catch(console.error);