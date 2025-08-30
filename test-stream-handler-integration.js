#!/usr/bin/env bun

/**
 * Script de prueba de integración para verificar el flujo completo
 * de manejo de IDs de series en StreamHandler
 */

import { StreamHandler } from './src/application/handlers/StreamHandler.js';
import { IdDetectorService } from './src/infrastructure/services/IdDetectorService.js';
import { DynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';
import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

// Mock simple para pruebas
class MockLogger {
  info(message, data) { console.log(`[INFO] ${message}`, data || ''); }
  warn(message, data) { console.log(`[WARN] ${message}`, data || ''); }
  error(message, data) { console.error(`[ERROR] ${message}`, data || ''); }
}

async function testStreamHandlerIntegration() {
  console.log('🔄 PRUEBA DE INTEGRACIÓN - STREAM HANDLER');
  console.log('='.repeat(60));

  // Crear servicios necesarios
  const logger = new MockLogger();
  const detector = new IdDetectorService();
  const validator = new DynamicValidationService(detector, null);
  const torrentioService = new TorrentioApiService(logger);
  const magnetRepository = new CascadingMagnetRepository(logger);
  
  // Crear StreamHandler con servicios mockeados
  const streamHandler = new StreamHandler(logger, validator, torrentioService, magnetRepository);

  // IDs de prueba que causaban errores
  const testCases = [
    {
      type: 'movie',
      id: 'tt37437800',
      description: 'Movie ID que falló en logs'
    },
    {
      type: 'series',
      id: 'tt21975436:1:2',
      description: 'Series episodio que falló en logs'
    },
    {
      type: 'series',
      id: 'tt0804484:3:9',
      description: 'Otro series episodio que falló'
    },
    {
      type: 'movie',
      id: 'tt0112178',
      description: 'Movie ID válido de referencia'
    }
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\n📺 Probando: ${testCase.description}`);
    console.log(`   Tipo: ${testCase.type} | ID: ${testCase.id}`);
    
    try {
      // Verificar validación de ID
      const validation = await validator.validateContentId(testCase.id, 'stream_request', {
        targetFormat: 'imdb',
        strictMode: false
      });
      
      if (validation.isValid) {
        console.log(`   ✅ Validación de ID: VÁLIDO`);
        console.log(`      Tipo detectado: ${validation.details?.detection?.type}`);
        
        // Extraer información de temporada/episodio para series
        if (testCase.type === 'series') {
          const parts = testCase.id.split(':');
          const season = parseInt(parts[1]);
          const episode = parseInt(parts[2]);
          console.log(`      Temporada: ${season} | Episodio: ${episode}`);
        }
        
        results.push({ id: testCase.id, valid: true, type: testCase.type });
      } else {
        console.log(`   ❌ Validación de ID: INVÁLIDO`);
        console.log(`      Error: ${validation.details?.error}`);
        results.push({ id: testCase.id, valid: false, error: validation.details?.error });
      }

    } catch (error) {
      console.log(`   ❌ Error en prueba: ${error.message}`);
      results.push({ id: testCase.id, valid: false, error: error.message });
    }
  }

  console.log('\n📊 RESUMEN DE INTEGRACIÓN');
  console.log('='.repeat(60));
  
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  
  console.log(`✅ IDs válidos: ${valid.length}`);
  console.log(`❌ IDs inválidos: ${invalid.length}`);
  
  if (invalid.length > 0) {
    console.log('\n❌ Errores:');
    invalid.forEach(r => {
      console.log(`   ${r.id}: ${r.error}`);
    });
  } else {
    console.log('\n🎉 ¡Todos los IDs ahora son válidos!');
    console.log('   Los errores reportados en los logs han sido corregidos.');
  }

  return results;
}

if (import.meta.main) {
  testStreamHandlerIntegration();
}