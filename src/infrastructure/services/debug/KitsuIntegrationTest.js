/**
 * Test de integración para verificar el flujo completo con IDs de Kitsu
 * Identifica puntos exactos de fallo en la conversión de Kitsu a IMDb
 */

import { unifiedIdService } from '../UnifiedIdService.js';
import { CascadingMagnetRepository } from '../../repositories/CascadingMagnetRepository.js';
import { addonConfig } from '../../../config/addonConfig.js';

class KitsuIntegrationTest {
  constructor() {
    this.logger = {
      info: (msg, ...args) => console.log(`[TEST] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[TEST ERROR] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[TEST WARN] ${msg}`, ...args)
    };
  }

  async runFullFlowTest() {
    console.log('🧪 Iniciando test de integración Kitsu...\n');

    // IDs de prueba conocidos
    const testCases = [
      { kitsuId: '48671', expectedImdb: 'tt21209876', name: 'Solo Leveling' },
      { kitsuId: '44042', expectedImdb: 'tt0944947', name: 'Attack on Titan' },
      { kitsuId: '1', expectedImdb: null, name: 'Test inválido' }
    ];

    for (const testCase of testCases) {
      console.log(`\n📋 Testing: ${testCase.name} (${testCase.kitsuId})`);
      
      try {
        // Paso 1: Verificar detección de ID
        console.log('  1️⃣ Detectando tipo de ID...');
        const detection = unifiedIdService.detectorService.detectIdType(testCase.kitsuId);
        console.log(`     Resultado: ${JSON.stringify(detection, null, 2)}`);

        if (!detection.isValid) {
          console.log('     ❌ ID inválido detectado');
          continue;
        }

        // Paso 2: Verificar conversión
        console.log('  2️⃣ Procesando conversión...');
        const conversion = await unifiedIdService.processContentId(testCase.kitsuId, 'imdb');
        console.log(`     Resultado: ${JSON.stringify(conversion, null, 2)}`);

        if (!conversion.success) {
          console.log('     ❌ Conversión fallida');
          continue;
        }

        // Paso 3: Verificar búsqueda en repositorio
        console.log('  3️⃣ Buscando magnets...');
        const repository = new CascadingMagnetRepository(
          addonConfig.repository.primaryCsvPath,
          addonConfig.repository.secondaryCsvPath,
          addonConfig.repository.torrentioApiUrl,
          this.logger,
          addonConfig.repository.timeout,
          unifiedIdService
        );

        await repository.initialize();
        const magnets = await repository.getMagnetsByContentId(testCase.kitsuId, 'anime');
        console.log(`     Resultado: ${magnets?.length || 0} magnets encontrados`);

        // Paso 4: Verificar mapeo en fallback
        console.log('  4️⃣ Verificando mapeo en fallback...');
        const mapping = unifiedIdService.fallbackService.getMapping(testCase.kitsuId);
        console.log(`     Mapeo encontrado: ${mapping || 'No encontrado'}`);

      } catch (error) {
        console.error(`  ❌ Error en test: ${error.message}`);
        console.error(`     Stack: ${error.stack}`);
      }
    }
  }

  async testApiEndpoints() {
    console.log('\n🔗 Testing endpoints de API...');

    const baseUrl = 'http://127.0.0.1:3004';
    const testEndpoints = [
      '/health',
      '/mappings',
      '/mapping/48671',
      '/search?title=solo leveling'
    ];

    for (const endpoint of testEndpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`);
        const data = await response.json();
        console.log(`  ✅ ${endpoint}: ${response.status} - ${JSON.stringify(data).substring(0, 100)}...`);
      } catch (error) {
        console.error(`  ❌ ${endpoint}: ${error.message}`);
      }
    }
  }

  async runAllTests() {
    console.log('🎯 Test de integración Kitsu iniciado');
    console.log('='.repeat(50));

    await this.runFullFlowTest();
    await this.testApiEndpoints();

    console.log('\n✅ Test completado');
    console.log('='.repeat(50));
  }
}

// Ejecutar si se llama directamente
if (import.meta.main) {
  const test = new KitsuIntegrationTest();
  await test.runAllTests();
}

export { KitsuIntegrationTest };