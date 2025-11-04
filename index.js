#!/usr/bin/env node

import { MagnetAddon } from './src/index.js';

/**
 * @fileoverview Punto de entrada principal simplificado para Stremio Magnet Addon
 * Usa únicamente Stremio SDK nativo sin Express
 */

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🎬 Iniciando Stremio Magnet Search Addon...');
    console.log('📅 Versión:', process.env.npm_package_version || '1.0.0');
    console.log('🟢 Runtime:', process.version);
    console.log('🏗️  Entorno:', process.env.NODE_ENV || 'development');
    console.log('');
    
    // Crear y inicializar el addon
    const addon = new MagnetAddon();
    
    // Iniciar el servidor
    await addon.start();
    
  } catch (error) {
    console.error('❌ Error fatal al iniciar la aplicación:', error);
    process.exit(1);
  }
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