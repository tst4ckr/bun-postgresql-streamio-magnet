/**
 * @fileoverview Tv - Entidad de dominio para canales de TV.
 * Representa un canal de televisión con sus propiedades y metadatos.
 */

/**
 * Entidad Tv que representa un canal de televisión.
 * Inmutable siguiendo principios de DDD.
 */
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

    if (!tvData.id || typeof tvData.id !== 'string') {
      throw new Error('Tv ID is required and must be a string');
    }

    if (!tvData.name || typeof tvData.name !== 'string') {
      throw new Error('Tv name is required and must be a string');
    }

    if (!tvData.streamUrl || typeof tvData.streamUrl !== 'string') {
      throw new Error('Tv stream URL is required and must be a string');
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
  toStremioMeta() {
    return {
      id: this.#id,
      type: 'tv',
      name: this.#name,
      poster: this.#logo,
      posterShape: 'landscape',
      background: this.#logo,
      description: `Canal: ${this.#name}${this.#group ? ` (${this.#group})` : ''}`,
      genre: [this.#group],
      runtime: 'Live TV',
      released: new Date().getFullYear().toString(),
      imdbRating: null,
      cast: [],
      director: [],
      writer: [],
      country: 'ES',
      language: 'es',
      awards: null,
      website: null,
      behaviorHints: {
        defaultVideoId: this.#id,
        hasScheduledVideos: false
      }
    };
  }

  /**
   * Convierte el canal a formato de stream de Stremio.
   * @returns {Object} Stream en formato Stremio
   */
  toStremioStream() {
    const behaviorHints = {
      // Forzar `notWebReady: true` para usar siempre el servidor de streaming de Stremio.
      // Esto mejora la compatibilidad con HLS y otros formatos, y evita problemas de CORS.
      notWebReady: true,
      bingeGroup: `tv-${this.#group}`,
      // Las cabeceras de proxy son seguras aquí porque notWebReady es true.
      proxyHeaders: {
        request: {
          'User-Agent': 'Stremio/4.4.0'
        }
      }
    };

    return {
      name: `📺 ${this.#name}`,
      title: `Canal en vivo: ${this.#name}`,
      description: `Grupo: ${this.#group || 'General'}`,
      url: this.#streamUrl,
      behaviorHints: behaviorHints
    };
  }

  /**
   * Crea una nueva instancia de Tv con datos actualizados.
   * @param {Object} updates - Datos a actualizar
   * @returns {Tv} Nueva instancia con datos actualizados
   */
  withUpdates(updates) {
    return new Tv({
      id: this.#id,
      name: this.#name,
      streamUrl: this.#streamUrl,
      logo: this.#logo,
      group: this.#group,
      tvgId: this.#tvgId,
      tvgName: this.#tvgName,
      ...updates
    });
  }

  /**
   * Convierte el canal a objeto plano.
   * @returns {Object} Representación en objeto plano
   */
  toPlainObject() {
    return {
      id: this.#id,
      name: this.#name,
      streamUrl: this.#streamUrl,
      logo: this.#logo,
      group: this.#group,
      tvgId: this.#tvgId,
      tvgName: this.#tvgName
    };
  }

  /**
   * Crea una instancia de Tv desde un objeto plano.
   * @param {Object} plainObject - Objeto plano con datos del canal
   * @returns {Tv} Nueva instancia de Tv
   */
  static fromPlainObject(plainObject) {
    return new Tv(plainObject);
  }

  /**
   * Genera un ID único para el canal basado en su nombre.
   * @param {string} name - Nombre del canal
   * @returns {string} ID único generado
   */
  static generateId(name) {
    if (!name || typeof name !== 'string') {
      return `tv_invalid_${Date.now()}`;
    }
    const cleanName = name
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');
    
    return `tv_${cleanName}`;
  }
}