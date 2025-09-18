#!/usr/bin/env node
/**
 * Script para corregir automáticamente las llamadas incorrectas de logger en todo el proyecto
 * Convierte this.#logger.info/warn/error/debug() a this.#logger.log(level, message, options)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PROJECT_ROOT = __dirname;
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'logger_backup');

// Patrones de regex para detectar llamadas incorrectas
const LOGGER_PATTERNS = {
  info: /this\.#logger\.info\(([^)]+)\)/g,
  warn: /this\.#logger\.warn\(([^)]+)\)/g,
  error: /this\.#logger\.error\(([^)]+)\)/g,
  debug: /this\.#logger\.debug\(([^)]+)\)/g
};

// Estadísticas
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  replacements: {
    info: 0,
    warn: 0,
    error: 0,
    debug: 0
  },
  errors: []
};

/**
 * Crea directorio de backup si no existe
 */
function createBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 Directorio de backup creado: ${BACKUP_DIR}`);
  }
}

/**
 * Crea backup de un archivo
 */
function createBackup(filePath) {
  try {
    const relativePath = path.relative(PROJECT_ROOT, filePath);
    const backupPath = path.join(BACKUP_DIR, relativePath);
    const backupDir = path.dirname(backupPath);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.copyFileSync(filePath, backupPath);
    return true;
  } catch (error) {
    console.error(`❌ Error creando backup para ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Analiza los argumentos de una llamada de logger para extraer componente
 */
function parseLoggerArgs(argsString) {
  // Limpiar espacios y saltos de línea
  const cleanArgs = argsString.trim().replace(/\s+/g, ' ');
  
  // Buscar si hay un objeto con component al final
  const componentMatch = cleanArgs.match(/,\s*\{[^}]*component\s*:\s*['"]([^'"]+)['"][^}]*\}\s*$/);
  
  if (componentMatch) {
    // Extraer mensaje sin el objeto component
    const message = cleanArgs.replace(/,\s*\{[^}]*component\s*:[^}]*\}\s*$/, '').trim();
    const component = componentMatch[1];
    return { message, component };
  }
  
  // Si no hay component, devolver solo el mensaje
  return { message: cleanArgs, component: null };
}

/**
 * Convierte una llamada de logger incorrecta a la forma correcta
 */
function convertLoggerCall(level, argsString) {
  const { message, component } = parseLoggerArgs(argsString);
  
  if (component) {
    return `this.#logger.log('${level}', ${message}, { component: '${component}' })`;
  } else {
    return `this.#logger.log('${level}', ${message})`;
  }
}

/**
 * Procesa el contenido de un archivo y reemplaza las llamadas incorrectas
 */
function processFileContent(content, filePath) {
  let modifiedContent = content;
  let hasChanges = false;
  
  // Procesar cada tipo de logger
  for (const [level, pattern] of Object.entries(LOGGER_PATTERNS)) {
    const matches = [...content.matchAll(pattern)];
    
    if (matches.length > 0) {
      console.log(`  🔧 Encontradas ${matches.length} llamadas ${level}() en ${path.basename(filePath)}`);
      
      for (const match of matches) {
        const originalCall = match[0];
        const argsString = match[1];
        const convertedCall = convertLoggerCall(level, argsString);
        
        modifiedContent = modifiedContent.replace(originalCall, convertedCall);
        stats.replacements[level]++;
        hasChanges = true;
        
        console.log(`    ✅ ${originalCall} → ${convertedCall}`);
      }
    }
  }
  
  return { content: modifiedContent, hasChanges };
}

/**
 * Procesa un archivo individual
 */
function processFile(filePath) {
  try {
    stats.filesProcessed++;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const { content: modifiedContent, hasChanges } = processFileContent(content, filePath);
    
    if (hasChanges) {
      // Crear backup antes de modificar
      if (!createBackup(filePath)) {
        stats.errors.push(`No se pudo crear backup para ${filePath}`);
        return;
      }
      
      // Escribir archivo modificado
      fs.writeFileSync(filePath, modifiedContent, 'utf8');
      stats.filesModified++;
      
      console.log(`✅ Archivo modificado: ${path.relative(PROJECT_ROOT, filePath)}`);
    }
    
  } catch (error) {
    const errorMsg = `Error procesando ${filePath}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    stats.errors.push(errorMsg);
  }
}

/**
 * Busca recursivamente archivos .js en un directorio
 */
function findJSFiles(dir) {
  const files = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Ignorar node_modules y otros directorios irrelevantes
        if (!['node_modules', '.git', 'logger_backup'].includes(entry.name)) {
          files.push(...findJSFiles(fullPath));
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error leyendo directorio ${dir}:`, error.message);
  }
  
  return files;
}

/**
 * Muestra estadísticas finales
 */
function showStats() {
  console.log('\n📊 ESTADÍSTICAS FINALES:');
  console.log('========================');
  console.log(`📁 Archivos procesados: ${stats.filesProcessed}`);
  console.log(`✏️  Archivos modificados: ${stats.filesModified}`);
  console.log('\n🔧 Reemplazos por tipo:');
  
  const totalReplacements = Object.values(stats.replacements).reduce((a, b) => a + b, 0);
  
  for (const [level, count] of Object.entries(stats.replacements)) {
    if (count > 0) {
      console.log(`   ${level}(): ${count}`);
    }
  }
  
  console.log(`\n🎯 Total de reemplazos: ${totalReplacements}`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ ERRORES:');
    stats.errors.forEach(error => console.log(`   ${error}`));
  }
  
  if (stats.filesModified > 0) {
    console.log(`\n💾 Backups guardados en: ${BACKUP_DIR}`);
    console.log('\n✅ ¡Corrección de logger completada exitosamente!');
  } else {
    console.log('\n✅ No se encontraron llamadas incorrectas de logger.');
  }
}

/**
 * Función principal
 */
function main() {
  console.log('🚀 Iniciando corrección automática de llamadas de logger...');
  console.log(`📂 Directorio fuente: ${SRC_DIR}`);
  
  // Verificar que existe el directorio src
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ No se encontró el directorio src: ${SRC_DIR}`);
    process.exit(1);
  }
  
  // Crear directorio de backup
  createBackupDir();
  
  // Buscar todos los archivos .js
  console.log('\n🔍 Buscando archivos JavaScript...');
  const jsFiles = findJSFiles(SRC_DIR);
  
  if (jsFiles.length === 0) {
    console.log('❌ No se encontraron archivos JavaScript en el directorio src.');
    return;
  }
  
  console.log(`📄 Encontrados ${jsFiles.length} archivos JavaScript\n`);
  
  // Procesar cada archivo
  for (const filePath of jsFiles) {
    console.log(`🔍 Procesando: ${path.relative(PROJECT_ROOT, filePath)}`);
    processFile(filePath);
  }
  
  // Mostrar estadísticas
  showStats();
}

// Ejecutar script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, processFileContent, convertLoggerCall };