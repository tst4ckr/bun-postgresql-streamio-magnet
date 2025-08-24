import { z } from 'zod';

/**
 * @fileoverview TorrentResult Entity - Representa un resultado de búsqueda de torrent
 * Compatible con el formato de Stream de Stremio
 */

const TorrentResultSchema = z.object({
  title: z.string().min(1, 'El título no puede estar vacío'),
  infoHash: z.string().regex(/^[a-fA-F0-9]{40}$/, 'InfoHash debe ser hexadecimal de 40 caracteres'),
  magnetUrl: z.string().startsWith('magnet:?xt=urn:btih:', 'URL magnet inválida'),
  size: z.string().min(1, 'El tamaño no puede estar vacío'),
  quality: z.string().min(1, 'La calidad no puede estar vacía'),
  seeders: z.number().int().min(0).default(0),
  leechers: z.number().int().min(0).default(0),
  provider: z.string().min(1, 'El proveedor no puede estar vacío'),
  language: z.enum(['es', 'en', 'multi']).default('es'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 5).optional(),
  imdbId: z.string().regex(/^tt\d+$/).optional(),
  season: z.number().int().min(1).optional(),
  episode: z.number().int().min(1).optional(),
  uploadDate: z.date().optional(),
  verified: z.boolean().default(false)
});

export class TorrentResult {
  constructor(data) {
    const validated = TorrentResultSchema.parse(data);
    Object.assign(this, validated);
    Object.freeze(this);
  }

  /**
   * Convierte el resultado a formato de Stream de Stremio
   * @returns {Object} Stream object compatible con Stremio
   */
  toStremioStream() {
    const streamName = this.buildStreamName();
    const streamDescription = this.buildStreamDescription();

    return {
      name: streamName,
      description: streamDescription,
      infoHash: this.infoHash,
      sources: this.buildSources(),
      behaviorHints: {
        bingeGroup: `${this.provider}-${this.quality}`,
        countryWhitelist: this.language === 'es' ? ['esp', 'arg', 'mex', 'col'] : undefined
      }
    };
  }

  /**
   * Construye el nombre del stream para Stremio
   * @returns {string}
   */
  buildStreamName() {
    const parts = [];
    
    // Calidad
    parts.push(this.quality);
    
    // Tamaño
    parts.push(this.size);
    
    // Seeders si están disponibles
    if (this.seeders > 0) {
      parts.push(`👥${this.seeders}`);
    }
    
    // Verificado
    if (this.verified) {
      parts.push('✅');
    }
    
    // Proveedor
    parts.push(`[${this.provider}]`);
    
    return parts.join(' ');
  }

  /**
   * Construye la descripción del stream
   * @returns {string}
   */
  buildStreamDescription() {
    const parts = [this.title];
    
    if (this.year) {
      parts.push(`(${this.year})`);
    }
    
    if (this.season && this.episode) {
      parts.push(`S${this.season.toString().padStart(2, '0')}E${this.episode.toString().padStart(2, '0')}`);
    }
    
    if (this.language !== 'en') {
      parts.push(`[${this.language.toUpperCase()}]`);
    }
    
    return parts.join(' ');
  }

  /**
   * Construye las fuentes para el torrent
   * @returns {string[]}
   */
  buildSources() {
    const sources = [];
    
    // Agregar trackers comunes para mejorar conectividad
    const commonTrackers = [
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.opentrackr.org:1337',
      'udp://9.rarbg.to:2710',
      'udp://exodus.desync.com:6969'
    ];
    
    commonTrackers.forEach(tracker => {
      sources.push(`tracker:${tracker}`);
    });
    
    return sources;
  }

  /**
   * Calcula la puntuación de calidad del resultado
   * @returns {number} Puntuación de 0 a 100
   */
  getQualityScore() {
    let score = 0;
    
    // Puntuación por calidad
    const qualityScores = {
      '4K': 40,
      '1080p': 30,
      '720p': 20,
      'HD': 15,
      'SD': 5
    };
    score += qualityScores[this.quality] || 0;
    
    // Puntuación por seeders
    if (this.seeders > 100) score += 20;
    else if (this.seeders > 50) score += 15;
    else if (this.seeders > 10) score += 10;
    else if (this.seeders > 0) score += 5;
    
    // Puntuación por verificación
    if (this.verified) score += 15;
    
    // Puntuación por ratio seeders/leechers
    if (this.leechers > 0) {
      const ratio = this.seeders / this.leechers;
      if (ratio > 2) score += 10;
      else if (ratio > 1) score += 5;
    }
    
    // Penalización por fecha antigua (si está disponible)
    if (this.uploadDate) {
      const daysSinceUpload = (Date.now() - this.uploadDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpload > 365) score -= 10;
      else if (daysSinceUpload > 180) score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Verifica si el resultado es de alta calidad
   * @returns {boolean}
   */
  isHighQuality() {
    return this.getQualityScore() >= 70;
  }

  /**
   * Obtiene el identificador único del resultado
   * @returns {string}
   */
  getUniqueId() {
    return `${this.provider}_${this.infoHash}`;
  }
}