#!/usr/bin/env bun

/**
 * Script de depuración para identificar el problema exacto con validación de IDs de series
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

async function debugIdValidation() {
  console.log('🔍 DEPURACIÓN DE VALIDACIÓN DE IDs');
  console.log('='.repeat(60));

  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector, null);

  // IDs problemáticos específicos
  const testCases = [
    'tt21975436:1:2',
    'tt0804484:3:9',
    'tt12345678:5:10',
    'tt1234567:1:1',   // Versión con 7 dígitos
    'tt123456:1:1'     // Versión con 6 dígitos
  ];

  for (const testId of testCases) {
    console.log(`\n📋 Analizando: ${testId}`);
    
    try {
      // Paso 1: Detección
      const detection = detector.detectIdType(testId);
      console.log(`   Tipo detectado: ${detection.type}`);
      console.log(`   ID normalizado: ${detection.id}`);
      console.log(`   Válido: ${detection.isValid}`);
      console.log(`   Mensaje: ${detection.message}`);

      if (detection.isValid) {
        // Paso 2: Verificar reglas de validación
        const rules = validator.validationRules.get(detection.type);
        if (rules) {
          console.log(`   Longitud actual: ${testId.length}`);
          console.log(`   Longitud esperada: ${rules.minLength}-${rules.maxLength}`);
          console.log(`   Patrón: ${rules.allowedChars.source}`);
          console.log(`   Coincide patrón: ${rules.allowedChars.test(testId)}`);
        }

        // Paso 3: Validación dinámica detallada
        const validation = await validator.validateContentId(testId, 'diagnostic', {
          targetFormat: 'imdb',
          strictMode: false
        });
        
        console.log(`   Validación final: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
        
        if (!validation.isValid) {
          console.log(`   Error detallado: ${JSON.stringify(validation.details, null, 2)}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error crítico: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
    }
  }

  console.log('\n✅ DEPURACIÓN COMPLETA');
}

if (import.meta.main) {
  debugIdValidation();
}