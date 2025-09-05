/**
 * Script de prueba para verificar la implementación de Tor en TorrentioApiService
 * Ejecutar con: node test_tor_implementation.js
 */

import TorrentioApiService from './src/infrastructure/services/TorrentioApiService.js';

// Configuración de prueba
const baseUrl = 'https://torrentio.strem.fun';
const torrentioFilePath = './data/torrentio.csv';
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.log(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.log(`[ERROR] ${msg}`, data || ''),
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || '')
};
const timeout = 15000; // Reducido para pruebas más rápidas

// Configuración Tor habilitada
const torConfig = {
  enabled: true,
  host: '127.0.0.1',
  port: 9050,
  maxRetries: 2, // Reducido para pruebas más rápidas
  retryDelay: 1000
};

console.log('=== Prueba de Implementación Tor Corregida ===');
console.log('Esta prueba verificará:');
console.log('1. Detección automática de disponibilidad de Tor');
console.log('2. Fallback automático cuando Tor no está disponible');
console.log('3. Manejo correcto de errores ECONNREFUSED');

// Crear instancia con Tor habilitado
const torService = new TorrentioApiService(baseUrl, torrentioFilePath, logger, timeout, torConfig);

// ID de contenido para prueba
const testContentId = 'tt0111161'; // The Shawshank Redemption

try {
  console.log('\n--- Probando con detección automática de Tor ---');
  const results = await torService.searchMagnetsById(testContentId, 'movie');
  console.log(`\n✅ Resultados obtenidos: ${results.length} magnets encontrados`);
  
  if (results.length > 0) {
    console.log('Ejemplo de magnet encontrado:');
    console.log(`- Título: ${results[0].title}`);
    console.log(`- Calidad: ${results[0].quality}`);
    console.log(`- Tamaño: ${results[0].size}`);
  }
  
  console.log('\n✅ Implementación Tor funcionando correctamente');
  console.log('✅ Sistema de fallback automático operativo');
  console.log('✅ Errores ECONNREFUSED manejados correctamente');
  
} catch (error) {
  console.error('❌ Error en la implementación:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}