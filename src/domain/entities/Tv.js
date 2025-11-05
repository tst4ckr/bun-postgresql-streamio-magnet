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
  #logo;
  #group;
  #tvgId;
  #tvgName;

  /**
   * @param {Object} tvData - Datos del canal
   * @param {string} tvData.id - ID único del canal
   * @param {string} tvData.name - Nombre del canal
   * @param {string} tvData.streamUrl - URL del stream M3U8
   * @param {string} [tvData.logo] - URL del logo del canal
   * @param {string} [tvData.group] - Grupo/categoría del canal
   * @param {string} [tvData.tvgId] - ID TVG del canal
   * @param {string} [tvData.tvgName] - Nombre TVG del canal
   */
  constructor(tvData) {
    this.#validateTvData(tvData);
    
    this.#id = tvData.id;
    this.#name = tvData.name;
    this.#streamUrl = tvData.streamUrl;
    this.#logo = tvData.logo || null;
    this.#group = tvData.group || 'General';
    this.#tvgId = tvData.tvgId || null;
    this.#tvgName = tvData.tvgName || tvData.name;
    
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
  get logo() { return this.#logo; }
  get group() { return this.#group; }
  get tvgId() { return this.#tvgId; }
  get tvgName() { return this.#tvgName; }

  /**
   * Convierte el canal a formato de metadatos de Stremio.
   * @returns {Object} Metadatos en formato Stremio
   */
  toStremioMeta(typeOverride = 'tv') {
    const fallbackLogo = CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO;
    const poster = this.#logo || fallbackLogo;
    const defaultVideoId = CONSTANTS.METADATA.TV_METADATA.DEFAULT_VIDEO_ID;
    return {
      id: this.#id,
      type: typeOverride || 'tv',
      name: this.#name,
      poster: poster,
      // Include a videos array so Stremio can select a videoId (required for stream requests)
      videos: [
        {
          id: defaultVideoId,
          title: this.#name,
          released: new Date().toISOString(),
          overview: 'Live stream',
          available: true,
          streams: [this.toStremioStream()]
        }
      ],
      // Provide helpful behavior hints for Stremio clients
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
        proxyHeaders: {
          request: {
            'User-Agent': 'Stremio/4.4.142 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
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