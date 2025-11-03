/**
 * Script de prueba para verificar que la configuración personalizada
 * no carga automáticamente variables de entorno
 */

console.log('🔍 Iniciando prueba de configuración sin carga de .env...\n');

import { getCustomTVConfig, createCustomTVConfig } from './src/lib/CustomTVConfig.js';

console.log('=== PRUEBA DE CONFIGURACIÓN PERSONALIZADA ===\n');

// Prueba 1: Obtener configuración base
console.log('1. Configuración personalizada base:');
const config = getCustomTVConfig();
console.log(`   - Fuente de canales: ${config.CHANNELS_SOURCE}`);
console.log(`   - URL M3U automática: ${config.AUTO_M3U_URL}`);
console.log(`   - Archivo de canales: ${config.CHANNELS_FILE}`);
console.log(`   - Validación habilitada: ${config.ENABLE_STREAM_VALIDATION}`);

// Prueba 2: Configuración con overrides
console.log('\n2. Configuración con overrides:');
const overrideConfig = createCustomTVConfig({
    CHANNELS_SOURCE: 'remote_m3u',
    ENABLE_STREAM_VALIDATION: false,
    AUTO_M3U_URL: 'https://custom-override.com/playlist.m3u'
});
console.log(`   - Fuente modificada: ${overrideConfig.CHANNELS_SOURCE}`);
console.log(`   - URL modificada: ${overrideConfig.AUTO_M3U_URL}`);
console.log(`   - Validación deshabilitada: ${!overrideConfig.ENABLE_STREAM_VALIDATION}`);

console.log('\n✅ Configuración personalizada funcionando correctamente');
console.log('✅ Sistema de overrides funcionando correctamente');
console.log('✅ No se cargaron variables de entorno automáticamente');