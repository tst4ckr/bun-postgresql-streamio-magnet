#!/usr/bin/env node

/**
 * @fileoverview Script de depuración para ver qué datos envía Stremio al addon
 * Este script simula exactamente las peticiones que haría Stremio
 */

import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3003';

/**
 * Simula las peticiones típicas que hace Stremio al addon
 */
async function debugStremioRequests() {
  console.log('🔍 Debug: Analizando peticiones de Stremio');
  console.log('=====================================\n');

  // 1. Verificar el manifiesto
  console.log('1. Verificando manifiesto...');
  try {
    const manifest = await axios.get(`${BASE_URL}/manifest.json`);
    console.log('✅ Manifiesto encontrado:');
    console.log('   - ID Prefixes:', manifest.data.idPrefixes);
    console.log('   - Types:', manifest.data.types);
    console.log('   - Resources:', manifest.data.resources);
  } catch (error) {
    console.log('❌ Error al obtener manifiesto:', error.message);
    return;
  }

  console.log('\n2. Probando diferentes tipos de peticiones de streams...\n');

  // 2. Simular peticiones típicas de anime desde Stremio
  const testCases = [
    // Casos reales que podría enviar Stremio desde Anime Catalogs
    { type: 'anime', id: 'mal:5114' },           // Fullmetal Alchemist
    { type: 'anime', id: 'anilist:5114' },        // Mismo anime en AniList
    { type: 'anime', id: 'anidb:4563' },         // Mismo anime en AniDB
    { type: 'anime', id: 'kitsu:48671' },         // Spy x Family
    { type: 'series', id: 'tt0944947' },        // Game of Thrones (IMDb)
    { type: 'movie', id: 'tt25622312' },         // Kimetsu no Yaiba movie
  ];

  for (const testCase of testCases) {
    console.log(`📋 Probando: ${testCase.type} -> ${testCase.id}`);
    
    try {
      const response = await axios.get(`${BASE_URL}/stream/${testCase.type}/${testCase.id}.json`);
      
      if (response.data && response.data.streams && response.data.streams.length > 0) {
        console.log(`   ✅ Encontrados ${response.data.streams.length} streams`);
        response.data.streams.slice(0, 2).forEach((stream, idx) => {
          console.log(`      ${idx + 1}. ${stream.name}`);
        });
        if (response.data.streams.length > 2) {
          console.log(`      ... y ${response.data.streams.length - 2} más`);
        }
      } else {
        console.log(`   ⚠️ Sin streams encontrados`);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ⚠️ Endpoint no encontrado (404)`);
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    // Pequeña pausa
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n3. Verificando rutas disponibles...');
  
  // 3. Verificar rutas comunes de Stremio
  const routes = [
    '/stream/anime',
    '/stream/series',
    '/stream/movie',
    '/catalog/anime',
    '/meta/anime',
  ];

  for (const route of routes) {
    try {
      const response = await axios.get(`${BASE_URL}${route}.json`);
      console.log(`   ✅ ${route}: disponible`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ⚠️ ${route}: no encontrado`);
      } else {
        console.log(`   ❌ ${route}: error - ${error.message}`);
      }
    }
  }

  console.log('\n📊 Resumen de depuración:');
  console.log('========================');
  console.log('• Stremio envía peticiones a: /stream/{type}/{id}.json');
  console.log('• El tipo puede ser: anime, series, movie');
  console.log('• El ID puede tener prefijos: mal:, anilist:, anidb:, kitsu:, tt:');
  console.log('• Si no hay streams, es normal - significa que no hay torrents disponibles');
  console.log('\n💡 Para verificar en Stremio:');
  console.log('1. Instala el addon usando: http://127.0.0.1:3003/manifest.json');
  console.log('2. Busca un anime en Stremio');
  console.log('3. Selecciona "Anime Catalogs" como fuente');
  console.log('4. El addon buscará automáticamente streams');
}

// Ejecutar la depuración
debugStremioRequests().catch(console.error);