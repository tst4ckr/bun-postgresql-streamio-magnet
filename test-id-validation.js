#!/usr/bin/env bun

/**
 * Script para probar la validación de formatos de ID
 * Verifica si los errores reportados aún existen
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

async function testIdValidation() {
  console.log('🔍 PRUEBA DE VALIDACIÓN DE IDs');
  console.log('='.repeat(50));

  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector);

  // IDs que causaron errores en logs anteriores
  const testIds = [
    'tt37437800',        // Movie ID que falló
    'tt21975436:1:2',    // Series episodio formato que falló
    'tt0804484:3:9',     // Series episodio formato que falló
    'tt0112178',         // Movie ID válido
    'kitsu:1',           // Kitsu ID
    'tt0111161'          // Otro ID válido
  ];

  const results = [];

  for (const id of testIds) {
    console.log(`\n📋 Probando ID: ${id}`);
    
    try {
      // Detección de tipo
      const detection = detector.detectIdType(id);
      console.log(`   Detección: ${detection.type} (válido: ${detection.isValid})`);
      
      // Validación dinámica
      const validation = await validator.validateContentId(id, 'stream_request', {
        targetFormat: 'imdb',
        strictMode: false
      });
      
      console.log(`   Validación: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
      
      if (!validation.isValid) {
        console.log(`   Error: ${validation.details?.error || 'Error desconocido'}`);
      }

      results.push({
        id,
        detection: detection.type,
        isValid: validation.isValid,
        error: validation.details?.error
      });

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({
        id,
        error: error.message,
        isValid: false
      });
    }
  }

  console.log('\n📊 RESUMEN DE VALIDACIÓN');
  console.log('='.repeat(50));
  
  const valid = results.filter(r => r.isValid);
  const invalid = results.filter(r => !r.isValid);
  
  console.log(`✅ Válidos: ${valid.length}`);
  console.log(`❌ Inválidos: ${invalid.length}`);
  
  if (invalid.length > 0) {
    console.log('\n❌ IDs inválidos:');
    invalid.forEach(r => {
      console.log(`   ${r.id}: ${r.error || 'Formato no soportado'}`);
    });
  }

  return results;
}

if (import.meta.main) {
  testIdValidation();
}