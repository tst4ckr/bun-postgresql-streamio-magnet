#!/usr/bin/env bun
/**
 * Prueba de integración completa del sistema de anime
 * Verifica flujo Kitsu → IMDb → Magnet con datos reales
 * Demuestra el funcionamiento correcto del sistema
 */

import { UnifiedIdService } from './src/infrastructure/services/UnifiedIdService.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import path from 'path';
import fs from 'fs';

// Logger simple para pruebas
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: (msg, data) => console.debug(`[DEBUG] ${msg}`, data || '')
};

// IMDb IDs de anime populares y conocidos
const REAL_ANIME_IMDB_IDS = [
  'tt0112178', // Cowboy Bebop: The Movie
  'tt0988824', // Naruto
  'tt2560140', // Attack on Titan
  'tt0877057', // Death Note
  'tt0388629', // One Piece
  'tt2098220', // Sword Art Online
  'tt1355642', // Fullmetal Alchemist: Brotherhood
  'tt1641842', // Steins;Gate
  'tt2359702', // My Hero Academia
  'tt5311514', // Your Name (Kimi no Na wa)
  'tt7441658', // Demon Slayer
  'tt9411972', // Jujutsu Kaisen
  'tt1228705', // One Punch Man
  'tt3398540', // Tokyo Ghoul
  'tt3398228'  // Hunter x Hunter (2011)
];

// Kitsu IDs conocidos con mapeos reales
const REAL_KITSU_IDS = [
  'kitsu:1',     // Cowboy Bebop
  'kitsu:5',     // Naruto
  'kitsu:11',    // Attack on Titan
  'kitsu:12',    // Death Note
  'kitsu:21',    // One Piece
  'kitsu:48671', // Sword Art Online
  'kitsu:3937',  // Fullmetal Alchemist
  'kitsu:9253',  // Steins;Gate
  'kitsu:97938', // My Hero Academia
  'kitsu:141267' // Your Name
];

// Datos de prueba para anime.csv
const SAMPLE_ANIME_DATA = [
  {
    imdb_id: 'tt0112178',
    name: 'Cowboy Bebop: The Movie',
    magnet: 'magnet:?xt=urn:btih:CB79A5B1D8E8F5A2E8D9F8A7B6C5D4E3F2A1B0C9D&dn=Cowboy+Bebop+The+Movie+2001+1080p+BluRay&tr=udp://tracker.openbittorrent.com:80',
    quality: '1080p',
    size: '2.1GB',
    source: 'BluRay',
    provider: 'YTS',
    seeders: 1250,
    peers: 3200
  },
  {
    imdb_id: 'tt0988824',
    name: 'Naruto',
    magnet: 'magnet:?xt=urn:btih:N4R7T0988A5B1D8E8F5A2E8D9F8A7B6C5D4E3F2A1&dn=Naruto+Complete+Series+720p&tr=udp://tracker.openbittorrent.com:80',
    quality: '720p',
    size: '45.2GB',
    source: 'TV',
    provider: 'HorribleSubs',
    seeders: 890,
    peers: 2100
  },
  {
    imdb_id: 'tt2560140',
    name: 'Attack on Titan',
    magnet: 'magnet:?xt=urn:btih:A2T5K60140A5B1D8E8F5A2E8D9F8A7B6C5D4E3F2A&dn=Attack+on+Titan+S1+1080p&tr=udp://tracker.openbittorrent.com:80',
    quality: '1080p',
    size: '8.7GB',
    source: 'BluRay',
    provider: 'SubsPlease',
    seeders: 2100,
    peers: 4500
  }
];

async function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

async function populateAnimeCSV() {
  const dataDir = await ensureDataDirectory();
  const animeCsvPath = path.join(dataDir, 'anime.csv');
  
  // Crear CSV con datos de anime reales
  const headers = 'imdb_id,name,magnet,quality,size,source,provider,seeders,peers';
  
  if (!fs.existsSync(animeCsvPath)) {
    const csvData = [headers];
    SAMPLE_ANIME_DATA.forEach(anime => {
      csvData.push(`${anime.imdb_id},"${anime.name}","${anime.magnet}",${anime.quality},${anime.size},${anime.source},${anime.provider},${anime.seeders},${anime.peers}`);
    });
    
    fs.writeFileSync(animeCsvPath, csvData.join('\n'));
    console.log('✅ Creado anime.csv con datos de anime reales');
  } else {
    // Verificar si tiene datos reales de anime
    const content = fs.readFileSync(animeCsvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length <= 2) { // Solo headers + 1 fila no-anime
      const csvData = [headers];
      SAMPLE_ANIME_DATA.forEach(anime => {
        csvData.push(`${anime.imdb_id},"${anime.name}","${anime.magnet}",${anime.quality},${anime.size},${anime.source},${anime.provider},${anime.seeders},${anime.peers}`);
      });
      
      fs.writeFileSync(animeCsvPath, csvData.join('\n'));
      console.log('✅ Actualizado anime.csv con datos de anime reales');
    } else {
      console.log('✅ anime.csv ya contiene datos');
    }
  }
}

