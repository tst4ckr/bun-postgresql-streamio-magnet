#!/usr/bin/env node
/**
 * @fileoverview Script para corregir automáticamente problemas de referencias detectados
 * Aplica correcciones basadas en el análisis previo de referencias
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReferenceAnalyzer } from './analyze-references.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReferenceFixer {
  constructor(projectRoot = __dirname) {
    this.projectRoot = projectRoot;
    this.analyzer = new ReferenceAnalyzer(projectRoot);
    this.fixes = [];
    this.backupDir = path.join(projectRoot, '.reference-fixes-backup');
  }

  /**
   * Ejecuta el proceso completo de análisis y corrección
   */
  async fix() {
    console.log('🔧 Iniciando corrección de referencias...');
    
    try {
      // Crear backup
      await this.createBackup();
      
      // Analizar problemas
      await this.analyzer.analyze();
      
      // Aplicar correcciones
      await this.applyFixes();
      
      // Generar reporte de correcciones
      this.generateFixReport();
      
    } catch (error) {
      console.error('❌ Error durante la corrección:', error.message);
      await this.restoreBackup();
      process.exit(1);
    }
  }

  /**
   * Crea backup de archivos antes de aplicar correcciones
   */
  async createBackup() {
    console.log('💾 Creando backup de archivos...');
    
    if (fs.existsSync(this.backupDir)) {
      fs.rmSync(this.backupDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(this.backupDir, { recursive: true });
    
    for (const [filePath] of this.analyzer.files) {
      const relativePath = path.relative(this.projectRoot, filePath);
      const backupPath = path.join(this.backupDir, relativePath);
      const backupDir = path.dirname(backupPath);
      
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(filePath, backupPath);
    }
    
    console.log(`✅ Backup creado en: ${this.backupDir}`);
  }

  /**
   * Aplica las correcciones automáticas
   */
  async applyFixes() {
    console.log('🔧 Aplicando correcciones automáticas...');
    
    // Corregir imports incorrectos
    await this.fixIncorrectImports();
    
    // Corregir referencias a métodos
    await this.fixMethodReferences();
    
    // Corregir exports faltantes
    await this.fixMissingExports();
    
    // Optimizar imports no utilizados
    await this.removeUnusedImports();
    
    console.log(`✅ Se aplicaron ${this.fixes.length} correcciones`);
  }

  /**
   * Corrige imports incorrectos
   */
  async fixIncorrectImports() {
    for (const error of this.analyzer.errors) {
      if (error.message.includes('Import no resuelto')) {
        await this.fixUnresolvedImport(error);
      } else if (error.message.includes('no encontrado en')) {
        await this.fixMissingImportItem(error);
      }
    }
  }

  /**
   * Corrige un import no resuelto
   */
  async fixUnresolvedImport(error) {
    const filePath = this.getFilePathFromError(error);
    if (!filePath) return;
    
    const fileInfo = this.analyzer.files.get(filePath);
    if (!fileInfo) return;
    
    // Extraer el módulo del mensaje de error
    const moduleMatch = error.message.match(/'([^']+)'/);
    if (!moduleMatch) return;
    
    const modulePath = moduleMatch[1];
    const lineMatch = error.message.match(/línea (\d+)/);
    const lineNumber = lineMatch ? parseInt(lineMatch[1]) : null;
    
    // Intentar encontrar el archivo correcto
    const correctedPath = await this.findCorrectImportPath(filePath, modulePath);
    
    if (correctedPath) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (lineNumber && lines[lineNumber - 1]) {
        const oldLine = lines[lineNumber - 1];
        const newLine = oldLine.replace(modulePath, correctedPath);
        lines[lineNumber - 1] = newLine;
        
        fs.writeFileSync(filePath, lines.join('\n'));
        
        this.addFix(fileInfo.relativePath, `Corregido import: '${modulePath}' → '${correctedPath}'`);
      }
    }
  }

  /**
   * Corrige items de import faltantes
   */
  async fixMissingImportItem(error) {
    const filePath = this.getFilePathFromError(error);
    if (!filePath) return;
    
    const fileInfo = this.analyzer.files.get(filePath);
    if (!fileInfo) return;
    
    // Extraer información del error
    const itemMatch = error.message.match(/Import '([^']+)'/);
    const moduleMatch = error.message.match(/en '([^']+)'/);
    
    if (!itemMatch || !moduleMatch) return;
    
    const missingItem = itemMatch[1];
    const modulePath = moduleMatch[1];
    
    // Buscar el item en otros archivos o sugerir alternativas
    const suggestion = await this.findAlternativeExport(missingItem, modulePath);
    
    if (suggestion) {
      this.addFix(fileInfo.relativePath, 
        `Sugerencia para '${missingItem}': ${suggestion}`);
    }
  }

  /**
   * Corrige referencias a métodos
   */
  async fixMethodReferences() {
    for (const error of this.analyzer.errors) {
      if (error.message.includes('Método privado') && error.message.includes('no encontrado')) {
        await this.fixMissingPrivateMethod(error);
      }
    }
  }

  /**
   * Corrige método privado faltante
   */
  async fixMissingPrivateMethod(error) {
    const filePath = this.getFilePathFromError(error);
    if (!filePath) return;
    
    const fileInfo = this.analyzer.files.get(filePath);
    if (!fileInfo) return;
    
    const methodMatch = error.message.match(/Método privado '([^']+)'/);
    if (!methodMatch) return;
    
    const methodName = methodMatch[1];
    
    // Buscar si existe un método público similar
    const publicMethod = Array.from(fileInfo.methods).find(method => 
      method.name === methodName.substring(1) && method.type === 'public'
    );
    
    if (publicMethod) {
      this.addFix(fileInfo.relativePath, 
        `Método '${methodName}' no encontrado. ¿Quisiste decir '${publicMethod.name}'?`);
    } else {
      // Sugerir crear el método
      this.addFix(fileInfo.relativePath, 
        `Crear método privado faltante: ${methodName}()`);
    }
  }

  /**
   * Corrige exports faltantes
   */
  async fixMissingExports() {
    // Analizar qué funciones/clases están definidas pero no exportadas
    for (const [filePath, fileInfo] of this.analyzer.files) {
      const definedItems = new Set();
      
      // Recopilar todos los items definidos
      fileInfo.classes.forEach(cls => definedItems.add(cls.name));
      fileInfo.functions.forEach(fn => definedItems.add(fn.name));
      
      // Verificar cuáles no están exportados
      const exportedNames = new Set(Array.from(fileInfo.exports).map(exp => exp.name));
      
      for (const item of definedItems) {
        if (!exportedNames.has(item) && this.shouldBeExported(item, fileInfo)) {
          await this.addMissingExport(filePath, item, fileInfo);
        }
      }
    }
  }

  /**
   * Añade export faltante
   */
  async addMissingExport(filePath, itemName, fileInfo) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Buscar la línea donde se define el item
    const definitionLine = this.findDefinitionLine(lines, itemName);
    
    if (definitionLine !== -1) {
      // Añadir export al final del archivo
      const exportLine = `export { ${itemName} };`;
      
      // Verificar si ya existe una línea de export similar
      const hasExportLine = lines.some(line => line.includes('export {'));
      
      if (hasExportLine) {
        // Buscar la línea de export existente y añadir el item
        const exportLineIndex = lines.findIndex(line => line.includes('export {'));
        const currentExportLine = lines[exportLineIndex];
        
        if (currentExportLine.includes('};')) {
          lines[exportLineIndex] = currentExportLine.replace('};', `, ${itemName} };`);
        }
      } else {
        // Añadir nueva línea de export
        lines.push('', exportLine);
      }
      
      fs.writeFileSync(filePath, lines.join('\n'));
      this.addFix(fileInfo.relativePath, `Añadido export para: ${itemName}`);
    }
  }

  /**
   * Elimina imports no utilizados
   */
  async removeUnusedImports() {
    for (const [filePath, fileInfo] of this.analyzer.files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const unusedImports = this.findUnusedImports(fileInfo, content);
      
      if (unusedImports.length > 0) {
        await this.removeImports(filePath, unusedImports, fileInfo);
      }
    }
  }

  /**
   * Encuentra imports no utilizados
   */
  findUnusedImports(fileInfo, content) {
    const unusedImports = [];
    
    for (const importInfo of fileInfo.imports) {
      for (const item of importInfo.items) {
        const cleanItem = item.replace(/\s+as\s+(.+)/, '$1').trim();
        
        // Buscar uso del item en el contenido
        const usageRegex = new RegExp(`\\b${cleanItem}\\b`, 'g');
        const matches = content.match(usageRegex) || [];
        
        // Si solo aparece en la línea de import, no se usa
        if (matches.length <= 1) {
          unusedImports.push({ importInfo, item: cleanItem });
        }
      }
    }
    
    return unusedImports;
  }

  /**
   * Elimina imports específicos
   */
  async removeImports(filePath, unusedImports, fileInfo) {
    const content = fs.readFileSync(filePath, 'utf8');
    let modifiedContent = content;
    
    for (const { importInfo, item } of unusedImports) {
      // Crear regex para eliminar el item específico
      const itemRegex = new RegExp(`\\b${item}\\b,?\\s*`, 'g');
      modifiedContent = modifiedContent.replace(itemRegex, '');
      
      this.addFix(fileInfo.relativePath, `Eliminado import no utilizado: ${item}`);
    }
    
    // Limpiar imports vacíos
    modifiedContent = modifiedContent.replace(/import\s+{\s*}\s+from\s+['"][^'"]+['"]/g, '');
    
    if (modifiedContent !== content) {
      fs.writeFileSync(filePath, modifiedContent);
    }
  }

  /**
   * Busca la ruta correcta para un import
   */
  async findCorrectImportPath(fromFile, incorrectPath) {
    const fromDir = path.dirname(fromFile);
    const fileName = path.basename(incorrectPath);
    
    // Buscar archivos con nombre similar
    for (const [filePath] of this.analyzer.files) {
      if (path.basename(filePath) === fileName + '.js' || 
          path.basename(filePath, '.js') === fileName) {
        
        const relativePath = path.relative(fromDir, filePath);
        return relativePath.startsWith('.') ? relativePath : './' + relativePath;
      }
    }
    
    return null;
  }

  /**
   * Busca exportación alternativa
   */
  async findAlternativeExport(missingItem, modulePath) {
    // Buscar en todos los archivos exports similares
    for (const [filePath, fileInfo] of this.analyzer.files) {
      for (const exportItem of fileInfo.exports) {
        if (exportItem.name.toLowerCase().includes(missingItem.toLowerCase()) ||
            missingItem.toLowerCase().includes(exportItem.name.toLowerCase())) {
          return `Posible alternativa: '${exportItem.name}' en ${fileInfo.relativePath}`;
        }
      }
    }
    
    return null;
  }

  /**
   * Determina si un item debería ser exportado
   */
  shouldBeExported(itemName, fileInfo) {
    // No exportar items que empiecen con underscore (convención privada)
    if (itemName.startsWith('_')) return false;
    
    // No exportar si ya está exportado
    const isExported = Array.from(fileInfo.exports).some(exp => exp.name === itemName);
    if (isExported) return false;
    
    // Exportar clases y funciones principales
    return true;
  }

  /**
   * Encuentra la línea donde se define un item
   */
  findDefinitionLine(lines, itemName) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(`class ${itemName}`) || 
          line.includes(`function ${itemName}`) ||
          line.includes(`const ${itemName}`) ||
          line.includes(`let ${itemName}`)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Obtiene la ruta del archivo desde un error
   */
  getFilePathFromError(error) {
    for (const [filePath, fileInfo] of this.analyzer.files) {
      if (fileInfo.relativePath === error.file) {
        return filePath;
      }
    }
    return null;
  }

  /**
   * Añade una corrección al registro
   */
  addFix(file, description) {
    this.fixes.push({
      file,
      description,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Restaura el backup en caso de error
   */
  async restoreBackup() {
    console.log('🔄 Restaurando backup...');
    
    if (!fs.existsSync(this.backupDir)) {
      console.log('❌ No se encontró directorio de backup');
      return;
    }
    
    // Restaurar archivos desde backup
    const restoreFiles = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const backupPath = path.join(dir, item);
        const relativePath = path.relative(this.backupDir, backupPath);
        const originalPath = path.join(this.projectRoot, relativePath);
        
        if (fs.statSync(backupPath).isDirectory()) {
          restoreFiles(backupPath);
        } else {
          fs.copyFileSync(backupPath, originalPath);
        }
      }
    };
    
    restoreFiles(this.backupDir);
    console.log('✅ Backup restaurado');
  }

  /**
   * Genera reporte de correcciones aplicadas
   */
  generateFixReport() {
    console.log('\n📊 REPORTE DE CORRECCIONES APLICADAS');
    console.log('=' .repeat(50));
    
    if (this.fixes.length === 0) {
      console.log('\n✅ No se requirieron correcciones automáticas.');
      return;
    }
    
    console.log(`\n🔧 Total de correcciones aplicadas: ${this.fixes.length}`);
    
    // Agrupar correcciones por archivo
    const fixesByFile = new Map();
    for (const fix of this.fixes) {
      if (!fixesByFile.has(fix.file)) {
        fixesByFile.set(fix.file, []);
      }
      fixesByFile.get(fix.file).push(fix);
    }
    
    for (const [file, fileFixes] of fixesByFile) {
      console.log(`\n📄 ${file}:`);
      fileFixes.forEach((fix, index) => {
        console.log(`  ${index + 1}. ${fix.description}`);
      });
    }
    
    // Guardar reporte detallado
    const report = {
      timestamp: new Date().toISOString(),
      totalFixes: this.fixes.length,
      fixes: this.fixes,
      backupLocation: this.backupDir
    };
    
    fs.writeFileSync(
      path.join(this.projectRoot, 'reference-fixes-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n📄 Reporte detallado guardado en: reference-fixes-report.json`);
    console.log(`💾 Backup disponible en: ${this.backupDir}`);
    console.log('\n✅ Correcciones completadas exitosamente.');
  }
}

// Ejecutar si es llamado directamente
if (process.argv[1] && process.argv[1].endsWith('fix-references.js')) {
  const fixer = new ReferenceFixer();
  fixer.fix().catch(console.error);
}

export { ReferenceFixer };