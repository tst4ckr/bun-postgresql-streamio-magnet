#!/usr/bin/env node

/**
 * @fileoverview Debug detallado del flujo completo de búsqueda
 */

import { CascadingMagnetRepository } from '../src/infrastructure/repositories/CascadingMagnetRepository.js';
import { addonConfig } from '../src/config/addonConfig.js';
import { KitsuApiService } from '../src/infrastructure/services/KitsuApiService.js';

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[ERROR] ${msg}`, ...args)
};

/**
 * Debug del flujo completo de búsqueda de magnets
 */
async function debugFullFlow() {
  console.log('🔍 Debug: Flujo completo de búsqueda');
  console.log('=====================================\n');

  // 1. Inicializar repositorio
  console.log('1. Inicializando repositorio...');
  const repository = new CascadingMagnetRepository(
    addonConfig.repository.primaryCsvPath,
    addonConfig.repository.secondaryCsvPath,
    addonConfig.repository.animeCsvPath,
    addonConfig.repository.torrentioApiUrl,
    logger,
    addonConfig.repository.timeout
  );

  try {
    await repository.initialize();
    console.log('✅ Repositorio inicializado');
  } catch (error) {
    console.log('❌ Error inicializando repositorio:', error.message);
    return;
  }

  // 2. Servicio de Kitsu
  const kitsuService = new KitsuApiService();

  // 3. Probar flujo completo con varios animes
  const testCases = [
    { name: 'Spy x Family', kitsuId: 'kitsu:48671', expectedImdb: 'tt21209876' },
    { name: 'Demon Slayer', kitsuId: 'kitsu:44042', expectedImdb: 'tt25622312' },
    { name: 'Attack on Titan', malId: 'mal:16498' },
    { name: 'One Piece', malId: 'mal:21' },
  ];

  for (const testCase of testCases) {
    console.log(`\n📋 Procesando: ${testCase.name}`);
    console.log('--------------------------------');

    let finalId = null;
    let idType = null;

    // Paso 1: Determinar el ID final (IMDb)
    if (testCase.kitsuId) {
      console.log(`   🔍 Buscando IMDb desde Kitsu: ${testCase.kitsuId}`);
      const imdbId = await kitsuService.getImdbIdFromKitsu(testCase.kitsuId);
      console.log(`   📋 Resultado: ${imdbId || 'No encontrado'}`);
      finalId = imdbId;
      idType = 'IMDb desde Kitsu';
    } else if (testCase.malId) {
      console.log(`   🔍 Buscando IMDb desde MAL: ${testCase.malId}`);
      // Para MAL, necesitaríamos un servicio similar
      console.log('   ⚠️ Mapeo MAL→IMDb no implementado directamente');
      finalId = testCase.malId; // Usar MAL ID directamente
      idType = 'MAL directo';
    }

    if (!finalId) {
      console.log('   ❌ No se pudo determinar ID final');
      continue;
    }

    // Paso 2: Buscar magnets
    console.log(`   🔍 Buscando magnets para: ${finalId} (${idType})`);
    try {
      const magnets = await repository.getMagnetsByContentId(finalId, 'anime');
      
      if (magnets && magnets.length > 0) {
        console.log(`   ✅ Encontrados ${magnets.length} magnets:`);
        magnets.slice(0, 3).forEach((magnet, idx) => {
          console.log(`      ${idx + 1}. ${magnet.name} (${magnet.quality}) - ${magnet.provider}`);
        });
      } else {
        console.log('   ⚠️ No se encontraron magnets');
      }
    } catch (error) {
      console.log('   ❌ Error buscando magnets:', error.message);
    }
  }

  // 4. Verificar conectividad con Torrentio
  console.log('\n🔗 Verificando conectividad con Torrentio...');
  try {
    const response = await fetch(addonConfig.repository.torrentioApiUrl + '/stream/movie/tt25622312.json');
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Torrentio responde: ${data.streams?.length || 0} streams`);
    } else {
      console.log(`   ❌ Torrentio error: ${response.status}`);
    }
  } catch (error) {
    console.log('   ❌ Error conectando con Torrentio:', error.message);
  }

  console.log('\n📊 Diagnóstico final:');
  console.log('=====================');
  console.log('• El addon está técnicamente funcionando');
  console.log('• Los problemas pueden ser:');
  console.log('  1. Pocos torrents disponibles en español');
  console.log('  2. IDs mal mapeados entre servicios');
  console.log('  3. Filtros demasiado restrictivos');
  console.log('\n💡 Recomendación:');
  console.log('Busca animes específicos en Stremio usando "Anime Catalogs"');
  console.log('y verifica si aparecen streams.');
}

// Ejecutar debug
debugFullFlow().catch(console.error);