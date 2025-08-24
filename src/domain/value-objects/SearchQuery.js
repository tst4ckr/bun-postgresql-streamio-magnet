import { z } from 'zod';

/**
 * @fileoverview SearchQuery Value Object - Representa una consulta de búsqueda de torrents
 * Implementa principios DDD con inmutabilidad y validación
 */

const SearchQuerySchema = z.object({
  term: z.string().min(1, 'El término de búsqueda no puede estar vacío'),
  type: z.enum(['movie', 'series'], 'Tipo debe ser movie o series'),
  imdbId: z.string().regex(/^tt\d+$/, 'IMDB ID debe tener formato tt seguido de números').optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 5).optional(),
  quality: z.enum(['720p', '1080p', '4K', 'HD', 'SD']).optional(),
  language: z.enum(['es', 'en', 'multi']).default('es'),
  season: z.number().int().min(1).optional(),
  episode: z.number().int().min(1).optional()
});

export class SearchQuery {
  constructor(data) {
    const validated = SearchQuerySchema.parse(data);
    Object.assign(this, validated);
    Object.freeze(this);
  }

  /**
   * Crea una consulta de búsqueda para película
   * @param {string} term - Término de búsqueda
   * @param {Object} options - Opciones adicionales
   * @returns {SearchQuery}
   */
  static forMovie(term, options = {}) {
    return new SearchQuery({
      term,
      type: 'movie',
      ...options
    });
  }

  /**
   * Crea una consulta de búsqueda para serie
   * @param {string} term - Término de búsqueda
   * @param {Object} options - Opciones adicionales
   * @returns {SearchQuery}
   */
  static forSeries(term, options = {}) {
    return new SearchQuery({
      term,
      type: 'series',
      ...options
    });
  }

  /**
   * Obtiene el término de búsqueda normalizado
   * @returns {string}
   */
  getNormalizedTerm() {
    return this.term
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Verifica si es una búsqueda de episodio específico
   * @returns {boolean}
   */
  isEpisodeSearch() {
    return this.type === 'series' && this.season && this.episode;
  }

  /**
   * Obtiene el identificador único de la consulta para cache
   * @returns {string}
   */
  getCacheKey() {
    const parts = [this.term, this.type];
    if (this.imdbId) parts.push(this.imdbId);
    if (this.year) parts.push(this.year.toString());
    if (this.quality) parts.push(this.quality);
    if (this.language) parts.push(this.language);
    if (this.season) parts.push(`s${this.season}`);
    if (this.episode) parts.push(`e${this.episode}`);
    
    return parts.join('_').toLowerCase();
  }
}