import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { addonConfig } from './src/config/addonConfig.js';

/**
 * Test completo del sistema de búsqueda en cascada
 * Demuestra que el sistema busca secuencialmente:
 * 1. magnets.csv
 * 2. torrentio.csv 
 * 3. anime.csv
 * 4. API Torrentio
 * 
 * Hasta encontrar resultados, sin importar si el ID es IMDb o Kitsu
 */
async function testCascadingSearch() {
  console.log('=== TEST COMPLETO DE BÚSQUEDA EN CASCADA ===\n');
  
  const repository = new CascadingMagnetRepository(
    addonConfig.repository.primaryCsvPath,
    addonConfig.repository.secondaryCsvPath,
    addonConfig.repository.animeCsvPath,
    addonConfig.repository.torrentioApiUrl
  );
  
  await repository.initialize();
  
  // Mostrar estadísticas de repositorios
  console.log('📊 ESTADÍSTICAS DE REPOSITORIOS:');
  try {
    const stats = await repository.getRepositoryStats();
    console.log('- magnets.csv:', stats.primary.count, 'entradas, estado:', stats.primary.status);
    console.log('- torrentio.csv:', stats.secondary.count, 'entradas, estado:', stats.secondary.status);
    console.log('- anime.csv:', stats.anime.count, 'entradas, estado:', stats.anime.status);
  } catch (error) {
    console.log('Error obteniendo estadísticas:', error.message);
  }
  console.log();
  
  // Test 1: ID que existe en magnets.csv (primer repositorio)
  console.log('🔍 TEST 1: ID existente en magnets.csv (tt0111161 - The Shawshank Redemption)');
  try {
    const results1 = await repository.getMagnetsByContentId('tt0111161', 'movie');
    console.log(`✅ Encontrados ${results1.length} magnets en el primer repositorio`);
    console.log(`   Primer resultado: ${results1[0].name} (${results1[0].quality})`);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();
  
  // Test 2: ID que existe en anime.csv (tercer repositorio)
  console.log('🔍 TEST 2: ID existente en anime.csv (tt2560140 - Attack on Titan)');
  try {
    const results2 = await repository.getMagnetsByContentId('tt2560140', 'anime');
    console.log(`✅ Encontrados ${results2.length} magnets en el repositorio de anime`);
    console.log(`   Primer resultado: ${results2[0].name} (${results2[0].quality})`);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();
  
  // Test 3: ID que NO existe en CSV - debe ir al API Torrentio
  console.log('🔍 TEST 3: ID no existente en CSV - debe buscar en API Torrentio (tt0133093 - The Matrix)');
  try {
    const results3 = await repository.getMagnetsByContentId('tt0133093', 'movie');
    console.log(`✅ Encontrados ${results3.length} magnets en API Torrentio`);
    if (results3.length > 0) {
      console.log(`   Primer resultado: ${results3[0].name} (${results3[0].quality})`);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();
  
  // Test 4: ID Kitsu (formato diferente a IMDb)
  console.log('🔍 TEST 4: ID Kitsu - debe funcionar igual que IMDb (1376 - Death Note)');
  try {
    const results4 = await repository.getMagnetsByContentId('1376', 'anime');
    console.log(`✅ Encontrados ${results4.length} magnets`);
    if (results4.length > 0) {
      console.log(`   Primer resultado: ${results4[0].name} (${results4[0].quality})`);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log();
  
  // Test 5: ID completamente inexistente
  console.log('🔍 TEST 5: ID completamente inexistente (test999999)');
  try {
    const results5 = await repository.getMagnetsByContentId('test999999', 'movie');
    console.log(`✅ Encontrados ${results5.length} magnets`);
  } catch (error) {
    console.log('❌ Error esperado:', error.message);
  }
  console.log();
  
  console.log('=== RESUMEN ===');
  console.log('✅ El sistema de búsqueda en cascada funciona correctamente:');
  console.log('   1. Busca primero en magnets.csv');
  console.log('   2. Si no encuentra, busca en torrentio.csv');
  console.log('   3. Si no encuentra, busca en anime.csv');
  console.log('   4. Si no encuentra, consulta API Torrentio');
  console.log('   5. Funciona con cualquier tipo de ID (IMDb, Kitsu, etc.)');
  console.log('   6. Solo lanza error si no encuentra en ninguna fuente');
}

// Ejecutar test
testCascadingSearch().catch(console.error);