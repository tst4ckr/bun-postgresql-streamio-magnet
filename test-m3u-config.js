#!/usr/bin/env node

import { addonConfig } from './src/config/addonConfig.js';
import { M3UTvRepository } from './src/infrastructure/repositories/M3UTvRepository.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

console.log('🧪 Probando configuración M3U...\n');

// 1. Verificar configuración
console.log('1. Configuración M3U:');
console.log('   M3U_URL desde .env:', process.env.M3U_URL);
console.log('   m3uUrl resuelto:', addonConfig.repository.m3uUrl);

// 2. Verificar existencia del archivo
const m3uPath = addonConfig.repository.m3uUrl;
if (m3uPath) {
  const absolutePath = resolve(m3uPath);
  console.log('\n2. Ruta del archivo M3U:');
  console.log('   Ruta relativa:', m3uPath);
  console.log('   Ruta absoluta:', absolutePath);
  console.log('   Archivo existe:', existsSync(m3uPath));
  
  // 3. Intentar inicializar el repositorio
  console.log('\n3. Inicializando M3UTvRepository...');
  try {
    const logger = {
      info: (msg) => console.log(`   📋 ${msg}`),
      warn: (msg) => console.log(`   ⚠️  ${msg}`),
      error: (msg) => console.log(`   ❌ ${msg}`),
      debug: (msg) => console.log(`   🔍 ${msg}`)
    };
    
    const repository = new M3UTvRepository(m3uPath, addonConfig, logger);
    console.log('   ✅ Repositorio creado exitosamente');
    
    // 4. Obtener estadísticas
    const stats = repository.getStats();
    console.log('\n4. Estadísticas del repositorio:');
    console.log('   Canales cargados:', stats.totalChannels);
    console.log('   Última actualización:', stats.lastUpdated);
    console.log('   Estado del cache:', stats.cacheStatus);
    
  } catch (error) {
    console.log('   ❌ Error al inicializar repositorio:', error.message);
  }
} else {
  console.log('\n❌ No se configuró M3U_URL');
}

console.log('\n✅ Prueba completada');