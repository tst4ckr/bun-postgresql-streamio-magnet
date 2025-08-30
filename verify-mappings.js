/**
 * Script para verificar mapeos de Kitsu → IMDb
 * Prueba varios animes populares para confirmar que los mapeos funcionan
 */

import { kitsuMappingFallback } from './src/infrastructure/services/KitsuMappingFallback.js';

console.log('🔍 Verificando mapeos de Kitsu → IMDb\n');

// Obtener estadísticas
const stats = kitsuMappingFallback.getStats();
console.log('📊 Estadísticas de mapeos:');
console.log(`   Total de mapeos: ${stats.totalMappings}`);
console.log(`   Con metadatos: ${stats.withMetadata}`);
console.log(`   Cobertura: ${stats.coverage}%\n`);

// Probar algunos mapeos específicos
const testIds = ['1', '7442', '1376', '11469', '41370'];

console.log('🎯 Probando mapeos específicos:');
for (const kitsuId of testIds) {
  const imdbId = kitsuMappingFallback.getImdbIdFromKitsu(kitsuId);
  const metadata = kitsuMappingFallback.getAnimeMetadata(kitsuId);
  
  if (imdbId) {
    console.log(`   ✅ kitsu:${kitsuId} → ${imdbId} (${metadata?.title || 'Sin título'})`);
  } else {
    console.log(`   ❌ kitsu:${kitsuId} → No encontrado`);
  }
}

// Buscar por título
console.log('\n🔎 Búsqueda por título "cowboy":');
const cowboyResults = kitsuMappingFallback.searchByTitle('cowboy');
cowboyResults.forEach(result => {
  console.log(`   📺 ${result.title} (${result.kitsuId} → ${result.imdbId})`);
});

// Mostrar todos los mapeos disponibles
console.log('\n📋 Todos los mapeos disponibles:');
const allMappings = kitsuMappingFallback.getAllMappings();
allMappings.slice(0, 10).forEach(mapping => {
  console.log(`   📺 ${mapping.title} (${mapping.year}) - ${mapping.kitsuId} → ${mapping.imdbId}`);
});

if (allMappings.length > 10) {
  console.log(`   ... y ${allMappings.length - 10} más`);
}

console.log('\n✨ Verificación completada');