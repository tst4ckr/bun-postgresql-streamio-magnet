#!/usr/bin/env node

/**
 * Script para renombrar archivos y cambiar referencias de Channel a Tv
 * Mantiene consistencia con la nomenclatura de Stremio para canales de TV
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración del script
const config = {
  projectRoot: __dirname,
  dryRun: false, // Cambiar a true para solo mostrar cambios sin aplicarlos
  backupDir: path.join(__dirname, '.backup-channel-to-tv'),
  
  // Mapeo de archivos a renombrar
  fileRenames: [
    {
      from: 'src/domain/entities/Channel.js',
      to: 'src/domain/entities/Tv.js'
    },
    {
      from: 'src/infrastructure/repositories/M3UChannelRepository.js',
      to: 'src/infrastructure/repositories/M3UTvRepository.js'
    },
    {
      from: 'src/application/handlers/ChannelHandler.js',
      to: 'src/application/handlers/TvHandler.js'
    }
  ],
  
  // Patrones de reemplazo en el código
  replacements: [
    // Clases y constructores
    { from: /class Channel\b/g, to: 'class Tv' },
    { from: /new Channel\(/g, to: 'new Tv(' },
    { from: /Channel\.from/g, to: 'Tv.from' },
    { from: /Channel\.generate/g, to: 'Tv.generate' },
    
    // Imports y exports
    { from: /import.*Channel.*from.*Channel\.js/g, to: "import { Tv } from './Tv.js'" },
    { from: /from.*Channel\.js/g, to: "from './Tv.js'" },
    { from: /export.*Channel/g, to: 'export { Tv }' },
    { from: /export default Channel/g, to: 'export default Tv' },
    
    // Repositorios
    { from: /M3UChannelRepository/g, to: 'M3UTvRepository' },
    { from: /ChannelHandler/g, to: 'TvHandler' },
    { from: /channelRepository/g, to: 'tvRepository' },
    { from: /channelHandler/g, to: 'tvHandler' },
    
    // Variables y parámetros
    { from: /\bchannels\b/g, to: 'tvs' },
    { from: /\bchannel\b/g, to: 'tv' },
    { from: /channelData/g, to: 'tvData' },
    { from: /channelInfo/g, to: 'tvInfo' },
    { from: /getChannel/g, to: 'getTv' },
    { from: /getAllChannels/g, to: 'getAllTvs' },
    { from: /getChannelById/g, to: 'getTvById' },
    { from: /getChannelsByGroup/g, to: 'getTvsByGroup' },
    { from: /searchChannels/g, to: 'searchTvs' },
    { from: /refreshChannels/g, to: 'refreshTvs' },
    
    // Comentarios y documentación
    { from: /canales/g, to: 'canales de TV' },
    { from: /Canal de TV:/g, to: 'Canal:' },
    { from: /Channel/g, to: 'Tv' },
    
    // Cache keys
    { from: /catalog_channels/g, to: 'catalog_tvs' },
    { from: /stream_channel/g, to: 'stream_tv' },
    { from: /channel_genres/g, to: 'tv_genres' },
    
    // Logs y mensajes
    { from: /Channel/g, to: 'Tv' },
    { from: /'Channel/g, to: "'Tv" },
    { from: /"Channel/g, to: '"Tv' }
  ],
  
  // Archivos a procesar (patrones glob)
  filesToProcess: [
    'src/**/*.js',
    '*.js',
    '*.md'
  ],
  
  // Archivos a excluir
  excludeFiles: [
    'node_modules/**',
    '.git/**',
    'bun.lock',
    'package-lock.json',
    '.backup-channel-to-tv/**'
  ]
};

class ChannelToTvRenamer {
  constructor(config) {
    this.config = config;
    this.changes = [];
    this.errors = [];
  }

  async run() {
    console.log('🚀 Iniciando proceso de renombrado Channel → Tv');
    console.log(`📁 Directorio del proyecto: ${this.config.projectRoot}`);
    console.log(`🔄 Modo: ${this.config.dryRun ? 'DRY RUN (solo mostrar cambios)' : 'APLICAR CAMBIOS'}`);
    
    try {
      // Crear backup si no es dry run
      if (!this.config.dryRun) {
        await this.createBackup();
      }
      
      // Procesar archivos de código
      await this.processCodeFiles();
      
      // Renombrar archivos
      await this.renameFiles();
      
      // Mostrar resumen
      this.showSummary();
      
      console.log('✅ Proceso completado exitosamente');
      
    } catch (error) {
      console.error('❌ Error durante el proceso:', error);
      this.errors.push(error.message);
    }
  }

