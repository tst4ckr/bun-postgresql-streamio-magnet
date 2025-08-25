#!/usr/bin/env node

import { TorrentSearchApp } from './src/infrastructure/app/TorrentSearchApp.js';
import { getConfig } from './src/infrastructure/config/TorrentSearchConfig.js';

/**
 * @fileoverview Punto de entrada principal de la aplicación Torrent Search
 * Compatible con Stremio Addon SDK
 */

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🎬 Iniciando Stremio Torrent Search Addon...');
    console.log('📅 Versión:', process.env.npm_package_version || '1.0.0');
    console.log('🟢 Node.js:', process.version);
    console.log('🏗️  Entorno:', process.env.NODE_ENV || 'development');
    console.log('');
    
    // Crear y inicializar la aplicación
    const app = new TorrentSearchApp();
    
    // Iniciar el servidor
    await app.start();
    
    // Mostrar información de uso
    showUsageInfo();
    
  } catch (error) {
    console.error('❌ Error fatal al iniciar la aplicación:', error);
    process.exit(1);
  }
}

/**
 * Muestra información de uso
 */
function showUsageInfo() {
  const config = getConfig();
  const host = config.get('server.host');
  const port = config.get('server.port');
  const baseUrl = `http://${host}:${port}`;
  
  console.log('\n🎯 URLs importantes:');
  console.log(`   📋 Manifiesto Stremio: ${baseUrl}/manifest.json`);
  console.log(`   🔍 Búsqueda de streams: ${baseUrl}/stream/{type}/{imdb_id}.json`);
  console.log(`   🌐 API de búsqueda: ${baseUrl}/api/search?term={query}`);
  console.log(`   📊 Estadísticas: ${baseUrl}/api/providers/stats`);
  console.log(`   ❤️  Health Check: ${baseUrl}/api/health`);
  console.log('');
  
  console.log('🎬 Para usar con Stremio:');
  console.log(`   1. Abre Stremio`);
  console.log(`   2. Ve a Addons > Community Addons`);
  console.log(`   3. Pega esta URL: ${baseUrl}/manifest.json`);
  console.log(`   4. Haz clic en "Install"`);
  console.log('');
  
  console.log('🔧 Variables de entorno importantes:');
  console.log('   - PORT: Puerto del servidor (default: 3000)');
  console.log('   - HOST: Host del servidor (default: localhost)');
  console.log('   - CACHE_ENABLED: Habilitar cache (default: true)');
  console.log('   - CACHE_MAX_MEMORY_MB: Memoria máxima para cache (default: 128)');
  console.log('   - SEARCH_MAX_RESULTS: Resultados máximos por búsqueda (default: 50)');
  console.log('   - Todos los proveedores han sido eliminados');
  console.log('');
  
  console.log('✅ Aplicación lista para recibir peticiones!');
}

/**
 * Manejo de errores no capturados
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  console.error('En promesa:', promise);
  process.exit(1);
});

// Ejecutar la aplicación
main().catch((error) => {
  console.error('❌ Error en función main:', error);
  process.exit(1);
});