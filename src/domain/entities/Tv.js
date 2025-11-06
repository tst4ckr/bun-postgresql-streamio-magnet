/**
 * @fileoverview Tv - Entidad de dominio para canales de TV.
 * Representa un canal de televisión con sus propiedades y metadatos.
 */

/**
 * Entidad Tv que representa un canal de televisión.
 * Inmutable siguiendo principios de DDD.
 */
import { CONSTANTS } from '../../config/constants.js';

export class Tv {
  #id;
  #name;
  #streamUrl;
  #poster; // Renombrado de #logo a #poster
  #group;
  #tvgId;
  #tvgName;
  #description;
  #background;

  /**
   * @param {Object} tvData - Datos del canal
   * @param {string} tvData.id - ID único del canal
   * @param {string} tvData.name - Nombre del canal
   * @param {string} tvData.streamUrl - URL del stream M3U8
   * @param {string} [tvData.poster] - URL del póster del canal
   * @param {string} [tvData.group] - Grupo/categoría del canal
   * @param {string} [tvData.tvgId] - ID TVG del canal
   * @param {string} [tvData.tvgName] - Nombre TVG del canal
   * @param {string} [tvData.description] - Descripción del canal
   * @param {string} [tvData.background] - URL de la imagen de fondo del canal
   */
  constructor(tvData) {
    this.#validateTvData(tvData);
    
    this.#id = tvData.id;
    this.#name = tvData.name;
    this.#streamUrl = tvData.streamUrl;
    this.#poster = tvData.poster || null; // Renombrado de logo a poster
    this.#group = tvData.group || 'General';
    this.#tvgId = tvData.tvgId || null;
    this.#tvgName = tvData.tvgName || tvData.name;
    this.#description = tvData.description || null;
    this.#background = tvData.background || null;
    
    Object.freeze(this);
  }

  /**
   * Valida los datos del canal.
   * @private
   * @param {Object} tvData 
   * @throws {Error} Si los datos son inválidos
   */
  #validateTvData(tvData) {
    if (!tvData || typeof tvData !== 'object') {
      throw new Error('Tv data must be an object');
    }

    const requiredFields = ['id', 'name', 'streamUrl'];
    for (const field of requiredFields) {
      if (!tvData[field] || typeof tvData[field] !== 'string') {
        throw new Error(`Tv ${field} is required and must be a string`);
      }
    }

    if (!this.#isValidStreamUrl(tvData.streamUrl)) {
      throw new Error('Tv stream URL must be a valid HTTP/HTTPS URL');
    }
  }

  /**
   * Valida si la URL del stream es válida.
   * @private
   * @param {string} url 
   * @returns {boolean}
   */
  #isValidStreamUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Getters inmutables
  get id() { return this.#id; }
  get name() { return this.#name; }
  get streamUrl() { return this.#streamUrl; }
  get poster() { // Renombrado de logo a poster
    return this.#resolveImageUrl(this.#poster);
  }
  get group() { return this.#group; }
  get tvgId() { return this.#tvgId; }
  get tvgName() { return this.#tvgName; }
  get description() { return this.#description; }
  get background() {
    return this.#resolveImageUrl(this.#background);
  }

  /**
   * Resuelve una ruta de imagen, ya sea una URL completa o una ruta relativa.
   * @private
   * @param {string | null} path - La ruta de la imagen.
   * @returns {string | null} La URL completa de la imagen o null.
   */
  #resolveImageUrl(path) {
    if (!path) return null;

    // Comprueba si la ruta ya es una URL completa
    try {
      const url = new URL(path);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return path; // Es una URL válida y completa
      }
    } catch (e) {
      // No es una URL completa, se tratará como una ruta relativa
    }

    // Corrige errores comunes en la ruta, como 'logo/' en lugar de 'logos/'
    const correctedPath = path.replace('logo/', 'logos/');
    
    // Asume que es una ruta relativa y construye la URL completa
    const baseUrl = process.env.BASE_URL;

    // Si BASE_URL está definida, construye una URL absoluta.
    // Si no, construye una ruta relativa al servidor, ideal para proxies inversos.
    if (baseUrl) {
      return `${baseUrl}/static/${correctedPath}`;
    }

    return `/static/${correctedPath}`;
  }

  /**
   * Convierte el canal a formato de metadatos de catálogo de Stremio.
   * Este formato es más ligero y se usa en las listas de catálogos.
   * @returns {Object} Metadatos de catálogo en formato Stremio
   */
  toStremioCatalogMeta() {
    const description = this.#description || `Canal de TV en vivo: ${this.#name}. Disfruta de la mejor programación en la categoría ${this.#group}.`;

    return {
      id: this.#id,
      type: 'tv',
      name: this.#name,
      poster: this.poster || CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO, // Usar this.poster
      posterShape: 'landscape',
      genres: [this.#group],
      description: description
    };
  }

  /**
   * Convierte el canal a formato de Stremio.
   * @returns {Object} Metadatos en formato Stremio
   */
  toStremioMeta(typeOverride = 'tv') {
    const fallbackPoster = CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO;
    const poster = this.poster || fallbackPoster;
    const background = this.background || poster;
    const defaultVideoId = CONSTANTS.METADATA.TV_METADATA.DEFAULT_VIDEO_ID;
    const description = this.#description || `Transmisión en vivo del canal ${this.#name}. Categoría: ${this.#group}.`;

    return {
      id: this.#id,
      type: typeOverride || 'tv',
      name: this.#name,
      poster: poster,
      logo: poster, // Añadido para reutilizar el póster como logo
      background: background,
      genres: [this.#group],
      description: description,
      
      videos: [
        {
          id: defaultVideoId,
          title: this.#name,
          released: new Date().toISOString(),
          overview: this.#description || `Disfruta de la transmisión en vivo de ${this.#name}.`,
          available: true,
          streams: [this.toStremioStream()]
        }
      ],
      
      behaviorHints: {
        defaultVideoId
      }
    };
  }

  /**
   * Convierte el canal a formato de stream de Stremio.
   * @returns {Object} Stream en formato Stremio
   */
  toStremioStream() {
    return {
      name: this.#name,
      description: `Canal: ${this.#name}${this.#group ? ` (${this.#group})` : ''}`,
      url: this.#streamUrl,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: `tv-${this.#group}`,

      },
      isLive: true
    };
  }



  /**
   * Genera un ID único para el canal basado en su nombre.
   * @param {string} name - Nombre del canal
   * @returns {string} ID único generado
   */
  static generateId(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return `tv_invalid_${Date.now()}`;
    }
    
    const cleanName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');
    
    return cleanName ? `tv_${cleanName}` : `tv_unnamed_${Date.now()}`;
  }
}