#!/usr/bin/env node

/**
 * @fileoverview Script para probar animes populares y verificar funcionamiento
 */

import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3003';

/**
 * Animes populares con IDs conocidos para pruebas
 */
const popularAnimes = [
  // Attack on Titan - Muy popular
  { name: 'Attack on Titan', type: 'anime', id: 'mal:16498' },
  { name: 'Attack on Titan', type: 'anime', id: 'anilist:16498' },
  
  // Demon Slayer - Muy popular
  { name: 'Demon Slayer', type: 'anime', id: 'mal:38000' },
  { name: 'Demon Slayer', type: 'anime', id: 'kitsu:44042' },
  
  // One Piece - Clásico
  { name: 'One Piece', type: 'anime', id: 'mal:21' },
  { name: 'One Piece', type: 'anime', id: 'anilist:21' },
  
  // Jujutsu Kaisen - Reciente
  { name: 'Jujutsu Kaisen', type: 'anime', id: 'mal:40748' },
  { name: 'Jujutsu Kaisen', type: 'anime', id: 'kitsu:42191' },
  
  // Spy x Family - Confirmado que funciona
  { name: 'Spy x Family', type: 'anime', id: 'kitsu:48671' },
  { name: 'Spy x Family', type: 'anime', id: 'mal:48661' },
  
  // Dragon Ball Z
  { name: 'Dragon Ball Z', type: 'anime', id: 'mal:813' },
  { name: 'Dragon Ball Z', type: 'anime', id: 'tt0088504' }, // IMDb ID
];

/**
 * Prueba animes populares
 */
async function testPopularAnimes() {
  console.log('🎯 Probando animes populares...');
  console.log('==============================\n');

  let totalTested = 0;
  let totalWithStreams = 0;

  for (const anime of popularAnimes) {
    console.log(`📺 ${anime.name} (${anime.type}:${anime.id})`);
    
    try {
      const response = await axios.get(`${BASE_URL}/stream/${anime.type}/${anime.id}.json`);
      
      if (response.data && response.data.streams && response.data.streams.length > 0) {
        console.log(`   ✅ ${response.data.streams.length} streams encontrados`);
        
        // Mostrar detalles de los primeros 2 streams
        response.data.streams.slice(0, 2).forEach((stream, idx) => {
          console.log(`      ${idx + 1}. ${stream.name} - ${stream.description?.split('\n')[0] || 'Sin descripción'}`);
        });
        
        if (response.data.streams.length > 2) {
          console.log(`      ... y ${response.data.streams.length - 2} más`);
        }
        
        totalWithStreams++;
      } else {
        console.log(`   ⚠️ Sin streams disponibles`);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ❌ No encontrado (404)`);
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    totalTested++;
    
    // Pausa entre peticiones
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n📊 Resumen de pruebas:');
  console.log('======================');
  console.log(`Total probados: ${totalTested}`);
  console.log(`Con streams: ${totalWithStreams}`);
  console.log(`Sin streams: ${totalTested - totalWithStreams}`);
  
  if (totalWithStreams === 0) {
    console.log('\n⚠️ Advertencia: No se encontraron streams para ningún anime.');
    console.log('Esto puede ser porque:');
    console.log('1. Los proveedores de torrents no tienen estos animes');
    console.log('2. Los IDs no están correctamente mapeados');
    console.log('3. Hay un problema de configuración');
  } else {
    console.log('\n✅ El addon está funcionando correctamente.');
    console.log('Algunos animes tienen streams disponibles.');
  }

  console.log('\n💡 Para usar en Stremio:');
  console.log('1. Instala el addon: http://127.0.0.1:3003/manifest.json');
  console.log('2. Busca el anime directamente en Stremio');
  console.log('3. Los streams aparecerán en los resultados');
}

// Ejecutar prueba
testPopularAnimes().catch(console.error);