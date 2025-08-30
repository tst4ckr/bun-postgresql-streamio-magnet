#!/usr/bin/env node

/**
 * Script de verificación de ventajas competitivas descubiertas
 * Verifica que todos los servicios entienden correctamente los nuevos tipos de IDs
 */

import { UnifiedIdService } from '../src/infrastructure/services/UnifiedIdService.js';
import { KitsuMappingFallback } from '../src/infrastructure/services/KitsuMappingFallback.js';
import { IdDetectorService } from '../src/infrastructure/services/IdDetectorService.js';

class CompetitiveAdvantagesVerifier {
  constructor() {
    this.idDetector = new IdDetectorService();
    this.mappingService = new KitsuMappingFallback();
    this.unifiedService = new UnifiedIdService(
      this.idDetector,
      null, // kitsuApiService no necesario para esta verificación
      this.mappingService
    );
    
    this.testCases = [
      // Kitsu IDs
      { id: 'kitsu:48671', expectedImdb: 'tt21209876', type: 'Solo Leveling' },
      { id: 'kitsu:44042', expectedImdb: 'tt25622312', type: 'Attack on Titan' },
      { id: '48671', expectedImdb: 'tt21209876', type: 'Solo Leveling (sin prefijo)' },
      
      // MAL IDs
      { id: 'mal:5114', expectedImdb: 'tt25622312', type: 'Attack on Titan (MAL)' },
      { id: 'mal:37510', expectedImdb: 'tt21209876', type: 'Solo Leveling (MAL)' },
      
      // AniList IDs
      { id: 'anilist:5114', expectedImdb: 'tt25622312', type: 'Attack on Titan (AniList)' },
      { id: 'anilist:108632', expectedImdb: 'tt21209876', type: 'Solo Leveling (AniList)' },
      
      // AniDB IDs
      { id: 'anidb:4563', expectedImdb: 'tt25622312', type: 'Attack on Titan (AniDB)' },
      { id: 'anidb:13679', expectedImdb: 'tt9335498', type: 'Demon Slayer (AniDB)' },
      
      // IMDb directos
      { id: 'tt25622312', expectedImdb: 'tt25622312', type: 'Attack on Titan (IMDb directo)' },
      { id: 'tt21209876', expectedImdb: 'tt21209876', type: 'Solo Leveling (IMDb directo)' }
    ];
  }

  async verify() {
    console.log('🔍 VERIFICACIÓN DE VENTAJAS COMPETITIVAS');
    console.log('=' .repeat(50));
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const testCase of this.testCases) {
      totalTests++;
      
      console.log(`\n📋 Verificando: ${testCase.type}`);
      console.log(`   ID: ${testCase.id}`);
      console.log(`   Esperado: ${testCase.expectedImdb}`);
      
      // 1. Verificar detección de tipo
      const detection = this.idDetector.detectIdType(testCase.id);
      console.log(`   Tipo detectado: ${detection.type}`);
      
      // 2. Verificar mapeo directo
      const directMapping = this.mappingService.getImdbIdFromAny(testCase.id);
      console.log(`   Mapeo directo: ${directMapping}`);
      
      // 3. Verificar conversión unificada
      const conversion = await this.unifiedService.processContentId(testCase.id);
      const unifiedMapping = conversion.processedId;
      console.log(`   Conversión unificada: ${unifiedMapping}`);
      
      // Verificar resultados
      const allMatch = directMapping === testCase.expectedImdb && 
                      unifiedMapping === testCase.expectedImdb;
      
      if (allMatch) {
        passedTests++;
        console.log(`   ✅ PASÓ - Todos los servicios coinciden`);
      } else {
        console.log(`   ❌ FALLÓ - Resultados inconsistentes`);
        console.log(`      Directo: ${directMapping}, Unificado: ${unifiedMapping}`);
      }
    }
    
    console.log('\n📊 RESUMEN DE VERIFICACIÓN');
    console.log('=' .repeat(30));
    console.log(`   Total de pruebas: ${totalTests}`);
    console.log(`   Pruebas pasadas: ${passedTests}`);
    console.log(`   Pruebas falladas: ${totalTests - passedTests}`);
    console.log(`   Precisión: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    // Verificar servicios disponibles
    console.log('\n⚙️ SERVICIOS CONFIGURADOS');
    console.log('=' .repeat(30));
    
    const availableMappings = Array.from(this.mappingService.manualMappings.entries());
    console.log(`   Mapeos disponibles: ${availableMappings.length}`);
    
    const supportedTypes = Array.from(this.idDetector.detectionPatterns.keys());
    console.log(`   Tipos soportados: ${supportedTypes.join(', ')}`);
    
    // Mostrar algunos mapeos clave
    console.log('\n🔑 MAPEOS CLAVE VERIFICADOS');
    console.log('=' .repeat(30));
    
    const keyMappings = [
      ['kitsu:48671', 'Solo Leveling'],
      ['mal:5114', 'Attack on Titan'],
      ['anilist:101922', 'Demon Slayer'],
      ['anidb:13679', 'Demon Slayer']
    ];
    
    keyMappings.forEach(([id, name]) => {
      const result = this.mappingService.getImdbIdFromAny(id);
      console.log(`   ${name}: ${id} → ${result}`);
    });
    
    return {
      totalTests,
      passedTests,
      success: passedTests === totalTests
    };
  }
}

// Ejecutar verificación
async function main() {
  const verifier = new CompetitiveAdvantagesVerifier();
  const results = await verifier.verify();
  
  if (results.success) {
    console.log('\n🎉 ¡TODOS LOS SERVICIOS ESTÁN SINCRONIZADOS!');
    console.log('   Las ventajas competitivas descubiertas están completamente implementadas.');
  } else {
    console.log('\n⚠️  ALGUNOS SERVICIOS NECESITAN AJUSTES');
    console.log('   Revisar las pruebas fallidas y sincronizar servicios.');
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { CompetitiveAdvantagesVerifier };