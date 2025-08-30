#!/usr/bin/env node

/**
 * Script de prueba para verificar los mapeos de IDs de anime
 * Prueba todos los servicios de anime (MAL, AniList, AniDB, Kitsu)
 */

import { KitsuMappingFallback } from '../src/infrastructure/services/KitsuMappingFallback.js';
import { UnifiedIdService } from '../src/infrastructure/services/UnifiedIdService.js';
import { idDetectorService } from '../src/infrastructure/services/IdDetectorService.js';
import { kitsuApiService } from '../src/infrastructure/services/KitsuApiService.js';

// Configurar servicios
const mappingService = new KitsuMappingFallback();
const unifiedService = new UnifiedIdService(
  idDetectorService,
  kitsuApiService,
  mappingService
);

// IDs de prueba populares
const testCases = [
  { id: 'mal:5114', name: 'Attack on Titan (MAL)', expected: 'tt25622312' },
  { id: 'anilist:5114', name: 'Attack on Titan (AniList)', expected: 'tt25622312' },
  { id: 'anidb:4563', name: 'Attack on Titan (AniDB)', expected: 'tt25622312' },
  { id: 'kitsu:44042', name: 'Attack on Titan (Kitsu)', expected: 'tt25622312' },
  { id: 'tt25622312', name: 'Attack on Titan (IMDb)', expected: 'tt25622312' },
  
  { id: 'mal:38000', name: 'Demon Slayer (MAL)', expected: 'tt9335498' },
  { id: 'anilist:101922', name: 'Demon Slayer (AniList)', expected: 'tt9335498' },
  { id: 'anidb:13679', name: 'Demon Slayer (AniDB)', expected: 'tt9335498' },
  { id: 'kitsu:42929', name: 'Demon Slayer (Kitsu)', expected: 'tt9335498' },
  { id: 'tt9335498', name: 'Demon Slayer (IMDb)', expected: 'tt9335498' },
  
  { id: 'mal:40748', name: 'Jujutsu Kaisen (MAL)', expected: 'tt8176034' },
  { id: 'kitsu:39026', name: 'Jujutsu Kaisen (Kitsu)', expected: 'tt8176034' },
  { id: 'tt8176034', name: 'Jujutsu Kaisen (IMDb)', expected: 'tt8176034' },
  
  { id: 'mal:37510', name: 'Solo Leveling (MAL)', expected: 'tt21209876' },
  { id: 'kitsu:48671', name: 'Solo Leveling (Kitsu)', expected: 'tt21209876' },
  { id: 'tt21209876', name: 'Solo Leveling (IMDb)', expected: 'tt21209876' }
];

async function runTests() {
  console.log('🧪 Iniciando pruebas de mapeo de IDs...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      // Prueba con servicio de mapeo directo
      const directResult = mappingService.getImdbIdFromAny(testCase.id);
      
      // Prueba con servicio unificado
      const unifiedResult = await unifiedService.processContentId(testCase.id, 'imdb');
      
      console.log(`📋 Probando: ${testCase.name}`);
      console.log(`   ID: ${testCase.id}`);
      console.log(`   Esperado: ${testCase.expected}`);
      console.log(`   Directo: ${directResult}`);
      console.log(`   Unificado: ${unifiedResult.success ? unifiedResult.processedId : 'ERROR'}`);
      
      const directMatch = directResult === testCase.expected;
      const unifiedMatch = unifiedResult.success && unifiedResult.processedId === testCase.expected;
      
      if (directMatch && unifiedMatch) {
        console.log(`   ✅ PASADO`);
        passed++;
      } else {
        console.log(`   ❌ FALLADO`);
        failed++;
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      console.log('');
    }
  }
  
  console.log(`📊 Resultados:`);
  console.log(`   ✅ Pasados: ${passed}`);
  console.log(`   ❌ Fallados: ${failed}`);
  console.log(`   📈 Total: ${testCases.length}`);
  
  // Mostrar todos los mapeos disponibles
  console.log('\n📋 Todos los mapeos disponibles:');
  const allMappings = mappingService.getAllMappings();
  allMappings.forEach(mapping => {
    console.log(`   ${mapping.kitsuId} → ${mapping.imdbId} (${mapping.title})`);
  });
}

// Ejecutar pruebas
runTests().catch(console.error);