/**
 * Generador simple de poster para pruebas visuales
 * Uso: node tv/src/tools/generate_sample_poster.js "Nombre del Canal" [id]
 */
import ArtworkGenerationService from '../services/ArtworkGenerationService.js';

async function main() {
  const name = (process.argv[2] || 'PANAMERICAN').trim();
  const id = (process.argv[3] || 'tv_panamerican').trim();
  const svc = new ArtworkGenerationService();
  await svc.ensurePosterDirectory();
  const out = await svc.generateChannelPoster(name, id, { shape: 'poster' });
  console.log('Poster generado en:', out);
}

main().catch(err => {
  console.error('Error generando poster de prueba:', err);
  process.exit(1);
});