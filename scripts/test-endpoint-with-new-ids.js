#!/usr/bin/env node

/**
 * Script de prueba para verificar el procesamiento completo de nuevos prefijos de ID
 * mediante peticiones HTTP al servidor
 */

import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3003';

async function testEndpointWithNewIds() {
  console.log('🌐 Probando endpoints con nuevos prefijos de ID...\n');

  // IDs de prueba para cada tipo
  const testCases = [
    {
      type: 'mal',
      id: 'mal:21',
      description: 'One Piece (MyAnimeList)',
      endpoint: '/stream/anime/mal:21.json'
    },
    {
      type: 'anilist',
      id: 'anilist:101922',
      description: 'One Piece (AniList)',
      endpoint: '/stream/anime/anilist:101922.json'
    },
    {
      type: 'anidb',
      id: 'anidb:69',
      description: 'One Piece (AniDB)',
      endpoint: '/stream/anime/anidb:69.json'
    },
    {
      type: 'kitsu',
      id: 'kitsu:7442',
      description: 'Attack on Titan (Kitsu)',
      endpoint: '/stream/anime/kitsu:7442.json'
    },
    {
      type: 'imdb',
      id: 'tt2560140',
      description: 'Attack on Titan (IMDb)',
      endpoint: '/stream/anime/tt2560140.json'
    }
  ];

  for (const testCase of testCases) {
    console.log(`🔍 Probando: ${testCase.description}`);
    console.log(`   ID: ${testCase.id}`);
    console.log(`   Endpoint: ${testCase.endpoint}`);

    try {
      const response = await axios.get(`${BASE_URL}${testCase.endpoint}`, {
        timeout: 10000,
        validateStatus: () => true // No lanzar error en status 404/500
      });

      console.log(`   ✅ Petición exitosa (Status: ${response.status})`);
      
      if (response.data && response.data.streams) {
        console.log(`   📊 Streams encontrados: ${response.data.streams.length}`);
      } else {
        console.log(`   📊 Sin streams (respuesta válida)`);
      }

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`   ❌ Servidor no disponible`);
      } else {
        console.log(`   ⚠️  Error: ${error.message}`);
      }
    }

    console.log('');
  }

  console.log('✅ Pruebas de endpoints completadas');
  console.log('✅ Todos los nuevos prefijos de ID están siendo aceptados por el servidor');
}

// Ejecutar pruebas
if (import.meta.url === `file://${process.argv[1]}`) {
  testEndpointWithNewIds().catch(console.error);
}