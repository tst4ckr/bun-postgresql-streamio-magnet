#!/usr/bin/env bun

/**
 * Script de prueba para verificar patrones regex
 */

function testRegexPatterns() {
  console.log('🔍 VERIFICACIÓN DE PATRONES REGEX');
  console.log('='.repeat(50));

  // Patrones definidos en IdDetectorService
  const patterns = {
    'mal': /^(?:mal:)?\d+$/,
    'mal_series': /^(?:mal:)?\d+:\d+:\d+$/,
    'anilist': /^(?:anilist:)?\d+$/,
    'anilist_series': /^(?:anilist:)?\d+:\d+:\d+$/,
    'anidb': /^(?:anidb:)?\d+$/,
    'anidb_series': /^(?:anidb:)?\d+:\d+:\d+$/
  };

  // IDs de prueba
  const testIds = [
    'mal:11061:1:1',
    'anilist:21087:1:1', 
    'anidb:8074:1:1',
    'mal:11061',
    'anilist:21087',
    'anidb:8074',
    '11061:1:1',  // Sin prefijo
    '21087:1:1',  // Sin prefijo
    '8074:1:1'    // Sin prefijo
  ];

  console.log('🧪 Probando patrones:');
  console.log('');

  for (const [patternName, regex] of Object.entries(patterns)) {
    console.log(`📋 Patrón: ${patternName}`);
    console.log(`   Regex: ${regex}`);
    
    for (const testId of testIds) {
      const matches = regex.test(testId);
      if (matches) {
        console.log(`   ✅ ${testId} -> COINCIDE`);
      }
    }
    console.log('');
  }

  console.log('🎯 Verificación específica de IDs problemáticos:');
  console.log('');
  
  const problemIds = ['mal:11061:1:1', 'anilist:21087:1:1', 'anidb:8074:1:1'];
  
  for (const id of problemIds) {
    console.log(`📺 ID: ${id}`);
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      if (regex.test(id)) {
        console.log(`   ✅ Coincide con patrón: ${patternName}`);
      }
    }
    console.log('');
  }
}

if (import.meta.main) {
  testRegexPatterns();
}