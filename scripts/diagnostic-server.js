#!/usr/bin/env node
/**
 * @fileoverview Servidor de diagnóstico independiente para verificar mapeos de Kitsu
 * Este script crea un servidor HTTP simple para diagnosticar el estado del addon
 */

import http from 'http';
import url from 'url';
import { kitsuMappingFallback } from '../src/infrastructure/services/KitsuMappingFallback.js';

const PORT = 3004;

// Función para enviar respuesta JSON
function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// Función para parsear query parameters
function parseQuery(queryString) {
  const params = new URLSearchParams(queryString);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // Endpoint de salud
    if (pathname === '/health') {
      const stats = kitsuMappingFallback.getStats();
      sendJSON(res, {
        success: true,
        status: 'healthy',
        mappings: stats.totalMappings,
        coverage: `${stats.coverage}%`,
        endpoints: {
          health: `http://127.0.0.1:${PORT}/health`,
          mappings: `http://127.0.0.1:${PORT}/mappings`,
          search: `http://127.0.0.1:${PORT}/search?title=cowboy`,
          addonManifest: 'http://127.0.0.1:3003/manifest.json',
          streamExample: 'http://127.0.0.1:3003/stream/anime/kitsu:1.json'
        }
      });
      return;
    }
    
    // Endpoint de mapeos
    if (pathname === '/mappings') {
      const mappings = kitsuMappingFallback.getAllMappings();
      const mappingsWithTitles = mappings.filter(m => m.title && m.title !== 'Título desconocido');
      
      sendJSON(res, {
        success: true,
        mappings: mappingsWithTitles.slice(0, 20),
        total: mappings.length,
        withTitles: mappingsWithTitles.length,
        coverage: `${kitsuMappingFallback.getStats().coverage}%`,
        usage: 'Usar formato: http://127.0.0.1:3003/stream/anime/kitsu:ID.json',
        examples: [
          'http://127.0.0.1:3003/stream/anime/kitsu:1.json (Cowboy Bebop)',
          'http://127.0.0.1:3003/stream/anime/kitsu:7442.json (Attack on Titan)',
          'http://127.0.0.1:3003/stream/anime/kitsu:1376.json (Death Note)',
          'http://127.0.0.1:3003/stream/anime/kitsu:11469.json (Steins;Gate)'
        ]
      });
      return;
    }
    
    // Endpoint de búsqueda por título
    if (pathname === '/search') {
      const { title } = query;
      if (!title) {
        sendJSON(res, { error: 'Parámetro title requerido' }, 400);
        return;
      }
      
      const results = kitsuMappingFallback.searchByTitle(title);
      sendJSON(res, {
        success: true,
        query: title,
        results: results.slice(0, 10),
        total: results.length
      });
      return;
    }
    
    // Endpoint para verificar un mapeo específico
     if (pathname.startsWith('/mapping/')) {
       const kitsuId = pathname.split('/mapping/')[1];
       const imdbId = kitsuMappingFallback.getImdbId(kitsuId);
       const metadata = kitsuMappingFallback.getAnimeMetadata(kitsuId);
       
       if (!imdbId) {
         sendJSON(res, { 
           error: `No se encontró mapeo para kitsu:${kitsuId}`,
           suggestion: 'Verificar ID de Kitsu o agregar mapeo manual'
         }, 404);
         return;
       }
       
       sendJSON(res, {
         success: true,
         kitsuId: `kitsu:${kitsuId}`,
         imdbId,
         title: metadata?.title || 'Título desconocido',
         year: metadata?.year,
         episodes: metadata?.episodes,
         rating: metadata?.rating,
         streamUrl: `http://127.0.0.1:3003/stream/anime/kitsu:${kitsuId}.json`
       });
       return;
     }
    
    // Endpoint de animes populares para pruebas
    if (pathname === '/popular') {
      const popularAnimes = [
        { kitsuId: '1', title: 'Cowboy Bebop', imdbId: 'tt0213338' },
        { kitsuId: '7442', title: 'Attack on Titan', imdbId: 'tt2560140' },
        { kitsuId: '1376', title: 'Death Note', imdbId: 'tt0877057' },
        { kitsuId: '11469', title: 'Steins;Gate', imdbId: 'tt1910272' },
        { kitsuId: '1555', title: 'FLCL', imdbId: 'tt0279077' }
      ];
      
      const mappedAnimes = popularAnimes.map(anime => {
         const imdbId = kitsuMappingFallback.getImdbId(anime.kitsuId);
         const metadata = kitsuMappingFallback.getAnimeMetadata(anime.kitsuId);
         return {
           ...anime,
           mapped: !!imdbId,
           actualImdbId: imdbId,
           metadata: metadata,
           streamUrl: `http://127.0.0.1:3003/stream/anime/kitsu:${anime.kitsuId}.json`
         };
       });
      
      sendJSON(res, {
        success: true,
        popularAnimes: mappedAnimes,
        instructions: 'Usar streamUrl para probar cada anime en Stremio'
      });
      return;
    }
    
    // Endpoint raíz con información general
    if (pathname === '/' || pathname === '') {
      sendJSON(res, {
        name: 'Servidor de Diagnóstico - Stremio Kitsu Addon',
        version: '1.0.0',
        endpoints: {
          health: `http://127.0.0.1:${PORT}/health`,
          mappings: `http://127.0.0.1:${PORT}/mappings`,
          search: `http://127.0.0.1:${PORT}/search?title=cowboy`,
          mapping: `http://127.0.0.1:${PORT}/mapping/1`,
          popular: `http://127.0.0.1:${PORT}/popular`
        },
        addon: {
          manifest: 'http://127.0.0.1:3003/manifest.json',
          streamExample: 'http://127.0.0.1:3003/stream/anime/kitsu:1.json'
        }
      });
      return;
    }
    
    // 404 para rutas no encontradas
    sendJSON(res, { error: 'Endpoint no encontrado' }, 404);
    
  } catch (error) {
    sendJSON(res, { error: error.message }, 500);
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🔍 Servidor de diagnóstico iniciado en: http://127.0.0.1:${PORT}`);
  console.log(`📊 Endpoints disponibles:`);
  console.log(`   - Health: http://127.0.0.1:${PORT}/health`);
  console.log(`   - Mapeos: http://127.0.0.1:${PORT}/mappings`);
  console.log(`   - Búsqueda: http://127.0.0.1:${PORT}/search?title=cowboy`);
  console.log(`   - Mapeo específico: http://127.0.0.1:${PORT}/mapping/1`);
  console.log(`   - Animes populares: http://127.0.0.1:${PORT}/popular`);
  console.log(`\n🎯 Addon principal: http://127.0.0.1:3003/manifest.json`);
});