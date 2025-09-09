#!/usr/bin/env bun

/**
 * Script de prueba específico para IDs de anime
 */

import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

async function testAnimeIds() {
  console.log('🎌 VERIFICACIÓN DE IDs DE ANIME');
  console.log('='.repeat(50));

  // Crear servicios necesarios
  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector, null);

  // IDs de anime que estaban fallando
  const animeIds = [
    'mal:11061:1:1',
    'anilist:21087:1:1', 
    'anidb:8074:1:1',
    'kitsu:1376:1:1'
  ];

  console.log('🔍 Analizando IDs de anime:');
  console.log('');

  for (const id of animeIds) {
    try {
      console.log(`📋 ID: ${id}`);
      
      // Verificar detección
      const detection = detector.detectIdType(id);
      console.log(`   Tipo detectado: ${detection.type}`);
      console.log(`   Válido: ${detection.isValid}`);
      
      if (detection.isValid) {
        // Verificar validación dinámica
        const validation = await validator.validateContentId(id, 'stream_request', {
          strictMode: false
        });
        
        console.log(`   Validación: ${validation.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
        
        if (!validation.isValid) {
          console.log(`   Error: ${validation.details?.error}`);
        }
      } else {
        console.log(`   Error de detección: ${detection.message}`);
      }
      
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error procesando ${id}: ${error.message}`);
      console.log('');
    }
  }

  console.log('✅ VERIFICACIÓN COMPLETA');
}

if (import.meta.main) {
  testAnimeIds();
}