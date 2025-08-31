import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { Logger } from './src/infrastructure/logger/Logger.js';

const logger = new Logger();
const torrentioService = new TorrentioApiService(logger);

console.log('🔍 Probando True Detective (tt2356777)...');

try {
  const magnets = await torrentioService.searchMagnets('tt2356777', 'series');
  
  if (magnets && magnets.length > 0) {
    console.log(`✅ Encontrados ${magnets.length} magnets para True Detective`);
    
    // Mostrar los primeros 3 resultados
    magnets.slice(0, 3).forEach((magnet, index) => {
      console.log(`\n--- Magnet ${index + 1} ---`);
      console.log(`📝 Nombre: ${magnet.name}`);
      console.log(`🎥 Calidad: ${magnet.quality}`);
      console.log(`📦 Tamaño: ${magnet.size}`);
      console.log(`🌱 Seeders: ${magnet.seeders}`);
    });
  } else {
    console.log('❌ No se encontraron magnets');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}

console.log('\n🔍 Verificando archivo torrentio.csv...');
try {
  const fs = await import('fs');
  const csvContent = fs.readFileSync('./data/torrentio.csv', 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.includes('tt2356777'));
  
  console.log(`📄 Encontradas ${lines.length} entradas para tt2356777 en torrentio.csv`);
  
  if (lines.length > 0) {
    console.log('\n📋 Primeras 3 entradas:');
    lines.slice(0, 3).forEach((line, index) => {
      const parts = line.split(',');
      if (parts.length >= 2) {
        console.log(`${index + 1}. Nombre: ${parts[1]}`);
      }
    });
  }
} catch (error) {
  console.error('❌ Error leyendo CSV:', error.message);
}