#!/usr/bin/env bun

/**
 * Script detallado para probar la validación de formatos de ID
 * Incluye manejo de errores detallado
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

async function testIdValidationDetailed() {
  console.log('🔍 PRUEBA DETALLADA DE VALIDACIÓN DE IDs');
  console.log('='.repeat(60));

  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector, null); // unifiedService no es crítico para esta prueba

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
      // Paso 1: Detección de tipo
      console.log(`   1. Detección de tipo...`);
      const detection = detector.detectIdType(id);
      console.log(`      Tipo: ${detection.type} | Válido: ${detection.isValid} | Mensaje: ${detection.message}`);
      
      if (!detection.isValid) {
        results.push({ id, step: 'detection', error: detection.message });
        continue;
      }

      // Paso 2: Validación dinámica (sin conversión)
      console.log(`   2. Validación dinámica...`);
      const validation = await validator.validateContentId(id, 'diagnostic', {
        targetFormat: detection.type,
        strictMode: false
      });
      
      console.log(`      Válido: ${validation.isValid}`);
      
      if (!validation.isValid) {
        console.log(`      Error: ${validation.details?.error || 'Error desconocido'}`);
        console.log(`      Detalles: ${JSON.stringify(validation.details || {}, null, 2)}`);
        results.push({ id, step: 'validation', error: validation.details?.error || 'Error desconocido', details: validation.details });
      } else {
        console.log(`      ✅ Validación exitosa`);
        results.push({ id, step: 'complete', isValid: true });
      }

    } catch (error) {
      console.log(`   ❌ Error crítico: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
      results.push({ id, step: 'exception', error: error.message, stack: error.stack });
    }
  }

  console.log('\n📊 RESUMEN DETALLADO');
  console.log('='.repeat(60));
  
  const valid = results.filter(r => r.isValid);
  const invalid = results.filter(r => !r.isValid);
  
  console.log(`✅ Válidos: ${valid.length}`);
  console.log(`❌ Inválidos: ${invalid.length}`);
  
  if (invalid.length > 0) {
    console.log('\n❌ Errores detallados:');
    invalid.forEach(r => {
      console.log(`   ${r.id} [${r.step}]: ${r.error}`);
      if (r.details) {
        console.log(`      Detalles: ${JSON.stringify(r.details, null, 2)}`);
      }
    });
  }

  return results;
}

if (import.meta.main) {
  testIdValidationDetailed();
}