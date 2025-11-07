/**
 * @fileoverview GenreService - Utilidades para parsear, normalizar y indexar géneros.
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';

/**
 * Divide una cadena de géneros por separadores comunes y normaliza cada entrada.
 * Acepta separadores: coma, barra '/', pipe '|', punto y coma ';'.
 * @param {string|undefined|null} rawGenres
 * @returns {string[]} Lista de géneros normalizados y únicos.
 */
export function parseGenres(rawGenres) {
  if (!rawGenres || typeof rawGenres !== 'string') return [];

  // Separar por múltiples delimitadores
  const parts = rawGenres
    .split(/[\/,|;]+/g)
    .flatMap(part => part.split(',')) // por si vienen comas mezcladas
    .map(s => s.trim())
    .filter(Boolean);

  // Normalizar y deduplicar
  const normalized = new Set(parts.map(normalizeGenre));
  return Array.from(normalized);
}

/**
 * Normaliza un género: elimina comillas, espacios repetidos y ajusta capitalización.
 * @param {string} g
 * @returns {string}
 */
export function normalizeGenre(g) {
  const cleaned = g
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalizar cada palabra, respetando caracteres acentuados
  return cleaned
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Construye un índice de géneros a partir de una lista de canales.
 * @param {Array<{id:string, name:string, genres?:string[], group?:string}>} tvs
 * @param {EnhancedLogger} logger
 * @returns {{uniqueGenres:string[], channelGenresMap:Map<string,string[]>}}
 */
export function buildGenreIndex(tvs = [], logger) {
  const channelGenresMap = new Map();
  const accumulator = new Set();

  for (const tv of tvs) {
    const genres = Array.isArray(tv.genres) && tv.genres.length > 0
      ? tv.genres
      : (tv.group ? parseGenres(tv.group) : []);

    channelGenresMap.set(tv.id, genres);
    for (const g of genres) accumulator.add(g);
  }

  const uniqueGenres = Array.from(accumulator).sort((a, b) => a.localeCompare(b));

  if (logger) {
    logger.debug('[Genres] Índice construido', {
      channels: tvs.length,
      uniqueGenresCount: uniqueGenres.length,
      sample: uniqueGenres.slice(0, 10)
    });
  }

  return { uniqueGenres, channelGenresMap };
}