import { z } from 'zod';

const MagnetSchema = z.object({
  content_id: z.string(),
  name: z.string(),
  magnet: z.string().startsWith('magnet:?xt=urn:btih:'),
  quality: z.string(),
  size: z.string(),
  // Campos opcionales para compatibilidad hacia atrás
  imdb_id: z.string().regex(/^tt\d+(?::\d+)?(?:\d+)?$/).optional(),
  id_type: z.enum(['imdb', 'tmdb', 'tvdb', 'kitsu', 'anilist', 'mal']).default('imdb').optional(),
  // Campos adicionales opcionales
  provider: z.string().optional(),
  filename: z.string().optional(),
  seeders: z.number().optional(),
  peers: z.number().optional(),
});

export class Magnet {
  constructor(data) {
    MagnetSchema.parse(data);
    Object.assign(this, data);
    Object.freeze(this);
  }
}