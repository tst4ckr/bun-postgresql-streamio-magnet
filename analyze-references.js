#!/usr/bin/env node
/**
 * @fileoverview Script para analizar y validar referencias entre archivos, métodos y funciones
 * Detecta imports incorrectos, métodos inexistentes, dependencias circulares y otros problemas de referencia
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReferenceAnalyzer {
  constructor(projectRoot = __dirname) {
    this.projectRoot = projectRoot;
    this.srcPath = path.join(projectRoot, 'src');
    this.files = new Map(); // filepath -> file info
    this.exports = new Map(); // filepath -> exported items
    this.imports = new Map(); // filepath -> imported items
    this.errors = [];
    this.warnings = [];
    this.stats = {
      filesAnalyzed: 0,
      errorsFound: 0,
      warningsFound: 0,
      circularDependencies: 0
    };
  }

  /**
   * Ejecuta el análisis completo
   */
  async analyze() {
    console.log('🔍 Iniciando análisis de referencias...');
    console.log(`📁 Directorio: ${this.srcPath}`);
    
    try {
      await this.scanFiles();
      await this.parseFiles();
      await this.validateReferences();
      await this.detectCircularDependencies();
      this.generateReport();
    } catch (error) {
      console.error('❌ Error durante el análisis:', error.message);
      process.exit(1);
    }
  }

  /**
   * Escanea todos los archivos JavaScript en el proyecto
   */
  async scanFiles() {
    const files = [];
    
    // Escanear directorio src recursivamente
    this.scanDirectory(this.srcPath, files);
    
    // Añadir archivos específicos en la raíz
    const rootFiles = ['index.js', 'fix-logger-calls.js', 'analyze-references.js', 'fix-references.js', 'reference-checker.js'];
    for (const fileName of rootFiles) {
      const filePath = path.join(this.projectRoot, fileName);
      if (fs.existsSync(filePath)) {
        files.push(filePath);
      }
    }

    for (const file of files) {
      const relativePath = path.relative(this.projectRoot, file);
      this.files.set(file, {
        path: file,
        relativePath,
        content: null,
        exports: new Set(),
        imports: new Set(),
        methods: new Set(),
        classes: new Set(),
        functions: new Set()
      });
    }

    this.stats.filesAnalyzed = this.files.size;
    console.log(`📄 Encontrados ${this.stats.filesAnalyzed} archivos para analizar`);
  }

  /**
   * Escanea un directorio recursivamente buscando archivos .js
   */
  scanDirectory(dir, files) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Ignorar node_modules y otros directorios no deseados
        if (!['node_modules', '.git', 'dist', 'build'].includes(item)) {
          this.scanDirectory(fullPath, files);
        }
      } else if (stat.isFile() && fullPath.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Parsea el contenido de cada archivo
   */
  async parseFiles() {
    console.log('📖 Parseando archivos...');
    
    for (const [filePath, fileInfo] of this.files) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        fileInfo.content = content;
        
        this.parseImports(fileInfo);
        this.parseExports(fileInfo);
        this.parseMethods(fileInfo);
        this.parseClasses(fileInfo);
        this.parseFunctions(fileInfo);
        
      } catch (error) {
        this.addError(fileInfo.relativePath, `Error leyendo archivo: ${error.message}`);
      }
    }
  }

  /**
   * Parsea las declaraciones de import
   */
  parseImports(fileInfo) {
    const importRegex = /import\s+(?:{([^}]+)}|([^\s,]+)|\*\s+as\s+([^\s]+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(fileInfo.content)) !== null) {
      const [, namedImports, defaultImport, namespaceImport, modulePath] = match;
      
      const importInfo = {
        modulePath,
        type: namedImports ? 'named' : defaultImport ? 'default' : 'namespace',
        items: [],
        line: this.getLineNumber(fileInfo.content, match.index)
      };
      
      if (namedImports) {
        importInfo.items = namedImports.split(',').map(item => item.trim());
      } else if (defaultImport) {
        importInfo.items = [defaultImport.trim()];
      } else if (namespaceImport) {
        importInfo.items = [namespaceImport.trim()];
      }
      
      fileInfo.imports.add(importInfo);
    }
  }

  /**
   * Parsea las declaraciones de export
   */
  parseExports(fileInfo) {
    // Export named
    const namedExportRegex = /export\s+(?:const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    
    while ((match = namedExportRegex.exec(fileInfo.content)) !== null) {
      fileInfo.exports.add({
        name: match[1],
        type: 'named',
        line: this.getLineNumber(fileInfo.content, match.index)
      });
    }
    
    // Export default
    const defaultExportRegex = /export\s+default\s+(?:class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*))/g;
    while ((match = defaultExportRegex.exec(fileInfo.content)) !== null) {
      const name = match[1] || match[2] || match[3] || 'default';
      fileInfo.exports.add({
        name,
        type: 'default',
        line: this.getLineNumber(fileInfo.content, match.index)
      });
    }
    
    // Export destructuring
    const destructuringExportRegex = /export\s+{([^}]+)}/g;
    while ((match = destructuringExportRegex.exec(fileInfo.content)) !== null) {
      const items = match[1].split(',').map(item => item.trim());
      items.forEach(item => {
        const [original, alias] = item.split(' as ').map(s => s.trim());
        fileInfo.exports.add({
          name: alias || original,
          original: original,
          type: 'named',
          line: this.getLineNumber(fileInfo.content, match.index)
        });
      });
    }
  }

  /**
   * Parsea métodos de clase
   */
  parseMethods(fileInfo) {
    // Métodos públicos
    const methodRegex = /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/gm;
    let match;
    
    while ((match = methodRegex.exec(fileInfo.content)) !== null) {
      if (!this.isInsideComment(fileInfo.content, match.index)) {
        fileInfo.methods.add({
          name: match[1],
          type: 'public',
          line: this.getLineNumber(fileInfo.content, match.index)
        });
      }
    }
    
    // Métodos privados
    const privateMethodRegex = /^\s*(#[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/gm;
    while ((match = privateMethodRegex.exec(fileInfo.content)) !== null) {
      if (!this.isInsideComment(fileInfo.content, match.index)) {
        fileInfo.methods.add({
          name: match[1],
          type: 'private',
          line: this.getLineNumber(fileInfo.content, match.index)
        });
      }
    }
  }

  /**
   * Parsea clases
   */
  parseClasses(fileInfo) {
    const classRegex = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let match;
    
    while ((match = classRegex.exec(fileInfo.content)) !== null) {
      if (!this.isInsideComment(fileInfo.content, match.index)) {
        fileInfo.classes.add({
          name: match[1],
          line: this.getLineNumber(fileInfo.content, match.index)
        });
      }
    }
  }

  /**
   * Parsea funciones
   */
  parseFunctions(fileInfo) {
    const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    
    while ((match = functionRegex.exec(fileInfo.content)) !== null) {
      if (!this.isInsideComment(fileInfo.content, match.index)) {
        fileInfo.functions.add({
          name: match[1],
          line: this.getLineNumber(fileInfo.content, match.index)
        });
      }
    }
  }

  /**
   * Valida todas las referencias
   */
  async validateReferences() {
    console.log('🔍 Validando referencias...');
    
    for (const [filePath, fileInfo] of this.files) {
      await this.validateFileImports(fileInfo);
      await this.validateMethodCalls(fileInfo);
    }
  }

  /**
   * Valida los imports de un archivo
   */
  async validateFileImports(fileInfo) {
    for (const importInfo of fileInfo.imports) {
      const resolvedPath = this.resolveImportPath(fileInfo.path, importInfo.modulePath);
      
      if (!resolvedPath) {
        this.addError(fileInfo.relativePath, 
          `Import no resuelto: '${importInfo.modulePath}' (línea ${importInfo.line})`);
        continue;
      }
      
      const targetFile = this.files.get(resolvedPath);
      if (!targetFile) {
        this.addWarning(fileInfo.relativePath, 
          `Archivo importado no encontrado en el análisis: '${importInfo.modulePath}' (línea ${importInfo.line})`);
        continue;
      }
      
      // Validar que los items importados existan
      if (importInfo.type === 'named') {
        for (const item of importInfo.items) {
          const cleanItem = item.replace(/\s+as\s+.+/, '').trim();
          const exportExists = Array.from(targetFile.exports).some(exp => 
            exp.name === cleanItem || exp.original === cleanItem
          );
          
          if (!exportExists) {
            this.addError(fileInfo.relativePath, 
              `Import '${cleanItem}' no encontrado en '${importInfo.modulePath}' (línea ${importInfo.line})`);
          }
        }
      }
    }
  }

  /**
   * Valida llamadas a métodos
   */
  async validateMethodCalls(fileInfo) {
    // Buscar llamadas a métodos privados desde fuera de la clase
    const privateMethodCallRegex = /this\.(#[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    
    while ((match = privateMethodCallRegex.exec(fileInfo.content)) !== null) {
      const methodName = match[1];
      const methodExists = Array.from(fileInfo.methods).some(method => method.name === methodName);
      
      if (!methodExists) {
        this.addError(fileInfo.relativePath, 
          `Método privado '${methodName}' no encontrado (línea ${this.getLineNumber(fileInfo.content, match.index)})`);
      }
    }
  }

  /**
   * Detecta dependencias circulares
   */
  async detectCircularDependencies() {
    console.log('🔄 Detectando dependencias circulares...');
    
    const visited = new Set();
    const recursionStack = new Set();
    const dependencies = new Map();
    
    // Construir grafo de dependencias
    for (const [filePath, fileInfo] of this.files) {
      const deps = new Set();
      for (const importInfo of fileInfo.imports) {
        const resolvedPath = this.resolveImportPath(filePath, importInfo.modulePath);
        if (resolvedPath && this.files.has(resolvedPath)) {
          deps.add(resolvedPath);
        }
      }
      dependencies.set(filePath, deps);
    }
    
    // DFS para detectar ciclos
    const detectCycle = (node, pathArray = []) => {
      if (recursionStack.has(node)) {
        const cycleStart = pathArray.indexOf(node);
        const cycle = pathArray.slice(cycleStart).concat([node]);
        const projectRoot = this.projectRoot;
        this.addError('Dependencia circular', 
          `Ciclo detectado: ${cycle.map(p => path.relative(projectRoot, p)).join(' → ')}`);
        this.stats.circularDependencies++;
        return;
      }
      
      if (visited.has(node)) return;
      
      visited.add(node);
      recursionStack.add(node);
      pathArray.push(node);
      
      const deps = dependencies.get(node) || new Set();
      for (const dep of deps) {
        detectCycle(dep, [...pathArray]);
      }
      
      recursionStack.delete(node);
      pathArray.pop();
    };
    
    for (const filePath of this.files.keys()) {
      if (!visited.has(filePath)) {
        detectCycle(filePath);
      }
    }
  }

  /**
   * Resuelve la ruta de un import
   */
  resolveImportPath(fromFile, importPath) {
    if (importPath.startsWith('.')) {
      // Import relativo
      const fromDir = path.dirname(fromFile);
      let resolved = path.resolve(fromDir, importPath);
      
      // Intentar con extensión .js
      if (!fs.existsSync(resolved) && !resolved.endsWith('.js')) {
        resolved += '.js';
      }
      
      return fs.existsSync(resolved) ? resolved : null;
    }
    
    // Import de node_modules o absoluto - no validamos estos
    return null;
  }

  /**
   * Obtiene el número de línea de una posición en el texto
   */
  getLineNumber(content, position) {
    return content.substring(0, position).split('\n').length;
  }

  /**
   * Verifica si una posición está dentro de un comentario
   */
  isInsideComment(content, position) {
    const beforePosition = content.substring(0, position);
    const lines = beforePosition.split('\n');
    const currentLine = lines[lines.length - 1];
    
    // Comentario de línea
    if (currentLine.includes('//')) {
      const commentIndex = currentLine.indexOf('//');
      const positionInLine = position - (beforePosition.length - currentLine.length);
      if (positionInLine > commentIndex) return true;
    }
    
    // Comentario de bloque (simplificado)
    const blockCommentStart = beforePosition.lastIndexOf('/*');
    const blockCommentEnd = beforePosition.lastIndexOf('*/');
    
    return blockCommentStart > blockCommentEnd;
  }

  /**
   * Añade un error
   */
  addError(file, message) {
    this.errors.push({ file, message, type: 'error' });
    this.stats.errorsFound++;
  }

  /**
   * Añade una advertencia
   */
  addWarning(file, message) {
    this.warnings.push({ file, message, type: 'warning' });
    this.stats.warningsFound++;
  }

  /**
   * Genera el reporte final
   */
  generateReport() {
    console.log('\n📊 REPORTE DE ANÁLISIS DE REFERENCIAS');
    console.log('=' .repeat(50));
    
    console.log(`\n📈 Estadísticas:`);
    console.log(`  • Archivos analizados: ${this.stats.filesAnalyzed}`);
    console.log(`  • Errores encontrados: ${this.stats.errorsFound}`);
    console.log(`  • Advertencias: ${this.stats.warningsFound}`);
    console.log(`  • Dependencias circulares: ${this.stats.circularDependencies}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORES:');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. [${error.file}] ${error.message}`);
      });
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  ADVERTENCIAS:');
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. [${warning.file}] ${warning.message}`);
      });
    }
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ ¡No se encontraron problemas de referencias!');
    }
    
    // Generar archivo de reporte
    this.generateReportFile();
    
    console.log(`\n📄 Reporte detallado guardado en: reference-analysis-report.json`);
    
    // Exit code basado en errores
    if (this.stats.errorsFound > 0) {
      console.log('\n❌ Análisis completado con errores.');
      process.exit(1);
    } else {
      console.log('\n✅ Análisis completado exitosamente.');
    }
  }

  /**
   * Genera archivo de reporte JSON
   */
  generateReportFile() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      errors: this.errors,
      warnings: this.warnings,
      files: Array.from(this.files.entries()).map(([path, info]) => ({
        path: info.relativePath,
        exports: Array.from(info.exports),
        imports: Array.from(info.imports),
        methods: Array.from(info.methods),
        classes: Array.from(info.classes),
        functions: Array.from(info.functions)
      }))
    };
    
    fs.writeFileSync(
      path.join(this.projectRoot, 'reference-analysis-report.json'),
      JSON.stringify(report, null, 2)
    );
  }
}

// Ejecutar análisis si se llama directamente
if (process.argv[1] && process.argv[1].endsWith('analyze-references.js')) {
  const analyzer = new ReferenceAnalyzer();
  analyzer.analyze().catch(console.error);
}

export { ReferenceAnalyzer };