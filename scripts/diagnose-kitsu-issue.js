#!/usr/bin/env node

/**
 * Script de diagnóstico para identificar problemas con IDs de Kitsu y otros servicios de anime.
 * Simula el flujo completo: ID de anime → conversión a IMDb → búsqueda de magnets.
 */

import { unifiedIdService } from '../src/infrastructure/services/UnifiedIdService.js';
import { CascadingMagnetRepository } from '../src/infrastructure/repositories/CascadingMagnetRepository.js';
import { addonConfig } from '../src/config/addonConfig.js';

class KitsuIssueDiagnoser {
  constructor() {
    this.logger = {
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
    };
    
    this.repository = new CascadingMagnetRepository(
      addonConfig.repository.primaryCsvPath,
      addonConfig.repository.secondaryCsvPath,
      addonConfig.repository.animeCsvPath,
      addonConfig.repository.torrentioApiUrl,
      this.logger,
      addonConfig.repository.timeout
    );
  }

  async diagnose() {
    console.log('🔍 Iniciando diagnóstico de compatibilidad con IDs de anime...\n');

    // IDs de prueba de diferentes servicios de anime
    const testCases = [
      { type: 'kitsu', id: 'kitsu:12', description: 'Kitsu - One Piece' },
      { type: 'kitsu', id: 'kitsu:1', description: 'Kitsu - Cowboy Bebop' },
      { type: 'mal', id: 'mal:1', description: 'MyAnimeList - Cowboy Bebop' },
      { type: 'anilist', id: 'anilist:1', description: 'AniList - Cowboy Bebop' },
      { type: 'anidb', id: 'anidb:1', description: 'AniDB - Cowboy Bebop' },
      { type: 'imdb', id: 'tt0112178', description: 'IMDb - Cowboy Bebop' }
    ];

    for (const testCase of testCases) {
      await this.testIdConversion(testCase);
    }

    console.log('\n📊 Resumen del diagnóstico:');
    console.log('-'.repeat(50));
    
    // Probar búsqueda de magnets con un caso específico
    await this.testMagnetSearch('kitsu:1', 'anime');
  }

  async testIdConversion(testCase) {
    console.log(`\n🧪 Probando: ${testCase.description}`);
    console.log(`   ID original: ${testCase.id}`);

    try {
      const result = await unifiedIdService.processContentId(testCase.id, 'imdb');
      
      if (result.success) {
        console.log(`   ✅ Conversión exitosa: ${result.originalId} → ${result.processedId}`);
        console.log(`   📋 Detalles:`, {
          conversionRequired: result.conversionRequired,
          conversionMethod: result.conversionMethod,
          confidence: result.confidence,
          source: result.source
        });
      } else {
        console.log(`   ❌ Error: ${result.error}`);
        console.log(`   🔍 Detalles:`, result.details);
      }
    } catch (error) {
      console.log(`   💥 Excepción: ${error.message}`);
    }
  }

  async testMagnetSearch(contentId, type) {
    console.log(`\n🔍 Probando búsqueda de magnets para: ${contentId} (${type})`);
    
    try {
      await this.repository.initialize();
      
      const startTime = Date.now();
      const magnets = await this.repository.getMagnetsByContentId(contentId, type);
      const duration = Date.now() - startTime;
      
      console.log(`   ✅ Búsqueda completada en ${duration}ms`);
      console.log(`   📦 Encontrados: ${magnets?.length || 0} magnets`);
      
      if (magnets && magnets.length > 0) {
        console.log(`   🎯 Primer magnet:`, {
          name: magnets[0].name,
          quality: magnets[0].quality,
          provider: magnets[0].provider,
          seeders: magnets[0].seeders
        });
      }
    } catch (error) {
      console.log(`   ❌ Error en búsqueda: ${error.message}`);
      
      if (error.message.includes('No se encontraron magnets')) {
        console.log(`   💡 Sugerencia: Verificar si hay datos disponibles para este anime`);
      }
    }
  }
}

// Ejecutar diagnóstico
async function runDiagnosis() {
  try {
    const diagnoser = new KitsuIssueDiagnoser();
    await diagnoser.diagnose();
  } catch (error) {
    console.error('Error durante el diagnóstico:', error);
  }
}

// Ejecutar si se llama directamente
if (import.meta.main) {
  runDiagnosis();
}

export { KitsuIssueDiagnoser };