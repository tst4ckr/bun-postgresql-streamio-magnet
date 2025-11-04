/**
 * Script de depuración para la función detectTvChannelFiles
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { addonConfig } from './src/config/addonConfig.js';

function debugDetectTvChannelFiles(config) {
  console.log('🔍 Debug: detectTvChannelFiles');
  console.log('process.cwd():', process.cwd());
  
  const tvOutputPath = join(process.cwd(), 'tv', 'output');
  console.log('tvOutputPath:', tvOutputPath);
  
  const channelsM3uPath = join(tvOutputPath, 'channels.m3u');
  const tvCsvPath = join(tvOutputPath, 'tv.csv');
  
  console.log('channelsM3uPath:', channelsM3uPath);
  console.log('tvCsvPath:', tvCsvPath);
  
  console.log('existsSync(channelsM3uPath):', existsSync(channelsM3uPath));
  console.log('existsSync(tvCsvPath):', existsSync(tvCsvPath));
  
  return {
    channelsM3uExists: existsSync(channelsM3uPath),
    tvCsvExists: existsSync(tvCsvPath),
    channelsM3uPath,
    tvCsvPath,
    tvOutputPath
  };
}

const result = debugDetectTvChannelFiles(addonConfig);
console.log('Resultado final:', result);