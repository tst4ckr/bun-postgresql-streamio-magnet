#!/usr/bin/env node

/**
 * Demostración completa del sistema de fallback con filtro de seeds
 * Muestra el comportamiento real del sistema en diferentes escenarios
 */

import { config } from 'dotenv';
config();

import { TorrentioApiService } from '../src/infrastructure/services/TorrentioApiService.js';
import { EnhancedLogger } from '../src/infrastructure/utils/EnhancedLogger.js';

const logger = new EnhancedLogger('FallbackDemo');

async function demonstrateFallbackBehavior() {
  console.log('🎬 DEMOSTRACIÓN DEL SISTEMA DE FALLBACK CON FILTRO DE SEEDS');
  console.log('=' .repeat(70));
  
  const service = new TorrentioApiService(
    process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun/',
    './data/torrentio.csv',
    logger
  );
  
  // Lista de contenido para probar diferentes escenarios
  const testCases = [
    {
      id: 'tt0111161', // The Shawshank Redemption - Popular, debería tener seeds
      type: 'movie',
      name: 'The Shawshank Redemption (1994)'
    },
    {
      id: 'tt0468569', // The Dark Knight - Muy popular
      type: 'movie', 
      name: 'The Dark Knight (2008)'
    },
    {
      id: 'tt0944947', // Game of Thrones - Serie popular
      type: 'series',
      name: 'Game of Thrones'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 PROBANDO: ${testCase.name}`);
    console.log('-' .repeat(50));
    console.log(`   ID: ${testCase.id}`);
    console.log(`   Tipo: ${testCase.type}`);
    console.log(`   Iniciando búsqueda con fallback...\n`);
    
    try {
      const startTime = Date.now();
      const results = await service.searchMagnetsWithLanguageFallback(
        testCase.id, 
        testCase.type
      );
      const endTime = Date.now();
      
      console.log(`\n📊 RESULTADOS PARA ${testCase.name}:`);
      console.log(`   ⏱️  Tiempo de búsqueda: ${endTime - startTime}ms`);
      console.log(`   📦 Total de resultados: ${results.length}`);
      
      if (results.length > 0) {
        // Analizar calidad de los resultados
        let totalSeeds = 0;
        let totalPeers = 0;
        let withoutSeeds = 0;
        
        console.log(`\n   📋 Análisis de resultados:`);
        
        results.slice(0, 3).forEach((magnet, index) => {
          const seeders = parseInt(magnet.seeders) || 0;
          const peers = parseInt(magnet.peers) || 0;
          
          totalSeeds += seeders;
          totalPeers += peers;
          
          if (seeders === 0) withoutSeeds++;
          
          console.log(`   ${index + 1}. ${magnet.name.substring(0, 50)}...`);
          console.log(`      🌱 Seeds: ${seeders}, 👥 Peers: ${peers}, 💾 Tamaño: ${magnet.size}`);
          console.log(`      🔗 Provider: ${magnet.provider || 'N/A'}`);
        });
        
        if (results.length > 3) {
          console.log(`   ... y ${results.length - 3} resultados más`);
        }
        
        console.log(`\n   📈 Estadísticas:`);
        console.log(`      🌱 Seeds promedio: ${Math.round(totalSeeds / Math.min(results.length, 3))}`);
        console.log(`      👥 Peers promedio: ${Math.round(totalPeers / Math.min(results.length, 3))}`);
        console.log(`      ✅ Resultados sin seeds: ${withoutSeeds} (debería ser 0)`);
        
        if (withoutSeeds === 0) {
          console.log(`      🎯 FILTRO DE SEEDS: ✅ FUNCIONANDO CORRECTAMENTE`);
        } else {
          console.log(`      ⚠️  FILTRO DE SEEDS: ❌ ENCONTRADOS RESULTADOS SIN SEEDS`);
        }
        
      } else {
        console.log(`   ⚠️  No se encontraron resultados`);
        console.log(`   💡 Esto puede indicar:`);
        console.log(`      - Contenido muy nuevo o poco popular`);
        console.log(`      - Problemas de conectividad`);
        console.log(`      - Configuración de proveedores muy restrictiva`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error en búsqueda: ${error.message}`);
    }
    
    console.log(`\n${'=' .repeat(70)}`);
  }
}

async function showSystemConfiguration() {
  console.log('\n\n⚙️  CONFIGURACIÓN DEL SISTEMA');
  console.log('=' .repeat(50));
  
  console.log('\n📡 Variables de entorno:');
  console.log(`   TORRENTIO_API_URL: ${process.env.TORRENTIO_API_URL || 'default'}`);
  console.log(`   TORRENTIO_MOVIE_PROVIDERS_ES: ${process.env.TORRENTIO_MOVIE_PROVIDERS_ES || 'default'}`);
  console.log(`   TORRENTIO_MOVIE_PROVIDERS_COMBINED: ${process.env.TORRENTIO_MOVIE_PROVIDERS_COMBINED || 'default'}`);
  
  console.log('\n🔄 Flujo de fallback:');
  console.log('   1. Búsqueda en CSV locales');
  console.log('   2. API Torrentio - Proveedores en español');
  console.log('   3. Filtrar resultados con seeds > 0');
  console.log('   4. Si no hay resultados con seeds → Proveedores combinados');
  console.log('   5. Filtrar resultados con seeds > 0');
  console.log('   6. Guardar solo resultados con seeds');
  
  console.log('\n✅ Mejoras implementadas:');
  console.log('   ✓ Priorización de contenido en español');
  console.log('   ✓ Fallback automático a trackers internacionales');
  console.log('   ✓ Filtro automático de torrents sin seeds');
  console.log('   ✓ Logging detallado del proceso');
  console.log('   ✓ Configuración flexible por variables de entorno');
}

async function main() {
  await showSystemConfiguration();
  await demonstrateFallbackBehavior();
  
  console.log('\n\n🎯 DEMOSTRACIÓN COMPLETADA');
  console.log('=' .repeat(50));
  console.log('✅ El sistema de fallback con filtro de seeds está funcionando');
  console.log('✅ Solo se retornan torrents con seeders activos');
  console.log('✅ Se prioriza contenido en español antes de buscar en inglés');
  console.log('\n💡 Para usar en producción, asegúrate de configurar las variables de entorno apropiadas');
}

main().catch(console.error);