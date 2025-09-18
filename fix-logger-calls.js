#!/usr/bin/env node
/**
 * Script para corregir automáticamente las llamadas incorrectas al logger
 * Basado en las mejores prácticas de la industria y la implementación de EnhancedLogger
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuración del script
 */
const CONFIG = {
  sourceDir: './src',
  backupDir: './backup-logger-fix',
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  extensions: ['.js', '.mjs', '.ts']
};

/**
 * Patrones de corrección para llamadas de logger
 */
const LOGGER_FIXES = [
  {
    name: "Revertir this.#logger.log genérico a métodos específicos - INFO",
    pattern: /this\.#logger\.log\(['"]info['"],\s*([^,]+),\s*\{[^}]*\}\)/g,
    replacement: 'this.#logger.info($1)',
    description: "Convierte this.#logger.log('info', message, {}) a this.#logger.info(message)"
  },
  {
    name: "Revertir this.#logger.log genérico a métodos específicos - WARN",
    pattern: /this\.#logger\.log\(['"]warn['"],\s*([^,]+),\s*\{[^}]*\}\)/g,
    replacement: 'this.#logger.warn($1)',
    description: "Convierte this.#logger.log('warn', message, {}) a this.#logger.warn(message)"
  },
  {
    name: "Revertir this.#logger.log genérico a métodos específicos - ERROR",
    pattern: /this\.#logger\.log\(['"]error['"],\s*([^,]+),\s*\{[^}]*\}\)/g,
    replacement: 'this.#logger.error($1)',
    description: "Convierte this.#logger.log('error', message, {}) a this.#logger.error(message)"
  },
  {
    name: "Revertir this.#logger.log genérico a métodos específicos - DEBUG",
    pattern: /this\.#logger\.log\(['"]debug['"],\s*([^,]+),\s*\{[^}]*\}\)/g,
    replacement: 'this.#logger.debug($1)',
    description: "Convierte this.#logger.log('debug', message, {}) a this.#logger.debug(message)"
  },
  {
    name: "Convertir this.#logger.log con nivel y options a métodos específicos - INFO",
    pattern: /this\.#logger\.log\(['"]info['"],\s*([^,]+),\s*(\{[^}]*\})\)/g,
    replacement: 'this.#logger.info($1, $2)',
    description: "Convierte this.#logger.log('info', message, options) a this.#logger.info(message, options)"
  },
  {
    name: "Convertir this.#logger.log con nivel y options a métodos específicos - WARN",
    pattern: /this\.#logger\.log\(['"]warn['"],\s*([^,]+),\s*(\{[^}]*\})\)/g,
    replacement: 'this.#logger.warn($1, $2)',
    description: "Convierte this.#logger.log('warn', message, options) a this.#logger.warn(message, options)"
  },
  {
    name: "Convertir this.#logger.log con nivel y options a métodos específicos - ERROR",
    pattern: /this\.#logger\.log\(['"]error['"],\s*([^,]+),\s*(\{[^}]*\})\)/g,
    replacement: 'this.#logger.error($1, $2)',
    description: "Convierte this.#logger.log('error', message, options) a this.#logger.error(message, options)"
  },
  {
    name: "Convertir this.#logger.log con nivel y options a métodos específicos - DEBUG",
    pattern: /this\.#logger\.log\(['"]debug['"],\s*([^,]+),\s*(\{[^}]*\})\)/g,
    replacement: 'this.#logger.debug($1, $2)',
    description: "Convierte this.#logger.log('debug', message, options) a this.#logger.debug(message, options)"
  },
  {
    name: 'Corregir this.#logger(level, message) a this.#logger.log(level, message)',
    pattern: /this\.#logger\((['"`])([^'"`,]+)\1,\s*([^)]+)\)/g,
    replacement: 'this.#logger.log($1$2$1, $3)'
  },
  {
    name: 'Corregir this.#logger(level, message, data) a this.#logger.log(level, message, {data})',
    pattern: /this\.#logger\((['"`])([^'"`,]+)\1,\s*([^,)]+),\s*([^)]+)\)/g,
    replacement: 'this.#logger.log($1$2$1, $3, { data: $4 })'
  },
  {
    name: 'Corregir llamadas directas sin this.#logger',
    pattern: /(?<!this\.)#logger\.(info|warn|error|debug)\(/g,
    replacement: 'this.#logger.$1('
  }
];

/**
 * Mejores prácticas para validar implementación
 */
