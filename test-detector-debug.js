#!/usr/bin/env bun

/**
 * Script de depuración para el IdDetectorService
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';

function testDetectorDebug() {
  console.log('🔧 DEPURACIÓN DEL DETECTOR DE IDs');
  console.log('='.repeat(50));

  const detector = new IdDetectorService();

  // IDs problemáticos
  const testIds = [
    'mal:11061:1:1',
    'anilist:21087:1:1', 
    'anidb:8074:1:1'
  ];

  console.log('🔍 Verificando patrones registrados:');
  console.log('');
  
  // Acceder a los patrones internos (para depuración)
  const patterns = detector.detectionPatterns;
  
  for (const [type, config] of patterns) {
    if (type.includes('series') && (type.includes('mal') || type.includes('anilist') || type.includes('anidb'))) {
      console.log(`📋 Patrón: ${type}`);
      console.log(`   Regex: ${config.pattern}`);
      console.log(`   Descripción: ${config.description}`);
      console.log('');
    }
  }

  console.log('🧪 Probando detección paso a paso:');
  console.log('');

  for (const id of testIds) {
    console.log(`📺 ID: ${id}`);
    
    // Probar cada patrón manualmente
    for (const [type, config] of patterns) {
      const matches = config.pattern.test(id);
      if (matches) {
        console.log(`   ✅ Coincide con patrón: ${type}`);
        
        // Probar validador
        try {
          const isValid = config.validator(id);
          console.log(`   🔍 Validador: ${isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
        } catch (error) {
          console.log(`   ❌ Error en validador: ${error.message}`);
        }
      }
    }
    
    // Probar detección completa
    try {
      const detection = detector.detectIdType(id);
      console.log(`   🎯 Detección final: ${detection.type} (${detection.isValid ? 'VÁLIDO' : 'INVÁLIDO'})`);
      if (!detection.isValid) {
        console.log(`   📝 Mensaje: ${detection.message}`);
      }
    } catch (error) {
      console.log(`   ❌ Error en detección: ${error.message}`);
    }
    
    console.log('');
  }
}

if (import.meta.main) {
  testDetectorDebug();
}