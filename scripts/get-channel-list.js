#!/usr/bin/env node
/**
 * Script para obtener la lista de canales validados entregados a Stremio
 * Muestra los canales activos después de la validación
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from '../src/infrastructure/factories/ChannelRepositoryFactory.js';

async function getChannelList() {
  console.log('🔍 Obteniendo lista de canales validados entregados a Stremio...');
  
  try {
    // Inicializar configuración
    const config = new TVAddonConfig();
    
    // Configurar logger simple
    const logger = {
      info: (message, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args),
      warn: (message, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args),
      error: (message, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args),
      debug: (message, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args)
    };
    
    // Crear repositorio de canales
    const channelRepository = await ChannelRepositoryFactory.createRepository(config, logger);
    
    // Obtener todos los canales activos (filtrados automáticamente)
    const allChannels = await channelRepository.getAllChannels();
    
    console.log(`\n📊 Resumen de canales entregados a Stremio:`);
    console.log(`   • Total de canales activos: ${allChannels.length}`);
    
    // Agrupar por género
    const channelsByGenre = {};
    const channelsByCountry = {};
    const channelsByLanguage = {};
    
    allChannels.forEach(channel => {
      // Por género
      if (!channelsByGenre[channel.genre]) {
        channelsByGenre[channel.genre] = [];
      }
      channelsByGenre[channel.genre].push(channel);
      
      // Por país
      if (!channelsByCountry[channel.country]) {
        channelsByCountry[channel.country] = [];
      }
      channelsByCountry[channel.country].push(channel);
      
      // Por idioma
      if (!channelsByLanguage[channel.language]) {
        channelsByLanguage[channel.language] = [];
      }
      channelsByLanguage[channel.language].push(channel);
    });
    
    // Mostrar estadísticas por género
    console.log(`\n📺 Canales por género:`);
    Object.entries(channelsByGenre)
      .sort(([,a], [,b]) => b.length - a.length)
      .forEach(([genre, channels]) => {
        console.log(`   • ${genre}: ${channels.length} canales`);
      });
    
    // Mostrar estadísticas por país
    console.log(`\n🌍 Canales por país:`);
    Object.entries(channelsByCountry)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 10) // Top 10 países
      .forEach(([country, channels]) => {
        console.log(`   • ${country}: ${channels.length} canales`);
      });
    
    // Mostrar estadísticas por idioma
    console.log(`\n🗣️ Canales por idioma:`);
    Object.entries(channelsByLanguage)
      .sort(([,a], [,b]) => b.length - a.length)
      .forEach(([language, channels]) => {
        console.log(`   • ${language}: ${channels.length} canales`);
      });
    
    // Mostrar algunos canales de ejemplo
    console.log(`\n📋 Ejemplos de canales activos (primeros 10):`);
    allChannels.slice(0, 10).forEach((channel, index) => {
      console.log(`   ${index + 1}. ${channel.name} (${channel.genre}) - ${channel.country} [${channel.language}]`);
    });
    
    // Información sobre paginación en Stremio
    console.log(`\n📄 Información de paginación para Stremio:`);
    const pageSize = 20;
    const totalPages = Math.ceil(allChannels.length / pageSize);
    console.log(`   • Tamaño de página: ${pageSize} canales`);
    console.log(`   • Total de páginas: ${totalPages}`);
    console.log(`   • Primera página (skip=0): ${Math.min(pageSize, allChannels.length)} canales`);
    
    // Verificar configuración de filtrado
    console.log(`\n⚙️ Configuración de filtrado activa:`);
    console.log(`   • Eliminar streams inválidos: ${config.validation.removeInvalidStreams ? 'SÍ' : 'NO'}`);
    console.log(`   • Validación automática al inicio: ${config.validation.validateStreamsOnStartup ? 'SÍ' : 'NO'}`);
    console.log(`   • Países permitidos: ${config.filters.allowedCountries?.join(', ') || 'Todos'}`);
    console.log(`   • Idiomas soportados: ${config.filters.supportedLanguages?.join(', ') || 'Todos'}`);
    console.log(`   • Canales adultos: ${config.streaming.enableAdultChannels ? 'Habilitados' : 'Deshabilitados'}`);
    
    console.log(`\n✅ Lista de canales obtenida exitosamente`);
    
  } catch (error) {
    console.error('❌ Error obteniendo lista de canales:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Ejecutar directamente
getChannelList().catch(console.error);

export { getChannelList };