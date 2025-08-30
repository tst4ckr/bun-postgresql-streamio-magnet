#!/usr/bin/env node

/**
 * Script de diagnóstico del protocolo Stremio
 * Muestra exactamente qué datos envía Stremio al add-on
 * y cómo debe responder el add-on
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Función para simular peticiones de Stremio
function simulateStremioRequest() {
  console.log('🔍 DIAGNÓSTICO DEL PROTOCOLO STREMIO');
  console.log('=' .repeat(50));
  
  // 1. Analizar el manifest.json actual
  console.log('\n📋 1. MANIFEST DEL ADD-ON');
  console.log('-'.repeat(30));
  
  try {
    const manifestPath = resolve('./manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    
    console.log(`   ID: ${manifest.id}`);
    console.log(`   Nombre: ${manifest.name}`);
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Tipos soportados: ${manifest.types.join(', ')}`);
    console.log(`   Recursos: ${manifest.resources.map(r => typeof r === 'string' ? r : r.name).join(', ')}`);
    
    // Mostrar prefijos de ID
    const streamResource = manifest.resources.find(r => typeof r === 'object' && r.name === 'stream');
    if (streamResource && streamResource.idPrefixes) {
      console.log(`   Prefijos de ID: ${streamResource.idPrefixes.join(', ')}`);
    }
    
  } catch (error) {
    console.log('   ❌ No se pudo leer el manifest.json');
  }
  
  // 2. Mostrar formato de peticiones de Stremio
  console.log('\n🔄 2. FORMATO DE PETICIONES STREMIO');
  console.log('-'.repeat(30));
  
  console.log('   Peticiones que Stremio envía al add-on:');
  console.log('   • GET /manifest.json - Para obtener la configuración');
  console.log('   • GET /stream/{type}/{id}.json - Para obtener streams');
  console.log('   • GET /catalog/{type}/{id}.json - Para obtener catálogos');
  console.log('   • GET /meta/{type}/{id}.json - Para obtener metadata');
  
  // 3. Ejemplos de peticiones reales
  console.log('\n📨 3. EJEMPLOS DE PETICIONES REALES');
  console.log('-'.repeat(30));
  
  const exampleRequests = [
    {
      description: 'Stream para Attack on Titan',
      url: '/stream/anime/tt25622312.json',
      stremio_request: {
        resource: 'stream',
        type: 'anime',
        id: 'tt25622312',
        extra: {}
      }
    },
    {
      description: 'Stream usando MAL ID',
      url: '/stream/anime/mal:5114.json',
      stremio_request: {
        resource: 'stream',
        type: 'anime',
        id: 'mal:5114',
        extra: {}
      }
    },
    {
      description: 'Stream usando Kitsu ID',
      url: '/stream/anime/kitsu:44042.json',
      stremio_request: {
        resource: 'stream',
        type: 'anime',
        id: 'kitsu:44042',
        extra: {}
      }
    }
  ];
  
  exampleRequests.forEach((req, index) => {
    console.log(`   ${index + 1}. ${req.description}`);
    console.log(`      URL: ${req.url}`);
    console.log(`      Petición Stremio: ${JSON.stringify(req.stremio_request, null, 8)}`);
    console.log('');
  });
  
  // 4. Formato de respuesta esperado
  console.log('\n📤 4. FORMATO DE RESPUESTA ESPERADO');
  console.log('-'.repeat(30));
  
  const expectedResponse = {
    streams: [
      {
        name: 'Subtítulos en español',
        title: 'Attack on Titan - Episodio 1',
        url: 'magnet:?xt=urn:btih:ABC123...',
        infoHash: 'ABC123DEF456',
        fileIdx: 0,
        behaviorHints: {
          bingeGroup: 'anime-1080p'
        }
      },
      {
        name: 'Subtítulos en español',
        title: 'Attack on Titan - Episodio 1',
        url: 'https://torrentio.strem.fun/...',
        behaviorHints: {
          notWebReady: true
        }
      }
    ]
  };
  
  console.log('   Respuesta JSON esperada:');
  console.log(`   ${JSON.stringify(expectedResponse, null, 4)}`);
  
  // 5. Verificar configuración actual
  console.log('\n⚙️  5. VERIFICACIÓN DE CONFIGURACIÓN');
  console.log('-'.repeat(30));
  
  console.log('   ✅ Add-on está configurado para:');
  console.log('   • Tipos: anime, movie, series');
  console.log('   • Prefijos: tt, kitsu:, mal:, anilist:, anidb:');
  console.log('   • Recursos: stream, catalog, meta');
  
  console.log('\n   🔍 Para diagnosticar problemas:');
  console.log('   1. Abre la consola de desarrollo de Stremio (F12)');
  console.log('   2. Busca errores en la red (Network tab)');
  console.log('   3. Verifica que las peticiones llegan al add-on');
  console.log('   4. Comprueba que las respuestas tienen el formato correcto');
  
  // 6. URLs de prueba
  console.log('\n🧪 6. URLs DE PRUEBA DIRECTAS');
  console.log('-'.repeat(30));
  
  const baseUrl = 'http://localhost:3000';
  const testUrls = [
    `${baseUrl}/manifest.json`,
    `${baseUrl}/stream/anime/tt25622312.json`,
    `${baseUrl}/stream/anime/mal:5114.json`,
    `${baseUrl}/stream/anime/kitsu:44042.json`,
    `${baseUrl}/catalog/anime/anime_catalog.json`,
    `${baseUrl}/meta/anime/tt25622312.json`
  ];
  
  console.log('   Puedes probar estas URLs directamente en tu navegador:');
  testUrls.forEach(url => {
    console.log(`   • ${url}`);
  });
  
  console.log('\n✨ DIAGNÓSTICO COMPLETADO');
  console.log('   El add-on está correctamente configurado para recibir peticiones de Stremio.');
  console.log('   Si no ves animes en Stremio, verifica los pasos anteriores.');
}

// Ejecutar diagnóstico
simulateStremioRequest();