const BEST_PRACTICES = {
  // Niveles estándar según RFC5424 y Winston
  validLevels: ['error', 'warn', 'info', 'debug', 'verbose', 'silly'],
  
  // Patrones recomendados
  recommendedPatterns: [
    {
      description: 'Usar structured logging con metadatos',
      example: 'this.#logger.log("info", "Operación completada", { component: "TorService", duration: 150 })'
    },
    {
      description: 'Usar lazy evaluation para mensajes costosos',
      example: 'this.#logger.debug(() => `Estado complejo: ${JSON.stringify(complexObject)}`))'
    },
    {
      description: 'Incluir contexto relevante en logs de error',
      example: 'this.#logger.log("error", "Falló operación", { component: "API", error: err.message, requestId })'
    }
  ],
  
  // Anti-patrones a evitar
  antiPatterns: [
    {
      pattern: /console\.(log|info|warn|error)/g,
      description: 'Evitar console.* directo, usar logger centralizado'
    },
    {
      pattern: /this\.#logger\.[^(]+\([^)]*\$\{[^}]*JSON\.stringify/g,
      description: 'Evitar JSON.stringify en mensajes, usar lazy evaluation'
    },
    {
      pattern: /this\.#logger\.[^(]+\([^)]*\+[^)]*\+/g,
      description: 'Evitar concatenación de strings, usar template literals o structured data'
    }
  ]
};

/**
 * Utilidades del script
 */
class LoggerFixerUtils {
  static log(message, level = 'info') {
    if (!CONFIG.verbose && level === 'debug') return;
    const prefix = CONFIG.dryRun ? '[DRY-RUN]' : '[FIXING]';
    console.log(`${prefix} ${message}`);
  }

  static createBackup(filePath) {
    if (CONFIG.dryRun) return;
    
    const backupPath = path.join(CONFIG.backupDir, path.relative(CONFIG.sourceDir, filePath));
    const backupDir = path.dirname(backupPath);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.copyFileSync(filePath, backupPath);
    this.log(`Backup creado: ${backupPath}`, 'debug');
  }

  static isValidFile(filePath) {
    const ext = path.extname(filePath);
    return CONFIG.extensions.includes(ext) && !filePath.includes('node_modules');
  }

  static getAllFiles(dir) {
    const files = [];
    
    function traverse(currentDir) {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          traverse(fullPath);
        } else if (stat.isFile() && LoggerFixerUtils.isValidFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
    
    traverse(dir);
    return files;
  }
}

/**
 * Analizador de código para detectar problemas
 */
class LoggerAnalyzer {
  static analyzeFile(content, filePath) {
    const issues = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Detectar anti-patrones
      BEST_PRACTICES.antiPatterns.forEach(antiPattern => {
        if (antiPattern.pattern.test(line)) {
          issues.push({
            type: 'anti-pattern',
            line: lineNumber,
            content: line.trim(),
            description: antiPattern.description,
            severity: 'warning'
          });
        }
      });
      
      // Detectar llamadas incorrectas al logger
      if (line.includes('#logger(') && !line.includes('#logger.')) {
        issues.push({
          type: 'incorrect-call',
          line: lineNumber,
          content: line.trim(),
          description: 'Llamada incorrecta al logger, debería usar método específico',
          severity: 'error'
        });
      }
      
      // Detectar niveles de log inválidos
      const levelMatch = line.match(/this\.#logger\.(\w+)\(/g);
      if (levelMatch) {
        levelMatch.forEach(match => {
          const level = match.match(/\.(\w+)\(/)[1];
          if (!BEST_PRACTICES.validLevels.includes(level) && level !== 'log') {
            issues.push({
              type: 'invalid-level',
              line: lineNumber,
              content: line.trim(),
              description: `Nivel de log inválido: ${level}`,
              severity: 'error'
            });
          }
        });
      }
    });
    
    return issues;
  }

  static generateReport(allIssues) {
    const report = {
      totalFiles: Object.keys(allIssues).length,
      totalIssues: Object.values(allIssues).reduce((sum, issues) => sum + issues.length, 0),
      byType: {},
      bySeverity: { error: 0, warning: 0 }
    };
    
    Object.values(allIssues).flat().forEach(issue => {
      report.byType[issue.type] = (report.byType[issue.type] || 0) + 1;
      report.bySeverity[issue.severity]++;
    });
    
    return report;
  }
}

/**
 * Corrector de código
 */
class LoggerFixer {
  static fixContent(content) {
    let fixedContent = content;
    const appliedFixes = [];
    
    LOGGER_FIXES.forEach(fix => {
      const matches = fixedContent.match(fix.pattern);
      if (matches) {
        fixedContent = fixedContent.replace(fix.pattern, fix.replacement);
        appliedFixes.push({
          name: fix.name,
          count: matches.length
        });
      }
    });
    
    return { fixedContent, appliedFixes };
  }

