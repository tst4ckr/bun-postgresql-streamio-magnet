#!/usr/bin/env node
/**
 * @fileoverview Script principal para análisis y corrección de referencias
 * Proporciona interfaz unificada para detectar y corregir problemas de referencias
 */

import { ReferenceAnalyzer } from './analyze-references.js';
import { ReferenceFixer } from './fix-references.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReferenceChecker {
  constructor(projectRoot = __dirname) {
    this.projectRoot = projectRoot;
    this.analyzer = new ReferenceAnalyzer(projectRoot);
    this.fixer = new ReferenceFixer(projectRoot);
  }

  /**
   * Muestra ayuda del comando
   */
  showHelp() {
    console.log(`
🔍 Reference Checker - Analizador y Corrector de Referencias
`);
    console.log('Uso:');
    console.log('  node reference-checker.js [comando] [opciones]\n');
    console.log('Comandos:');
    console.log('  analyze, -a    Solo analizar referencias (sin correcciones)');
    console.log('  fix, -f        Analizar y corregir automáticamente');
    console.log('  help, -h       Mostrar esta ayuda\n');
    console.log('Opciones:');
    console.log('  --dry-run      Mostrar qué se corregiría sin aplicar cambios');
    console.log('  --verbose      Mostrar información detallada');
    console.log('  --report-only  Solo generar reportes sin mostrar en consola\n');
    console.log('Ejemplos:');
    console.log('  node reference-checker.js analyze');
    console.log('  node reference-checker.js fix --dry-run');
    console.log('  node reference-checker.js fix --verbose\n');
  }

  /**
   * Ejecuta solo análisis
   */
  async runAnalysis(options = {}) {
    console.log('🔍 Ejecutando análisis de referencias...');
    
    try {
      await this.analyzer.analyze();
      
      if (options.verbose) {
        this.showDetailedAnalysis();
      }
      
      return {
        success: true,
        errors: this.analyzer.errors.length,
        warnings: this.analyzer.warnings.length,
        stats: this.analyzer.stats
      };
    } catch (error) {
      console.error('❌ Error durante el análisis:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ejecuta análisis y corrección
   */
  async runFix(options = {}) {
    console.log('🔧 Ejecutando análisis y corrección de referencias...');
    
    try {
      if (options.dryRun) {
        console.log('🔍 Modo dry-run: analizando sin aplicar cambios...');
        await this.analyzer.analyze();
        await this.simulateFixes();
      } else {
        await this.fixer.fix();
      }
      
      return {
        success: true,
        fixes: options.dryRun ? 0 : this.fixer.fixes.length
      };
    } catch (error) {
      console.error('❌ Error durante la corrección:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Simula las correcciones que se aplicarían
   */
  async simulateFixes() {
    console.log('\n🔮 SIMULACIÓN DE CORRECCIONES');
    console.log('=' .repeat(40));
    
    const potentialFixes = [];
    
    // Simular correcciones de imports
    for (const error of this.analyzer.errors) {
      if (error.message.includes('Import no resuelto')) {
        potentialFixes.push({
          type: 'import_path',
          file: error.file,
          description: `Corregir ruta de import en ${error.file}`
        });
      } else if (error.message.includes('no encontrado en')) {
        potentialFixes.push({
          type: 'import_item',
          file: error.file,
          description: `Corregir item de import en ${error.file}`
        });
      } else if (error.message.includes('Método privado')) {
        potentialFixes.push({
          type: 'method_reference',
          file: error.file,
          description: `Corregir referencia a método en ${error.file}`
        });
      }
    }
    
    // Simular optimizaciones
    for (const [filePath, fileInfo] of this.analyzer.files) {
      // Simular eliminación de imports no utilizados
      const unusedImports = this.findPotentialUnusedImports(fileInfo);
      if (unusedImports.length > 0) {
        potentialFixes.push({
          type: 'unused_imports',
          file: fileInfo.relativePath,
          description: `Eliminar ${unusedImports.length} imports no utilizados`
        });
      }
      
      // Simular exports faltantes
      const missingExports = this.findPotentialMissingExports(fileInfo);
      if (missingExports.length > 0) {
        potentialFixes.push({
          type: 'missing_exports',
          file: fileInfo.relativePath,
          description: `Añadir ${missingExports.length} exports faltantes`
        });
      }
    }
    
    if (potentialFixes.length === 0) {
      console.log('✅ No se detectaron correcciones necesarias.');
      return;
    }
    
    console.log(`\n🔧 Se aplicarían ${potentialFixes.length} correcciones:\n`);
    
    // Agrupar por tipo
    const fixesByType = new Map();
    for (const fix of potentialFixes) {
      if (!fixesByType.has(fix.type)) {
        fixesByType.set(fix.type, []);
      }
      fixesByType.get(fix.type).push(fix);
    }
    
    const typeNames = {
      import_path: '📁 Correcciones de rutas de import',
      import_item: '📦 Correcciones de items de import',
      method_reference: '🔗 Correcciones de referencias a métodos',
      unused_imports: '🧹 Eliminación de imports no utilizados',
      missing_exports: '📤 Adición de exports faltantes'
    };
    
    for (const [type, fixes] of fixesByType) {
      console.log(`${typeNames[type] || type}:`);
      fixes.forEach((fix, index) => {
        console.log(`  ${index + 1}. ${fix.description}`);
      });
      console.log('');
    }
    
    console.log('💡 Para aplicar estas correcciones, ejecuta:');
    console.log('   node reference-checker.js fix\n');
  }

  /**
   * Encuentra imports potencialmente no utilizados
   */
  findPotentialUnusedImports(fileInfo) {
    const unused = [];
    
    for (const importInfo of fileInfo.imports) {
      for (const item of importInfo.items) {
        const cleanItem = item.replace(/\s+as\s+(.+)/, '$1').trim();
        
        // Verificación simple: si el item aparece pocas veces en el contenido
        const usageCount = (fileInfo.content.match(new RegExp(`\\b${cleanItem}\\b`, 'g')) || []).length;
        
        if (usageCount <= 1) {
          unused.push(cleanItem);
        }
      }
    }
    
    return unused;
  }

  /**
   * Encuentra exports potencialmente faltantes
   */
  findPotentialMissingExports(fileInfo) {
    const missing = [];
    const exportedNames = new Set(Array.from(fileInfo.exports).map(exp => exp.name));
    
    // Verificar clases y funciones no exportadas
    fileInfo.classes.forEach(cls => {
      if (!exportedNames.has(cls.name) && !cls.name.startsWith('_')) {
        missing.push(cls.name);
      }
    });
    
    fileInfo.functions.forEach(fn => {
      if (!exportedNames.has(fn.name) && !fn.name.startsWith('_')) {
        missing.push(fn.name);
      }
    });
    
    return missing;
  }

  /**
   * Muestra análisis detallado
   */
  showDetailedAnalysis() {
    console.log('\n📊 ANÁLISIS DETALLADO');
    console.log('=' .repeat(30));
    
    // Estadísticas por archivo
    console.log('\n📄 Estadísticas por archivo:');
    for (const [filePath, fileInfo] of this.analyzer.files) {
      console.log(`\n  ${fileInfo.relativePath}:`);
      console.log(`    • Imports: ${fileInfo.imports.size}`);
      console.log(`    • Exports: ${fileInfo.exports.size}`);
      console.log(`    • Clases: ${fileInfo.classes.size}`);
      console.log(`    • Funciones: ${fileInfo.functions.size}`);
      console.log(`    • Métodos: ${fileInfo.methods.size}`);
    }
    
    // Top archivos con más dependencias
    console.log('\n🔗 Archivos con más imports:');
    const filesByImports = Array.from(this.analyzer.files.values())
      .sort((a, b) => b.imports.size - a.imports.size)
      .slice(0, 5);
    
    filesByImports.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.relativePath} (${file.imports.size} imports)`);
    });
    
    // Top archivos con más exports
    console.log('\n📤 Archivos con más exports:');
    const filesByExports = Array.from(this.analyzer.files.values())
      .sort((a, b) => b.exports.size - a.exports.size)
      .slice(0, 5);
    
    filesByExports.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.relativePath} (${file.exports.size} exports)`);
    });
  }

  /**
   * Parsea argumentos de línea de comandos
   */
  parseArgs(args) {
    const command = args[2] || 'help';
    const options = {
      dryRun: args.includes('--dry-run'),
      verbose: args.includes('--verbose'),
      reportOnly: args.includes('--report-only')
    };
    
    return { command, options };
  }

  /**
   * Ejecuta el comando principal
   */
  async run(args = process.argv) {
    const { command, options } = this.parseArgs(args);
    
    if (!options.reportOnly) {
      console.log('🔍 Reference Checker v1.0.0');
      console.log(`📁 Proyecto: ${this.projectRoot}\n`);
    }
    
    let result;
    
    switch (command) {
      case 'analyze':
      case '-a':
        result = await this.runAnalysis(options);
        break;
        
      case 'fix':
      case '-f':
        result = await this.runFix(options);
        break;
        
      case 'help':
      case '-h':
      default:
        this.showHelp();
        return;
    }
    
    if (!options.reportOnly) {
      console.log('\n' + '='.repeat(50));
      if (result.success) {
        console.log('✅ Proceso completado exitosamente.');
        if (result.errors !== undefined) {
          console.log(`📊 Errores encontrados: ${result.errors}`);
          console.log(`⚠️  Advertencias: ${result.warnings}`);
        }
        if (result.fixes !== undefined) {
          console.log(`🔧 Correcciones aplicadas: ${result.fixes}`);
        }
      } else {
        console.log('❌ Proceso completado con errores.');
        console.log(`💥 Error: ${result.error}`);
        process.exit(1);
      }
    }
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] && process.argv[1].endsWith('reference-checker.js')) {
  const checker = new ReferenceChecker();
  checker.run().catch(console.error);
}

export { ReferenceChecker };