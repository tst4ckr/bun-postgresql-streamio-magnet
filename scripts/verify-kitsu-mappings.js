#!/usr/bin/env node

/**
 * Script para verificar y diagnosticar el estado actual de los mapeos de Kitsu.
 * Muestra qué IDs de Kitsu están mapeados y cuáles no.
 */

import { kitsuMappingFallback } from '../src/infrastructure/services/KitsuMappingFallback.js';
import { unifiedIdService } from '../src/infrastructure/services/UnifiedIdService.js';

class KitsuMappingVerifier {
  constructor() {
    this.logger = {
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
    };
  }

  async verifyMappings() {
    console.log('🔍 Verificando estado de mapeos de Kitsu...\n');

    // Mostrar todos los mapeos actuales
    console.log('📊 Todos los mapeos actuales:');
    const allMappings = kitsuMappingFallback.getAllMappings();
    console.log(`Total de mapeos: ${Object.keys(allMappings).length}`);
    
    // Filtrar solo mapeos de Kitsu
    const kitsuMappings = Object.entries(allMappings).filter(([key]) => 
      key.startsWith('kitsu:')
    );
    
    console.log(`Mapeos de Kitsu: ${kitsuMappings.length}`);
    
    if (kitsuMappings.length > 0) {
      console.log('\n🎯 Primeros 10 mapeos de Kitsu:');
      kitsuMappings.slice(0, 10).forEach(([kitsuId, imdbId]) => {
        console.log(`   ${kitsuId} → ${imdbId}`);
      });
    } else {
      console.log('\n⚠️ No hay mapeos de Kitsu configurados');
    }

    // Probar IDs específicos
    const testIds = ['1', '12', '100', '1000', '40456'];
    
    console.log('\n🧪 Probando IDs específicos:');
    
    for (const kitsuId of testIds) {
      const fullId = `kitsu:${kitsuId}`;
      const imdbId = kitsuMappingFallback.getImdbIdFromKitsu(kitsuId);
      
      console.log(`   ${fullId}: ${imdbId || '❌ No mapeado'}`);
    }

    // Verificar el método getImdbIdFromAny
    console.log('\n🔍 Probando método getImdbIdFromAny:');
    
    const testCases = [
      'kitsu:1',
      'kitsu:12', 
      'kitsu:40456',
      'mal:1',
      'anilist:1',
      'tt0112178'
    ];

    for (const testId of testCases) {
      const result = kitsuMappingFallback.getImdbIdFromAny(testId);
      console.log(`   ${testId}: ${result || '❌ No encontrado'}`);
    }

    // Probar conversión completa con el servicio unificado
    console.log('\n🔄 Probando conversión completa con UnifiedIdService:');
    
    for (const testId of ['kitsu:1', 'kitsu:12', 'kitsu:40456']) {
      try {
        const result = await unifiedIdService.processContentId(testId, 'imdb');
        
        if (result.success) {
          console.log(`   ✅ ${testId} → ${result.processedId}`);
        } else {
          console.log(`   ❌ ${testId}: ${result.error}`);
        }
      } catch (error) {
        console.log(`   💥 ${testId}: Error - ${error.message}`);
      }
    }

    // Verificar estadísticas
    console.log('\n📈 Estadísticas del servicio:');
    const stats = kitsuMappingFallback.getStatistics();
    console.log(stats);
  }
}

// Ejecutar verificación
async function runVerification() {
  try {
    const verifier = new KitsuMappingVerifier();
    await verifier.verifyMappings();
  } catch (error) {
    console.error('Error durante la verificación:', error);
  }
}

// Ejecutar si se llama directamente
if (import.meta.main) {
  runVerification();
}

export { KitsuMappingVerifier };