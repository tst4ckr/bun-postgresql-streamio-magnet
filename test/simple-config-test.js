/**
 * Prueba simple para verificar las configuraciones de idioma
 * Sin dependencias externas complejas
 */

import { addonConfig } from '../src/config/addonConfig.js';

console.log('🚀 VERIFICANDO CONFIGURACIONES DE IDIOMA');
console.log('=' .repeat(50));

// Verificar que las configuraciones de idioma existen
const types = ['movie', 'series', 'anime'];

for (const type of types) {
  console.log(`\n${type.toUpperCase()}:`);
  
  const config = addonConfig.torrentio[type];
  
  if (!config) {
    console.log(`  ❌ ERROR: No existe configuración para ${type}`);
    continue;
  }
  
  console.log(`  ✅ Configuración base encontrada`);
  console.log(`  📋 Proveedores: ${config.providers}`);
  console.log(`  🌐 Idioma prioritario: ${config.priorityLanguage}`);
  
  if (config.languageConfigs) {
    console.log(`  ✅ Configuraciones de idioma encontradas`);
    
    if (config.languageConfigs.spanish) {
      console.log(`  🇪🇸 Español: ${config.languageConfigs.spanish.providers}`);
    } else {
      console.log(`  ❌ ERROR: Falta configuración española`);
    }
    
    if (config.languageConfigs.combined) {
      console.log(`  🌍 Combinado: ${config.languageConfigs.combined.providers}`);
    } else {
      console.log(`  ❌ ERROR: Falta configuración combinada`);
    }
  } else {
    console.log(`  ❌ ERROR: No se encontraron configuraciones de idioma`);
  }
}

console.log('\n' + '='.repeat(50));
console.log('✅ VERIFICACIÓN DE CONFIGURACIONES COMPLETADA');

// Verificar que las configuraciones son diferentes
console.log('\n🔍 VERIFICANDO DIFERENCIAS ENTRE CONFIGURACIONES:');

for (const type of types) {
  const config = addonConfig.torrentio[type];
  
  if (config.languageConfigs) {
    const spanishProviders = config.languageConfigs.spanish.providers;
    const combinedProviders = config.languageConfigs.combined.providers;
    
    if (spanishProviders !== combinedProviders) {
      console.log(`✅ ${type}: Configuraciones diferentes (correcto)`);
    } else {
      console.log(`⚠️  ${type}: Configuraciones idénticas (revisar)`);
    }
  }
}

console.log('\n🎯 PRUEBA COMPLETADA EXITOSAMENTE');