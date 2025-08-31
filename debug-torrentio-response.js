/**
 * Script para debuggear la respuesta de la API de Torrentio
 * y entender por qué aparece 'emule descargas' como nombre
 */

import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { EnhancedLogger } from './src/infrastructure/utils/EnhancedLogger.js';

const logger = new EnhancedLogger('debug', true);
const torrentioService = new TorrentioApiService(
  'https://torrentio.strem.fun',
  './data/torrentio.csv',
  logger
);

async function debugTorrentioResponse() {
  console.log('🔍 Debuggeando respuesta de API Torrentio para True Detective (tt2356777)\n');
  
  try {
    // Construir URL manualmente para ver la respuesta cruda
    const testId = 'tt2356777';
    const url = `https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad|sort=seeders|qualityfilter=scr,cam,unknown|limit=10|lang=spanish/stream/series/${testId}.json`;
    
    console.log('📡 URL de consulta:', url);
    console.log('\n⏳ Realizando consulta a la API...');
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('\n📊 Respuesta completa de la API:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.streams && data.streams.length > 0) {
      console.log('\n🎬 Análisis de streams encontrados:');
      data.streams.forEach((stream, index) => {
        console.log(`\n--- Stream ${index + 1} ---`);
        console.log('name:', stream.name);
        console.log('title:', stream.title);
        console.log('infoHash:', stream.infoHash);
        console.log('sources:', stream.sources?.slice(0, 3), '...');
        
        // Simular el procesamiento que hace nuestro código
        const streamName = stream.name || `Torrent ${stream.infoHash}`;
        const streamTitle = stream.title || '';
        
        console.log('\n🔧 Procesamiento interno:');
        console.log('streamName extraído:', streamName);
        console.log('streamTitle extraído:', streamTitle);
        
        // Simular buildFullStreamName con la nueva lógica
        let fullName;
        if (!streamTitle) {
          fullName = streamName;
        } else {
          const titleLines = streamTitle.split('\n');
          const firstLine = titleLines[0] || '';
          
          // Lista de nombres genéricos que no son útiles
          const genericNames = [
            'emule descargas',
            'torrent download',
            'download',
            'descargas',
            'torrentio'
          ];
          
          // Si la primera línea es genérica, buscar el nombre real en las siguientes líneas
          if (genericNames.some(generic => firstLine.toLowerCase().includes(generic.toLowerCase()))) {
            // Buscar líneas que contengan nombres de archivo (con extensiones)
            let foundName = null;
            for (let i = 1; i < titleLines.length; i++) {
              const line = titleLines[i].trim();
              // Buscar líneas que parezcan nombres de archivo
              if (line && (line.includes('.mkv') || line.includes('.mp4') || line.includes('.avi') || 
                          line.length > 20 && !line.includes('💾') && !line.includes('👤'))) {
                foundName = line;
                break;
              }
            }
            
            fullName = foundName || streamName;
          } else {
            // Si la primera línea no es genérica, usarla
            fullName = firstLine || streamName;
          }
        }
        
        console.log('fullName resultante:', fullName);
        console.log('---');
      });
    } else {
      console.log('\n❌ No se encontraron streams en la respuesta');
    }
    
  } catch (error) {
    console.error('\n❌ Error al consultar la API:', error);
  }
}

// Ejecutar el debug
debugTorrentioResponse();