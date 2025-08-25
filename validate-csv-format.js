/**
 * Script para validar el formato CSV corregido
 */

import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { readFileSync } from 'fs';

const logger = {
  info: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`)
};

function validateCsvFormat(filePath) {
  console.log(`\n📋 Validando formato CSV: ${filePath}`);
  console.log('-'.repeat(50));
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Validar header
    const header = lines[0];
    const expectedColumns = ['imdb_id', 'name', 'magnet', 'quality', 'size'];
    const actualColumns = header.split(',');
    
    console.log(`Header: ${header}`);
    
    if (actualColumns.length !== expectedColumns.length) {
      logger.error(`Número incorrecto de columnas. Esperado: ${expectedColumns.length}, Actual: ${actualColumns.length}`);
      return false;
    }
    
    // Validar cada línea de datos
    let validLines = 0;
    let invalidLines = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Contar comas fuera de comillas
      let commaCount = 0;
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '"') {
          inQuotes = !inQuotes;
        } else if (line[j] === ',' && !inQuotes) {
          commaCount++;
        }
      }
      
      if (commaCount === 4) { // 5 columnas = 4 comas
        validLines++;
        console.log(`✓ Línea ${i + 1}: Formato correcto`);
      } else {
        invalidLines++;
        logger.error(`Línea ${i + 1}: Formato incorrecto (${commaCount + 1} columnas)`);
        console.log(`   Contenido: ${line.substring(0, 100)}...`);
      }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   Líneas válidas: ${validLines}`);
    console.log(`   Líneas inválidas: ${invalidLines}`);
    console.log(`   Total de datos: ${lines.length - 1}`);
    
    return invalidLines === 0;
    
  } catch (error) {
    logger.error(`Error al leer archivo: ${error.message}`);
    return false;
  }
}

async function testCsvRepository(filePath) {
  console.log(`\n🔧 Probando CSVMagnetRepository con archivo corregido`);
  console.log('-'.repeat(50));
  
  try {
    const repository = new CSVMagnetRepository(filePath, logger);
    await repository.initialize();
    
    // Probar búsqueda
    const results = await repository.getMagnetsByImdbId('tt0111161');
    
    if (results && results.length > 0) {
      logger.info(`Repositorio funcional: ${results.length} resultados encontrados`);
      
      results.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.name} (${result.quality})`);
      });
      
      return true;
    } else {
      logger.warn('Repositorio no devolvió resultados');
      return false;
    }
    
  } catch (error) {
    logger.error(`Error en repositorio: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 VALIDACIÓN DE FORMATO CSV CORREGIDO\n');
  
  const torrentioPath = './data/torrentio.csv';
  const magnetsPath = './data/magnets.csv';
  
  // Validar formato de ambos archivos
  const torrentioValid = validateCsvFormat(torrentioPath);
  const magnetsValid = validateCsvFormat(magnetsPath);
  
  // Probar funcionalidad
  const torrentioWorks = await testCsvRepository(torrentioPath);
  const magnetsWorks = await testCsvRepository(magnetsPath);
  
  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN FINAL');
  console.log('='.repeat(60));
  
  if (torrentioValid && magnetsValid && torrentioWorks && magnetsWorks) {
    logger.info('✅ TODOS LOS ARCHIVOS CSV TIENEN FORMATO CORRECTO');
    console.log('\n🎯 El sistema está listo para usar con formato CSV consistente');
  } else {
    logger.error('❌ ALGUNOS ARCHIVOS TIENEN PROBLEMAS DE FORMATO');
    console.log('\n📝 Estado de archivos:');
    console.log(`   torrentio.csv - Formato: ${torrentioValid ? '✓' : '✗'}, Funcional: ${torrentioWorks ? '✓' : '✗'}`);
    console.log(`   magnets.csv - Formato: ${magnetsValid ? '✓' : '✗'}, Funcional: ${magnetsWorks ? '✓' : '✗'}`);
  }
}

main().catch(error => {
  console.error('\n❌ Error fatal:', error.message);
});