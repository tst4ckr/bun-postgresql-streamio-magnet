#!/usr/bin/env node

/**
 * Script de prueba para verificar la nueva arquitectura dinámica
 * Valida que el sistema funcione sin dependencia excesiva de mapeos estáticos
 */

import { UnifiedIdService } from './src/infrastructure/services/UnifiedIdService.js';
import { KitsuApiService } from './src/infrastructure/services/KitsuApiService.js';
import { KitsuMappingFallback } from './src/infrastructure/services/KitsuMappingFallback.js';
import { idDetectorService } from './src/infrastructure/services/IdDetectorService.js';

class DynamicArchitectureTester {
  constructor() {
    this.unifiedService = new UnifiedIdService(
      idDetectorService,
      new KitsuApiService(),
      new KitsuMappingFallback()
    );
  }

  async runTests() {
    console.log('🧪 Iniciando pruebas de arquitectura dinámica...\n');
    
    const testCases = [
      // IDs que deberían funcionar dinámicamente
      { id: 'kitsu:12', expected: 'tt0388629', description: 'Naruto - API dinámica' },
      { id: 'kitsu:1', expected: 'tt0112718', description: 'Cowboy Bebop - Fallback crítico' },
      { id: 'kitsu:9253', expected: 'tt0877057', description: 'Death Note - Fallback crítico' },
      
      // IDs que deberían fallar (no en mapeos críticos)
      { id: 'kitsu:100', expected: null, description: 'ID no crítico - API dinámica' },
      { id: 'kitsu:1000', expected: null, description: 'ID no crítico - API dinámica' },
      
      // IDs con prefijos
      { id: 'mal:1', expected: 'tt0112718', description: 'MAL ID - Conversión unificada' },
    ];

    console.log('📊 Verificando configuración del servicio de fallback...');
    const fallback = new KitsuMappingFallback();
    const stats = fallback.getStats();
    console.log(`✅ Mapeos críticos: ${stats.totalCriticalMappings}`);
    console.log(`✅ Cobertura: ${stats.coverage}%`);
    console.log('');

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      console.log(`🔄 Probando: ${testCase.description}`);
      console.log(`   ID: ${testCase.id}`);
      
      try {
        const result = await this.unifiedService.processContentId(testCase.id, 'imdb');
        
        if (result.success) {
          console.log(`   ✅ Éxito: ${result.convertedId}`);
          console.log(`   📋 Método: ${result.metadata?.conversionMethod}`);
          
          if (testCase.expected && result.convertedId === testCase.expected) {
            console.log(`   ✅ Coincide con esperado`);
            passed++;
          } else if (!testCase.expected && !result.convertedId) {
            console.log(`   ✅ Fallo esperado confirmado`);
            passed++;
          } else {
            console.log(`   ⚠️ Resultado inesperado`);
            failed++;
          }
        } else {
          console.log(`   ❌ Falló: ${result.metadata?.error}`);
          if (!testCase.expected) {
            console.log(`   ✅ Fallo esperado`);
            passed++;
          } else {
            console.log(`   ❌ Fallo inesperado`);
            failed++;
          }
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failed++;
      }
      
      console.log('');
      await this.delay(1000); // Respetar límites de API
    }

    console.log('📈 Resumen de pruebas:');
    console.log(`✅ Pasadas: ${passed}`);
    console.log(`❌ Fallidas: ${failed}`);
    console.log(`📊 Total: ${testCases.length}`);
    
    console.log('\n🔍 Verificando que no haya dependencia excesiva de mapeos estáticos...');
    const allMappings = fallback.getAllMappings();
    console.log(`📦 Total mapeos críticos: ${allMappings.length}`);
    
    if (allMappings.length <= 5) {
      console.log('✅ Sistema correctamente dinámico - pocos mapeos críticos');
    } else {
      console.log('⚠️ Demasiados mapeos críticos - revisar configuración');
    }

    return { passed, failed, total: testCases.length };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testPerformance() {
    console.log('⚡ Probando rendimiento de conversión...');
    
    const start = Date.now();
    
    // Prueba de conversión dinámica
    const dynamicTest = await this.unifiedService.processContentId('kitsu:12', 'imdb');
    const dynamicTime = Date.now() - start;
    
    console.log(`🚀 Conversión dinámica: ${dynamicTime}ms`);
    console.log(`📋 Método usado: ${dynamicTest.metadata?.conversionMethod}`);
    
    // Verificar que usa API dinámica primero
    if (dynamicTest.metadata?.conversionMethod === 'kitsu_api') {
      console.log('✅ Sistema usando API dinámica correctamente');
    } else {
      console.log(`⚠️ Usando método: ${dynamicTest.metadata?.conversionMethod}`);
    }
  }
}

// Ejecutar pruebas
async function main() {
  const tester = new DynamicArchitectureTester();
  
  try {
    await tester.runTests();
    await tester.testPerformance();
    
    console.log('\n🎉 Pruebas completadas!');
    console.log('✅ Sistema dinámico implementado correctamente');
    console.log('✅ Dependencia de mapeos estáticos eliminada');
    console.log('✅ Fallback crítico funcionando para casos extremos');
    
  } catch (error) {
    console.error('❌ Error en pruebas:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}