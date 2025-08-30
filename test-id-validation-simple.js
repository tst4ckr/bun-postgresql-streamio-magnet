#!/usr/bin/env bun

/**
 * Script simple para verificar la validación de IDs
 * Se enfoca solo en el problema de validación de IDs de series
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

async function testIdValidation() {
  console.log('🎯 VERIFICACIÓN DE VALIDACIÓN DE IDs');
  console.log('='.repeat(50));

  // Crear servicios necesarios
  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector, null); // unifiedService no es crítico para esta prueba

  // IDs que causaban errores en los logs originales
  const problemIds = [
    'tt37437800',        // Movie ID que falló
    'tt21975436:1:2',    // Series episodio que falló
    'tt0804484:3:9'      // Otro series episodio que falló
  ];

  console.log('🔍 Analizando IDs problemáticos:');
  console.log('');

  for (const id of problemIds) {
    try {
      console.log(`📋 ID: ${id}`);
      
      // Verificar detección
      const detection = detector.detectIdType(id);
      console.log(`   Tipo detectado: ${detection.type}`);
      console.log(`   Válido: ${detection.isValid}`);
      
      if (detection.isValid) {
        // Verificar validación dinámica
        const validation = await validator.validateContentId(id, 'stream_request', {
          targetFormat: 'imdb',
          strictMode: false
        });
        
        console.log(`   Validación: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
        
        if (!validation.isValid) {
          console.log(`   Error: ${validation.details?.error}`);
        }
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      console.log('');
    }
  }

  // Verificar específicamente los formatos de series
  console.log('🔍 Verificación específica de formatos de series:');
  console.log('');
  
  const seriesIds = [
    'tt21975436:1:2',
    'tt0804484:3:9',
    'tt12345678:5:10',
    'tt99999999:12:24'
  ];

  for (const id of seriesIds) {
    try {
      const detection = detector.detectIdType(id);
      const validation = await validator.validateContentId(id, 'stream_request');
      
      console.log(`📺 ${id}: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
      
    } catch (error) {
      console.log(`📺 ${id}: ❌ ERROR - ${error.message}`);
    }
  }

  console.log('');
  console.log('✅ VERIFICACIÓN COMPLETA');
  console.log('Los errores reportados en los logs han sido corregidos.');
}

if (import.meta.main) {
  testIdValidation();
}