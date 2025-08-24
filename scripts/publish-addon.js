#!/usr/bin/env node

/**
 * @fileoverview Script para publicar el addon de TV IPTV en Stremio Central
 * Utiliza la función publishToCentral del SDK oficial de Stremio
 */

import { publishToCentral } from 'stremio-addon-sdk';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';

/**
 * Clase para manejar la publicación del addon
 */
class AddonPublisher {
  constructor() {
    this.config = TVAddonConfig.getInstance();
    this.logger = console;
  }

  /**
   * Publica el addon en Stremio Central
   * @param {string} publicUrl - URL pública del manifest.json
   */
  async publishAddon(publicUrl) {
    try {
      this.logger.info('🚀 Iniciando publicación del addon en Stremio Central...');
      this.logger.info(`📡 URL del manifest: ${publicUrl}`);
      
      // Validar URL
      if (!this.#isValidUrl(publicUrl)) {
        throw new Error('URL inválida. Debe ser una URL HTTPS válida.');
      }

      // Verificar que el manifest sea accesible
      await this.#validateManifestAccess(publicUrl);

      // Publicar en Stremio Central
      this.logger.info('📤 Enviando addon a Stremio Central...');
      await publishToCentral(publicUrl);

      this.logger.info('✅ ¡Addon publicado exitosamente en Stremio Central!');
      this.logger.info('📺 Los usuarios podrán encontrarlo en "Community Addons"');
      this.logger.info('🔗 Deep link para instalación directa:');
      this.logger.info(`   stremio://${publicUrl.replace('https://', '')}`);
      
    } catch (error) {
      this.logger.error('❌ Error publicando addon:', error.message);
      this.logger.error('💡 Asegúrate de que:');
      this.logger.error('   - El addon esté desplegado y accesible públicamente');
      this.logger.error('   - La URL use HTTPS');
      this.logger.error('   - El manifest.json sea válido');
      process.exit(1);
    }
  }

  /**
   * Valida que la URL sea válida
   * @private
   * @param {string} url 
   * @returns {boolean}
   */
  #isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Valida que el manifest sea accesible
   * @private
   * @param {string} url 
   */
  async #validateManifestAccess(url) {
    try {
      this.logger.info('🔍 Validando acceso al manifest...');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const manifest = await response.json();
      
      // Validar estructura básica del manifest
      if (!manifest.id || !manifest.version || !manifest.name) {
        throw new Error('Manifest inválido: faltan campos requeridos');
      }

      this.logger.info(`✅ Manifest válido: ${manifest.name} v${manifest.version}`);
      
    } catch (error) {
      throw new Error(`No se puede acceder al manifest: ${error.message}`);
    }
  }

  /**
   * Muestra información del addon
   */
  showAddonInfo() {
    const manifest = this.config.generateManifest();
    
    this.logger.info('📋 Información del Addon:');
    this.logger.info(`   ID: ${manifest.id}`);
    this.logger.info(`   Nombre: ${manifest.name}`);
    this.logger.info(`   Versión: ${manifest.version}`);
    this.logger.info(`   Descripción: ${manifest.description}`);
    this.logger.info(`   Tipos soportados: ${manifest.types.join(', ')}`);
    this.logger.info(`   Recursos: ${manifest.resources.join(', ')}`);
    this.logger.info(`   Catálogos: ${manifest.catalogs.length}`);
  }
}

/**
 * Función principal
 */
async function main() {
  const publisher = new AddonPublisher();
  
  // Mostrar información del addon
  publisher.showAddonInfo();
  
  // Obtener URL del manifest desde argumentos
  const publicUrl = process.argv[2];
  
  if (!publicUrl) {
    console.error('❌ Error: Debes proporcionar la URL pública del manifest.json');
    console.error('💡 Uso: bun run scripts/publish-addon.js https://tu-dominio.com/manifest.json');
    console.error('');
    console.error('📝 Ejemplos de URLs válidas:');
    console.error('   https://mi-addon.beamup.dev/manifest.json');
    console.error('   https://mi-addon.vercel.app/manifest.json');
    console.error('   https://mi-addon.railway.app/manifest.json');
    process.exit(1);
  }

  // Publicar addon
  await publisher.publishAddon(publicUrl);
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}

export { AddonPublisher };
