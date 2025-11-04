/**
 * Utilidad para generación automática de canales de TV
 * Detecta si existen archivos M3U/CSV y genera canales si es necesario
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Detecta si los archivos de canales de TV existen
 * @param {Object} config - Configuración del addon
 * @returns {Object} Estado de existencia de archivos
 */
export function detectTvChannelFiles(config) {
  const tvOutputPath = join(process.cwd(), 'tv', 'output');
  const channelsM3uPath = join(tvOutputPath, 'channels.m3u');
  const tvCsvPath = join(tvOutputPath, 'tv.csv');
  
  return {
    channelsM3uExists: existsSync(channelsM3uPath),
    tvCsvExists: existsSync(tvCsvPath),
    channelsM3uPath,
    tvCsvPath,
    tvOutputPath
  };
}

/**
 * Ejecuta la generación de canales de TV usando la librería IPTV
 * @param {Object} logger - Logger para registrar el proceso
 * @returns {Promise<Object>} Resultado de la generación
 */
export async function generateTvChannels(logger) {
  try {
    logger.info('📺 Archivos de canales no encontrados, generando canales de TV...');
    
    // Importar dinámicamente el módulo de generación
    const { main } = await import('../../../../tv/src/main.js');
    
    logger.info('🔄 Ejecutando librería IPTV para generar canales...');
    
    // Ejecutar la generación
    const result = await main();
    
    if (result?.success) {
      logger.info('✅ Canales de TV generados exitosamente:', {
        csvFile: result.files?.csv,
        m3uFile: result.files?.m3u,
        metrics: result.metrics
      });
      
      return {
        success: true,
        files: result.files,
        metrics: result.metrics
      };
    } else {
      throw new Error('La generación de canales falló sin error específico');
    }
    
  } catch (error) {
    logger.error('❌ Error generando canales de TV:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verifica y genera canales de TV si es necesario
 * @param {Object} config - Configuración del addon
 * @param {Object} logger - Logger para registrar el proceso
 * @returns {Promise<Object>} Estado de los archivos de canales
 */
export async function ensureTvChannelsExist(config, logger) {
  logger.info('🔍 Verificando existencia de archivos de canales de TV...');
  
  const fileStatus = detectTvChannelFiles(config);
  
  logger.info('📊 Estado de archivos de canales:', {
    channelsM3uExists: fileStatus.channelsM3uExists,
    tvCsvExists: fileStatus.tvCsvExists,
    channelsM3uPath: fileStatus.channelsM3uPath,
    tvCsvPath: fileStatus.tvCsvPath
  });
  
  // Si alguno de los archivos no existe, generar canales
  if (!fileStatus.channelsM3uExists || !fileStatus.tvCsvExists) {
    logger.info('⚠️ Archivos de canales faltantes, procediendo a generar...');
    
    const generationResult = await generateTvChannels(logger);
    
    if (!generationResult.success) {
      throw new Error(`No se pudieron generar los canales de TV: ${generationResult.error}`);
    }
    
    // Verificar nuevamente después de la generación
    const newFileStatus = detectTvChannelFiles(config);
    
    if (!newFileStatus.channelsM3uExists || !newFileStatus.tvCsvExists) {
      throw new Error('Los archivos de canales no se generaron correctamente después de la ejecución');
    }
    
    logger.info('✅ Archivos de canales generados y verificados exitosamente');
    
    return {
      ...newFileStatus,
      generated: true,
      generationResult
    };
  }
  
  logger.info('✅ Archivos de canales existen, no es necesario generar');
  
  return {
    ...fileStatus,
    generated: false
  };
}