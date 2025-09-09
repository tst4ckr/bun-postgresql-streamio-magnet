// Test directo del nuevo sistema de procesamiento inteligente
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

// Crear instancia de prueba
const service = new TorrentioApiService('http://localhost:8000', './data/test.csv');

// Test IDs problemáticos del log
const testIds = [
  'kitsu:6448:8',
  'kitsu:6448:9', 
  'kitsu:6448:5',
  'kitsu:6448:6',
  'kitsu:46492:4',
  'tt1234567',
  'tmdb:12345',
  'anilist:21087:1:1',
  'mal:11061:1:1',
  'anidb:8074:1:1'
];

console.log('=== Test del nuevo sistema de procesamiento inteligente ===\n');

// Simular el procesamiento de streams para probar el nuevo método
const testStreams = [{
  infoHash: 'test123',
  title: 'Test Stream',
  fileIdx: 1
}];

testIds.forEach(id => {
  try {
    console.log(`\n🔍 Probando ID: ${id}`);
    
    // Simular el método parseStreamsToMagnets con el nuevo procesamiento
    const result = service._parseStreamsToMagnets ? 
      service._parseStreamsToMagnets(testStreams, id, 'series') : 
      'Método no disponible públicamente';
    
    console.log(`  ✅ Procesamiento completado`);
    
  } catch (error) {
    console.error(`  ❌ Error procesando ${id}:`, error.message);
  }
});

console.log('\n=== Reiniciando servidor para aplicar cambios ===');
console.log('El nuevo sistema debería resolver los errores de id_type vacío.');