  async createBackup() {
    console.log('📦 Creando backup...');
    
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
    }
    
    // Backup de archivos que se van a renombrar
    for (const rename of this.config.fileRenames) {
      const sourcePath = path.join(this.config.projectRoot, rename.from);
      if (fs.existsSync(sourcePath)) {
        const backupPath = path.join(this.config.backupDir, path.basename(rename.from));
        fs.copyFileSync(sourcePath, backupPath);
        console.log(`  📄 Backup: ${rename.from} → ${backupPath}`);
      }
    }
  }

  async processCodeFiles() {
    console.log('🔍 Procesando archivos de código...');
    
    const filesToProcess = [
      'src/domain/entities/Channel.js',
      'src/infrastructure/repositories/M3UChannelRepository.js',
      'src/infrastructure/utils/M3UParser.js',
      'src/application/handlers/ChannelHandler.js'
    ];
    
    for (const filePath of filesToProcess) {
      const fullPath = path.join(this.config.projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        await this.processFile(fullPath);
      }
    }
  }

  async processFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let newContent = content;
      let changeCount = 0;
      
      // Aplicar reemplazos
      for (const replacement of this.config.replacements) {
        const matches = newContent.match(replacement.from);
        if (matches) {
          newContent = newContent.replace(replacement.from, replacement.to);
          changeCount += matches.length;
        }
      }
      
      if (changeCount > 0) {
        console.log(`  📝 ${path.relative(this.config.projectRoot, filePath)}: ${changeCount} cambios`);
        
        if (!this.config.dryRun) {
          fs.writeFileSync(filePath, newContent, 'utf8');
        }
        
        this.changes.push({
          file: filePath,
          changes: changeCount,
          type: 'content'
        });
      }
      
    } catch (error) {
      console.error(`❌ Error procesando ${filePath}:`, error.message);
      this.errors.push(`Error en ${filePath}: ${error.message}`);
    }
  }

  async renameFiles() {
    console.log('📁 Renombrando archivos...');
    
    for (const rename of this.config.fileRenames) {
      const fromPath = path.join(this.config.projectRoot, rename.from);
      const toPath = path.join(this.config.projectRoot, rename.to);
      
      if (fs.existsSync(fromPath)) {
        console.log(`  🔄 ${rename.from} → ${rename.to}`);
        
        if (!this.config.dryRun) {
          // Crear directorio destino si no existe
          const toDir = path.dirname(toPath);
          if (!fs.existsSync(toDir)) {
            fs.mkdirSync(toDir, { recursive: true });
          }
          
          // Renombrar archivo
          fs.renameSync(fromPath, toPath);
        }
        
        this.changes.push({
          from: fromPath,
          to: toPath,
          type: 'rename'
        });
      } else {
        console.warn(`⚠️  Archivo no encontrado: ${rename.from}`);
      }
    }
  }

  showSummary() {
    console.log('\n📊 RESUMEN DE CAMBIOS:');
    console.log('='.repeat(50));
    
    const contentChanges = this.changes.filter(c => c.type === 'content');
    const fileRenames = this.changes.filter(c => c.type === 'rename');
    
    console.log(`📝 Archivos modificados: ${contentChanges.length}`);
    contentChanges.forEach(change => {
      console.log(`  - ${path.relative(this.config.projectRoot, change.file)}: ${change.changes} cambios`);
    });
    
    console.log(`📁 Archivos renombrados: ${fileRenames.length}`);
    fileRenames.forEach(change => {
      console.log(`  - ${path.relative(this.config.projectRoot, change.from)} → ${path.relative(this.config.projectRoot, change.to)}`);
    });
    
    if (this.errors.length > 0) {
      console.log(`❌ Errores: ${this.errors.length}`);
      this.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (this.config.dryRun) {
      console.log('\n💡 Para aplicar los cambios, ejecuta el script con dryRun: false');
    } else {
      console.log('\n✅ Todos los cambios han sido aplicados');
      console.log(`📦 Backup disponible en: ${this.config.backupDir}`);
    }
  }
}

// Ejecutar script
const renamer = new ChannelToTvRenamer(config);
renamer.run().catch(console.error);