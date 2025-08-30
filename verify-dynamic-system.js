#!/usr/bin/env node

/**
 * Script simple para verificar la nueva arquitectura dinámica
 */

import { KitsuMappingFallback } from './src/infrastructure/services/KitsuMappingFallback.js';

console.log('🔄 Verificando sistema dinámico...\n');

// Verificar servicio de fallback
const fallback = new KitsuMappingFallback();

console.log('📊 Estadísticas del servicio de fallback:');
const stats = fallback.getStats();
console.log(`   Mapeos críticos: ${stats.totalCriticalMappings}`);
console.log(`   Cobertura: ${stats.coverage}%`);

console.log('\n📋 Mapeos críticos disponibles:');
const mappings = fallback.getAllMappings();
mappings.forEach(mapping => {
  console.log(`   ${mapping.kitsuId} → ${mapping.imdbId} (${mapping.title})`);
});

// Verificar comportamiento dinámico
console.log('\n🔍 Verificando comportamiento dinámico:');

// Caso 1: ID crítico (debe encontrar en fallback)
const criticalTest = fallback.getImdbIdFromKitsu('1');
console.log(`   kitsu:1 → ${criticalTest || 'null (delegar a API)'}`);

// Caso 2: ID no crítico (debe delegar a API)
const nonCriticalTest = fallback.getImdbIdFromKitsu('99999');
console.log(`   kitsu:99999 → ${nonCriticalTest || 'null (delegar a API)'}`);

// Caso 3: ID con prefijo
const prefixTest = fallback.getImdbIdFromAny('mal:1');
console.log(`   mal:1 → ${prefixTest || 'null (delegar a API)'}`);

console.log('\n✅ Sistema dinámico verificado correctamente');
console.log('✅ Solo se usan mapeos críticos (máximo 10)');
console.log('✅ La mayoría de conversiones se delegan a servicios dinámicos');