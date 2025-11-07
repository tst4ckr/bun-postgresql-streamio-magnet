/**
 * @fileoverview Tv - Entidad de dominio para canales de TV.
 * Representa un canal de televisión con sus propiedades y metadatos.
 */

/**
 * Entidad Tv que representa un canal de televisión.
 * Inmutable siguiendo principios de DDD.
 */
import { CONSTANTS } from '../../config/constants.js';
import { existsSync } from 'fs';
import path from 'path';

export class Tv {
  #id;
  #name;
  #streamUrl;
  #poster;
  #logo;
  #group;
  #genres;
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
   * @param {string} [tvData.logo] - URL del logo del canal
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
    this.#poster = tvData.poster || null;
    this.#logo = tvData.logo || null;
    this.#group = tvData.group || 'General';
    this.#genres = Array.isArray(tvData.genres) ? tvData.genres.slice() : (tvData.group ? [tvData.group] : ['General']);
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
  get poster() {
    return this.#resolveImageUrl(this.#poster);
  }
  get logo() {
    return this.#resolveImageUrl(this.#logo);
  }
  get group() { return this.#group; }
  get genres() { return this.#genres.slice(); }
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
    if (!path) {
      return undefined;
    }

    // Si ya es una URL absoluta, devolverla tal cual
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    // Corrige el path si es necesario, por ejemplo, de 'logo/' a 'logos/'.
    // Solo reemplazar si está al inicio para evitar duplicados como 'logos/logo/...'
    const correctedPath = path.replace(/^logo\//i, 'logos/');

    // Validar que el archivo exista en /static; si no existe, usar logo por defecto
    try {
      const relPath = correctedPath.replace(/^\//, '');
      const localStaticPath = path.join(process.cwd(), 'static', relPath);
      if (!existsSync(localStaticPath)) {
        // Intentar fallback entre carpetas 'logos' y 'poster' si existe el mismo archivo en la otra
        let altRelPath = null;
        if (/^logos\//i.test(relPath)) {
          altRelPath = relPath.replace(/^logos\//i, 'poster/');
        } else if (/^poster\//i.test(relPath)) {
          altRelPath = relPath.replace(/^poster\//i, 'logos/');
        }

        if (altRelPath) {
          const altLocalPath = path.join(process.cwd(), 'static', altRelPath);
          if (existsSync(altLocalPath)) {
            // Construir URL para el fallback encontrado
            if (process.env.BASE_URL) {
              return `${process.env.BASE_URL}/static/${altRelPath}`;
            }
            return `/static/${altRelPath}`;
          }
        }

        // Si no existe ni el original ni el alterno, usar logo por defecto
        return CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO;
      }
    } catch {
      // Si ocurre algún error al verificar, continuar sin bloquear y usar ruta por defecto
    }

    // Si BASE_URL está definida, construye una URL absoluta.
    if (process.env.BASE_URL) {
      return `${process.env.BASE_URL}/static/${correctedPath}`;
    }

    // Si no, devuelve una ruta relativa para desarrollo o entornos sin proxy.
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
      // Si no hay póster, usar el logo del canal como fallback. Si tampoco hay logo, usar el logo por defecto.
      poster: this.poster || this.logo || CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO,
      posterShape: 'landscape',
      genres: (this.#genres && this.#genres.length ? this.#genres : [this.#group]),
      description: description
    };
  }

  /**
   * Convierte el canal a formato de Stremio.
   * @returns {Object} Metadatos en formato Stremio
   */
  toStremioMeta(typeOverride = 'tv') {
    const fallbackPoster = CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO;
    // Resolver primero el logo: si no hay logo, usar el póster; si tampoco hay póster, usar el logo por defecto.
    const resolvedLogo = this.logo || this.poster || fallbackPoster;
    // Si no hay póster, usar el logo temporalmente.
    const poster = this.poster || resolvedLogo;
    // Si no hay background, usar el logo temporalmente.
    const background = this.background || resolvedLogo;
    const defaultVideoId = CONSTANTS.METADATA.TV_METADATA.DEFAULT_VIDEO_ID;
    const description = this.#description || `Transmisión en vivo del canal ${this.#name}. Categoría: ${this.#group}.`;

    return {
      id: this.#id,
      type: typeOverride || 'tv',
      name: this.#name,
      poster: poster,
      // Sugerir al cliente el formato del poster para una mejor presentación en catálogo
      posterShape: 'landscape',
      logo: resolvedLogo,
      background: background,
      genres: (this.#genres && this.#genres.length ? this.#genres : [this.#group]),
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