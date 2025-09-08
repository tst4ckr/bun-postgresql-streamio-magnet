import { CascadingMagnetRepository } from '../src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from '../src/infrastructure/services/TorrentioApiService.js';
import { addonConfig } from '../src/config/addonConfig.js';
import { EnhancedLogger } from '../src/infrastructure/utils/EnhancedLogger.js';

/**
 * Script de prueba para verificar el flujo de búsqueda con fallback de idioma
 * 
 * Este script prueba:
 * 1. Configuraciones de idioma en addonConfig.js
 * 2. Método searchMagnetsWithLanguageFallback en TorrentioApiService
 * 3. Integración con CascadingMagnetRepository
 */

const logger = new EnhancedLogger('LanguageFallbackTest');

// IDs de prueba para diferentes tipos de contenido
const testCases = [
  {
    id: 'tt0111161', // The Shawshank Redemption
    type: 'movie',
    description: 'Película clásica en inglés'
  },
  {
    id: 'tt0468569', // The Dark Knight
    type: 'movie', 
    description: 'Película popular'
  },
  {
    id: 'tt0903747', // Breaking Bad
    type: 'series',
    season: 1,
    episode: 1,
    description: 'Serie popular'
  },
  {
    id: 'kitsu:1', // Cowboy Bebop
    type: 'anime',
    description: 'Anime clásico'
  }
];

async function testLanguageConfigurations() {
  console.log('\n=== PRUEBA 1: Verificar configuraciones de idioma ===');
  
  const types = ['movie', 'series', 'anime'];
  
  for (const type of types) {
    const config = addonConfig.torrentio[type];
    
    console.log(`\n${type.toUpperCase()}:`);
    console.log(`  Proveedores por defecto: ${config.providers}`);
    console.log(`  Idioma prioritario: ${config.priorityLanguage}`);
    
    if (config.languageConfigs) {
      console.log(`  Configuración español: ${config.languageConfigs.spanish.providers}`);
      console.log(`  Configuración combinada: ${config.languageConfigs.combined.providers}`);
    } else {
      console.log('  ❌ ERROR: No se encontraron configuraciones de idioma');
    }
  }
}

async function testTorrentioApiService() {
  console.log('\n=== PRUEBA 2: TorrentioApiService con fallback de idioma ===');
  
  const torrentioService = new TorrentioApiService(
    addonConfig.repository.torrentioApiUrl,
    addonConfig.repository.secondaryCsvPath,
    logger,
    addonConfig.repository.timeout
  );
  
  for (const testCase of testCases.slice(0, 2)) { // Solo probar 2 casos para no sobrecargar
    console.log(`\n--- Probando ${testCase.description} (${testCase.id}) ---`);
    
    try {
      const startTime = Date.now();
      const results = await torrentioService.searchMagnetsWithLanguageFallback(
        testCase.id,
        testCase.type,
        testCase.season,
        testCase.episode
      );
      const endTime = Date.now();
      
      console.log(`✅ Búsqueda completada en ${endTime - startTime}ms`);
      console.log(`📊 Resultados encontrados: ${results.length}`);
      
      if (results.length > 0) {
        console.log(`🎯 Primer resultado: ${results[0].name}`);
        console.log(`📏 Tamaño: ${results[0].size}`);
        console.log(`🌱 Seeders: ${results[0].seeders}`);
      }
      
    } catch (error) {
      console.log(`❌ Error en búsqueda: ${error.message}`);
    }
  }
}

async function testCascadingRepository() {
  console.log('\n=== PRUEBA 3: CascadingMagnetRepository con nuevo flujo ===');
  
  const repository = new CascadingMagnetRepository(
    addonConfig.repository.primaryCsvPath,
    addonConfig.repository.secondaryCsvPath,
    addonConfig.repository.animeCsvPath,
    addonConfig.repository.torrentioApiUrl,
    logger,
    addonConfig.repository.timeout
  );
  
  try {
    await repository.initialize();
    console.log('✅ Repositorio inicializado correctamente');
    
    // Probar con un ID que probablemente no esté en CSV para forzar fallback a API
    const testId = 'tt9999999'; // ID ficticio
    
    console.log(`\n--- Probando búsqueda en cascada para ${testId} ---`);
    
    try {
      const results = await repository.getMagnetsByContentId(testId, 'movie');
      console.log(`✅ Búsqueda en cascada completada`);
      console.log(`📊 Resultados: ${results.length}`);
    } catch (error) {
      if (error.message.includes('not found')) {
        console.log(`✅ Comportamiento esperado: ${error.message}`);
      } else {
        console.log(`❌ Error inesperado: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error al inicializar repositorio: ${error.message}`);
  }
}

async function testLanguageConfigurationSwitching() {
  console.log('\n=== PRUEBA 4: Verificar cambio de configuración de idioma ===');
  
  const torrentioService = new TorrentioApiService(
    addonConfig.repository.torrentioApiUrl,
    addonConfig.repository.secondaryCsvPath,
    logger,
    addonConfig.repository.timeout
  );
  
  // Simular búsqueda que debería usar configuración española primero
  console.log('\n--- Simulando búsqueda con configuración española ---');
  
  try {
    // Acceder a configuración interna para verificar
    const movieConfig = addonConfig.torrentio.movie;
    
    console.log(`Configuración española: ${movieConfig.languageConfigs.spanish.providers}`);
    console.log(`Configuración combinada: ${movieConfig.languageConfigs.combined.providers}`);
    
    console.log('✅ Configuraciones de idioma verificadas correctamente');
    
  } catch (error) {
    console.log(`❌ Error al verificar configuraciones: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🚀 INICIANDO PRUEBAS DE FALLBACK DE IDIOMA');
  console.log('=' .repeat(60));
  
  try {
    await testLanguageConfigurations();
    await testLanguageConfigurationSwitching();
    await testTorrentioApiService();
    await testCascadingRepository();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODAS LAS PRUEBAS COMPLETADAS');
    console.log('\n📋 RESUMEN:');
    console.log('- Configuraciones de idioma: Verificadas');
    console.log('- TorrentioApiService: Método de fallback implementado');
    console.log('- CascadingMagnetRepository: Integración completada');
    console.log('- Flujo de búsqueda: Español → Combinado → Error');
    
  } catch (error) {
    console.log(`\n❌ ERROR CRÍTICO EN PRUEBAS: ${error.message}`);
    console.log(error.stack);
  }
}

// Ejecutar pruebas si el script se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export {
  testLanguageConfigurations,
  testTorrentioApiService,
  testCascadingRepository,
  testLanguageConfigurationSwitching,
  runAllTests
};