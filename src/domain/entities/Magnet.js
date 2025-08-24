import { z } from 'zod';

const MagnetSchema = z.object({
  imdb_id: z.string().regex(/^tt\d+$/),
  name: z.string(),
  magnet: z.string().startsWith('magnet:?xt=urn:btih:'),
  quality: z.string(),
  size: z.string(),
});

export class Magnet {
  constructor(data) {
    MagnetSchema.parse(data);
    Object.assign(this, data);
    Object.freeze(this);
  }
}