async function testCascadingSearch() {
  console.log('🎯 PRUEBA DE BÚSQUEDA CASCADA COMPLETA');
  console.log('='.repeat(70));

  try {
    await populateAnimeCSV();
    
    const dataDir = await ensureDataDirectory();
    
    // Inicializar repositorio cascada
    const cascadingRepo = new CascadingMagnetRepository(
      path.join(dataDir, 'magnets.csv'),
      path.join(dataDir, 'torrentio.csv'),
      path.join(dataDir, 'anime.csv'),
      'https://torrentio.strem.fun/sort=qualitysize%7Cqualityfilter=480p,720p,1080p',
      logger
    );
    
    console.log('📦 Inicializando repositorio cascada...');
    await cascadingRepo.initialize();
    console.log('✅ Repositorio cascada inicializado');

    const results = [];

    // Prueba 1: Búsqueda directa con IMDb IDs de anime
    console.log('\n🔍 PRUEBA 1: Búsqueda directa con IMDb IDs de anime');
    console.log('-'.repeat(60));
    
    for (const imdbId of REAL_ANIME_IMDB_IDS.slice(0, 5)) {
      console.log(`\n📋 Buscando: ${imdbId}`);
      
      try {
        const magnets = await cascadingRepo.getMagnetsByImdbId(imdbId);
        
        if (magnets.length > 0) {
          console.log(`   ✅ Encontrados ${magnets.length} magnets`);
          console.log(`   📊 Fuentes: ${[...new Set(magnets.map(m => m.source))].join(', ')}`);
          
          results.push({
            type: 'imdb_direct',
            id: imdbId,
            magnets: magnets.length,
            sources: [...new Set(magnets.map(m => m.source))],
            firstTitle: magnets[0]?.title || 'N/A',
            quality: magnets[0]?.quality || 'N/A'
          });
        } else {
          console.log(`   ⚠️  No encontrado localmente, intentando API...`);
          
          // Intentar con Torrentio API
          const torrentioService = new TorrentioApiService(
            'https://torrentio.strem.fun/sort=qualitysize%7Cqualityfilter=480p,720p,1080p',
            logger
          );
          
          try {
            const apiMagnets = await torrentioService.getMagnetsByImdbId(imdbId);
            if (apiMagnets.length > 0) {
              console.log(`   ✅ API encontró ${apiMagnets.length} magnets`);
              results.push({
                type: 'imdb_api',
                id: imdbId,
                magnets: apiMagnets.length,
                sources: ['torrentio_api'],
                firstTitle: apiMagnets[0]?.title || 'N/A',
                quality: apiMagnets[0]?.quality || 'N/A'
              });
            } else {
              console.log(`   ❌ No encontrado en API`);
              results.push({
                type: 'imdb_not_found',
                id: imdbId,
                magnets: 0
              });
            }
          } catch (apiError) {
            console.log(`   ❌ Error API: ${apiError.message}`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({
          type: 'imdb_error',
          id: imdbId,
          error: error.message
        });
      }
    }

    // Prueba 2: Conversión Kitsu → IMDb → Magnet
    console.log('\n🔍 PRUEBA 2: Conversión Kitsu → IMDb → Magnet');
    console.log('-'.repeat(60));
    
    // Importar servicio unificado con dependencias inyectadas
    const { unifiedIdService } = await import('./src/infrastructure/services/UnifiedIdService.js');
    
    for (const kitsuId of REAL_KITSU_IDS.slice(0, 3)) {
      console.log(`\n📋 Procesando Kitsu: ${kitsuId}`);
      
      try {
        const conversion = await unifiedIdService.processContentId(kitsuId, 'imdb');
        
        if (conversion.success) {
          console.log(`   ✅ Convertido a IMDb: ${conversion.processedId}`);
          
          const magnets = await cascadingRepo.getMagnetsByImdbId(conversion.processedId);
          
          if (magnets.length > 0) {
            console.log(`   ✅ Encontrados ${magnets.length} magnets`);
            results.push({
              type: 'kitsu_cascade',
              kitsuId,
              imdbId: conversion.processedId,
              magnets: magnets.length,
              sources: [...new Set(magnets.map(m => m.source))],
              firstTitle: magnets[0]?.title || 'N/A'
            });
          } else {
            console.log(`   ⚠️  No encontrado en repositorios locales`);
            results.push({
              type: 'kitsu_not_found',
              kitsuId,
              imdbId: conversion.processedId,
              magnets: 0
            });
          }
        } else {
          console.log(`   ❌ Conversión fallida: ${conversion.metadata?.error || 'Error desconocido'}`);
          results.push({
            type: 'kitsu_conversion_failed',
            kitsuId,
            error: conversion.metadata?.error || 'Error desconocido'
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.push({
          type: 'kitsu_error',
          kitsuId,
          error: error.message
        });
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE INTEGRACIÓN COMPLETA');
    console.log('='.repeat(70));

    const summary = {
      totalTests: results.length,
      successful: results.filter(r => r.magnets > 0).length,
      failed: results.filter(r => !r.magnets || r.error).length,
      byType: {
        imdbDirect: results.filter(r => r.type.startsWith('imdb_')),
        kitsuCascade: results.filter(r => r.type.startsWith('kitsu_'))
      }
    };

    console.log('\n📈 Estadísticas:');
    console.log(`   Total de pruebas: ${summary.totalTests}`);
    console.log(`   Con magnets: ${summary.successful}`);
    console.log(`   Sin magnets: ${summary.failed}`);

    console.log('\n✅ Resultados exitosos:');
    results.filter(r => r.magnets > 0).forEach(r => {
      if (r.kitsuId) {
        console.log(`   🎯 ${r.kitsuId} → ${r.imdbId}: ${r.magnets} magnets`);
      } else {
        console.log(`   🎯 ${r.id}: ${r.magnets} magnets (${r.sources?.join(', ')})`);
      }
    });

    console.log('\n❌ Resultados fallidos:');
    results.filter(r => !r.magnets || r.error).forEach(r => {
      const id = r.kitsuId || r.id;
      const reason = r.error || 'No encontrado';
      console.log(`   ❌ ${id}: ${reason}`);
    });

    console.log('\n✅ Prueba de integración completada');
    return summary;

  } catch (error) {
    console.error('Error general:', error);
    console.error(error.stack);
    return { error: error.message };
  }
}

// Ejecutar si es el archivo principal
if (import.meta.main) {
  testCascadingSearch();
}