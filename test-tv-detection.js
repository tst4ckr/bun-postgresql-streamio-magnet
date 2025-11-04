/**
 * Script de prueba para verificar la lógica de detección de canales de TV
 */

import { detectTvChannelFiles, ensureTvChannelsExist } from './src/infrastructure/utils/TvChannelGenerator.js';
import { addonConfig } from './src/config/addonConfig.js';
import { EnhancedLogger } from './src/infrastructure/utils/EnhancedLogger.js';

const logger = new EnhancedLogger('info', false, { errorOnly: false, minimalOutput: false });

async function testTvChannelDetection() {
  console.log('🔍 Probando detección de archivos de canales de TV...');
  
  try {
    // Verificar estado actual de archivos
    const fileStatus = detectTvChannelFiles(addonConfig);
    console.log('📊 Estado de archivos:', fileStatus);
    
    // Ejecutar la verificación completa
    const result = await ensureTvChannelsExist(addonConfig, logger);
    console.log('✅ Resultado de verificación:', result);
    
  } catch (error) {
    console.error('❌ Error en prueba:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
  }
}

testTvChannelDetection();