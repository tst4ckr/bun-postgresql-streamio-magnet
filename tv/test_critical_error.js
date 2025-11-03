/**
 * Script de prueba para validar fail-fast en errores críticos
 * Simula diferentes tipos de errores críticos para verificar que el sistema falla rápido
 */

import { StreamValidationService } from './src/infrastructure/services/StreamValidationService.js';
import { M3UParserService } from './src/infrastructure/parsers/M3UParserService.js';

// Mock de logger para las pruebas
const mockLogger = {
  info: (msg) => console.log(`[TEST-INFO] ${msg}`),
  error: (msg) => console.log(`[TEST-ERROR] ${msg}`),
  warn: (msg) => console.log(`[TEST-WARN] ${msg}`),
  debug: (msg) => console.log(`[TEST-DEBUG] ${msg}`),
  log: (msg) => console.log(`[TEST-LOG] ${msg}`)
};

/**
 * Prueba 1: Error crítico en StreamValidationService
 */
async function testCriticalStreamValidationError() {
  console.log('\n🧪 === PRUEBA 1: Error crítico en StreamValidationService ===');
  
  // Configuración que habilita la validación temprana
  const config = {
    validation: {
      enableEarlyValidation: true,  // Esta es la clave que faltaba
      enabled: true,
      timeout: 1000,
      concurrency: 2
    }
  };
  
  const service = new StreamValidationService(config, mockLogger);
  
  // Simular canales con URLs que causarán errores críticos
  const testChannels = [
    {
      id: 'test1',
      name: 'Canal Test 1',
      streamUrl: 'https://ENOTFOUND-critical-error.invalid/stream.m3u8',  // Cambiar url por streamUrl
      source: 'test'
    },
    {
      id: 'test2',
      name: 'Canal Test 2',
      streamUrl: 'https://certificate-critical-error.invalid/stream.m3u8',  // Cambiar url por streamUrl
      source: 'test'
    }
  ];

  try {
    console.log('⏳ Iniciando validación con errores críticos...');
    const result = await service.validateChannelsParallel(testChannels, { timeout: 1000 });
    console.log('❌ ERROR: El sistema NO falló rápido como esperado');
    console.log('Resultado:', result);
  } catch (error) {
    console.log('✅ ÉXITO: Sistema falló rápido correctamente');
    console.log('Error capturado:', error.message);
  }
}

/**
 * Prueba 2: Error crítico en M3UParserService
 */
async function testCriticalParsingError() {
  console.log('\n🧪 === PRUEBA 2: Error crítico en M3UParserService ===');
  
  const service = new M3UParserService();
  
  // Simular contenido M3U con formato corrupto crítico
  const corruptM3UContent = `
#EXTM3U
#EXTINF:-1 tvg-id="test" tvg-name="Test" group-title="Test",Test Channel
format-corrupt-critical-error
#EXTINF:-1 tvg-id="test2" tvg-name="Test2" group-title="Test",Test Channel 2
config-invalid-critical-error
`;

  try {
    console.log('⏳ Iniciando parsing con formato corrupto...');
    const result = await service.parse(corruptM3UContent, {});
    console.log('❌ ERROR: El parsing NO falló rápido como esperado');
    console.log('Resultado:', result);
  } catch (error) {
    console.log('✅ ÉXITO: Parsing falló rápido correctamente');
    console.log('Error capturado:', error.message);
  }
}

/**
 * Prueba 3: Error no crítico (debe continuar)
 */
async function testNonCriticalError() {
  console.log('\n🧪 === PRUEBA 3: Error no crítico (debe continuar) ===');
  
  // Configuración que habilita la validación temprana
  const config = {
    validation: {
      enableEarlyValidation: true,  // Esta es la clave que faltaba
      enabled: true,
      timeout: 1000,
      concurrency: 2
    }
  };
  
  const service = new StreamValidationService(config, mockLogger);
  
  // Simular canales con URLs que causarán errores no críticos
  const testChannels = [
    {
      id: 'test1',
      name: 'Canal Test 1',
      streamUrl: 'http://non-critical-timeout.example.com/stream.m3u8',  // Cambiar url por streamUrl
      source: 'test'
    },
    {
      id: 'test2',
      name: 'Canal Test 2', 
      streamUrl: 'http://working-url.example.com/stream.m3u8',  // Cambiar url por streamUrl
      source: 'test'
    }
  ];

  try {
    console.log('⏳ Iniciando validación con errores no críticos...');
    const result = await service.validateChannelsParallel(testChannels, { timeout: 1000 });
    console.log('✅ ÉXITO: Sistema continuó con errores no críticos');
    console.log('Canales válidos:', result.validChannels.length);
    console.log('Canales inválidos:', result.invalidChannels.length);
  } catch (error) {
    console.log('❌ ERROR: Sistema falló cuando debería continuar');
    console.log('Error:', error.message);
  }
}

/**
 * Ejecutar todas las pruebas
 */
async function runAllTests() {
  console.log('🚀 === INICIANDO PRUEBAS DE FAIL-FAST ===');
  
  try {
    await testCriticalStreamValidationError();
    await testCriticalParsingError();
    await testNonCriticalError();
    
    console.log('\n✅ === PRUEBAS COMPLETADAS ===');
    console.log('Revisa los resultados arriba para verificar el comportamiento de fail-fast');
    
  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
  }
}

// Ejecutar pruebas
runAllTests().catch(console.error);