  static fixFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixedContent, appliedFixes } = this.fixContent(content);
    
    if (appliedFixes.length > 0) {
      LoggerFixerUtils.createBackup(filePath);
      
      if (!CONFIG.dryRun) {
        fs.writeFileSync(filePath, fixedContent, 'utf8');
      }
      
      LoggerFixerUtils.log(`Archivo corregido: ${filePath}`);
      appliedFixes.forEach(fix => {
        LoggerFixerUtils.log(`  - ${fix.name}: ${fix.count} correcciones`, 'debug');
      });
      
      return appliedFixes;
    }
    
    return [];
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🔧 Logger Fixer - Corrección automática de llamadas al logger\n');
  
  if (CONFIG.dryRun) {
    console.log('⚠️  Modo DRY-RUN activado - No se realizarán cambios\n');
  }
  
  // Verificar directorio fuente
  const sourceDir = path.resolve(CONFIG.sourceDir);
  console.log(`🔍 Buscando en directorio: ${sourceDir}`);
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Directorio fuente no encontrado: ${sourceDir}`);
    process.exit(1);
  }
  
  // Obtener todos los archivos
  const files = LoggerFixerUtils.getAllFiles(sourceDir);
  console.log(`📁 Encontrados ${files.length} archivos para analizar...\n`);
  
  if (files.length === 0) {
    console.log('ℹ️  No se encontraron archivos para procesar.');
    return;
  }
  
  // Fase 1: Análisis
  console.log('🔍 Fase 1: Análisis de problemas');
  const allIssues = {};
  
  files.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = LoggerAnalyzer.analyzeFile(content, filePath);
    
    if (issues.length > 0) {
      allIssues[filePath] = issues;
      LoggerFixerUtils.log(`${path.relative(CONFIG.sourceDir, filePath)}: ${issues.length} problemas`);
    }
  });
  
  // Generar reporte de análisis
  const report = LoggerAnalyzer.generateReport(allIssues);
  console.log('\n📊 Reporte de análisis:');
  console.log(`  - Archivos con problemas: ${report.totalFiles}`);
  console.log(`  - Total de problemas: ${report.totalIssues}`);
  console.log(`  - Errores: ${report.bySeverity.error}`);
  console.log(`  - Advertencias: ${report.bySeverity.warning}`);
  
  if (CONFIG.verbose) {
    console.log('\n📋 Detalle por tipo:');
    Object.entries(report.byType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }
  
  // Fase 2: Corrección
  console.log('\n🔧 Fase 2: Aplicación de correcciones');
  const fixResults = {};
  
  files.forEach(filePath => {
    const fixes = LoggerFixer.fixFile(filePath);
    if (fixes.length > 0) {
      fixResults[filePath] = fixes;
    }
  });
  
  // Reporte final
  const fixedFiles = Object.keys(fixResults).length;
  const totalFixes = Object.values(fixResults).reduce((sum, fixes) => 
    sum + fixes.reduce((s, f) => s + f.count, 0), 0
  );
  
  console.log('\n✅ Corrección completada:');
  console.log(`  - Archivos corregidos: ${fixedFiles}`);
  console.log(`  - Total de correcciones: ${totalFixes}`);
  
  if (!CONFIG.dryRun && fixedFiles > 0) {
    console.log(`  - Backups guardados en: ${CONFIG.backupDir}`);
  }
  
  // Mostrar mejores prácticas
  if (CONFIG.verbose) {
    console.log('\n💡 Mejores prácticas recomendadas:');
    BEST_PRACTICES.recommendedPatterns.forEach((practice, index) => {
      console.log(`  ${index + 1}. ${practice.description}`);
      console.log(`     Ejemplo: ${practice.example}`);
    });
  }
  
  console.log('\n🎉 Proceso completado exitosamente!');
}

// Ejecutar script directamente
main().catch(error => {
  console.error('❌ Error durante la ejecución:', error);
  process.exit(1);
});

export { LoggerFixer, LoggerAnalyzer, LoggerFixerUtils };