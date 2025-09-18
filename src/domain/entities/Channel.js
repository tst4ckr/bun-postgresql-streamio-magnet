/**
 * @fileoverview Channel - Entidad de dominio para canales de TV.
 * Representa un canal de televisión con sus propiedades y metadatos.
 */

/**
 * Entidad Channel que representa un canal de televisión.
 * Inmutable siguiendo principios de DDD.
 */
export class Channel {
  #id;
  #name;
  #streamUrl;
  #logo;
  #group;
  #tvgId;
  #tvgName;

  /**
   * @param {Object} channelData - Datos del canal
   * @param {string} channelData.id - ID único del canal
   * @param {string} channelData.name - Nombre del canal
   * @param {string} channelData.streamUrl - URL del stream M3U8
   * @param {string} [channelData.logo] - URL del logo del canal
   * @param {string} [channelData.group] - Grupo/categoría del canal
   * @param {string} [channelData.tvgId] - ID TVG del canal
   * @param {string} [channelData.tvgName] - Nombre TVG del canal
   */
  constructor(channelData) {
    this.#validateChannelData(channelData);
    
    this.#id = channelData.id;
    this.#name = channelData.name;
    this.#streamUrl = channelData.streamUrl;
    this.#logo = channelData.logo || null;
    this.#group = channelData.group || 'General';
    this.#tvgId = channelData.tvgId || null;
    this.#tvgName = channelData.tvgName || channelData.name;
    
    Object.freeze(this);
  }

  /**
   * Valida los datos del canal.
   * @private
   * @param {Object} channelData 
   * @throws {Error} Si los datos son inválidos
   */
  #validateChannelData(channelData) {
    if (!channelData || typeof channelData !== 'object') {
      throw new Error('Channel data must be an object');
    }

    if (!channelData.id || typeof channelData.id !== 'string') {
      throw new Error('Channel ID is required and must be a string');
    }

    if (!channelData.name || typeof channelData.name !== 'string') {
      throw new Error('Channel name is required and must be a string');
    }

    if (!channelData.streamUrl || typeof channelData.streamUrl !== 'string') {
      throw new Error('Channel stream URL is required and must be a string');
    }

    if (!this.#isValidStreamUrl(channelData.streamUrl)) {
      throw new Error('Channel stream URL must be a valid HTTP/HTTPS URL');
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
      id: `tv_${this.#id}`,
      type: 'tv',
      name: this.#name,
      poster: this.#logo,
      posterShape: 'landscape',
      background: this.#logo,
      description: `Canal de TV: ${this.#name}${this.#group ? ` (${this.#group})` : ''}`,
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
        defaultVideoId: 'live',
        hasScheduledVideos: false
      }
    };
  }

  /**
   * Convierte el canal a formato de stream de Stremio.
   * @returns {Object} Stream en formato Stremio
   */
  toStremioStream() {
    return {
      name: `📺 ${this.#name}`,
      description: `Canal en vivo: ${this.#name}${this.#group ? ` (${this.#group})` : ''}`,
      url: this.#streamUrl,
      behaviorHints: {
        notWebReady: false,
        bingeGroup: `tv-${this.#group}`,
        countryWhitelist: ['ES', 'AD'],
        proxyHeaders: {
          request: {},
          response: {}
        }
      }
    };
  }

  /**
   * Crea una nueva instancia de Channel con datos actualizados.
   * @param {Object} updates - Datos a actualizar
   * @returns {Channel} Nueva instancia con datos actualizados
   */
  withUpdates(updates) {
    return new Channel({
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
   * Crea una instancia de Channel desde un objeto plano.
   * @param {Object} plainObject - Objeto plano con datos del canal
   * @returns {Channel} Nueva instancia de Channel
   */
  static fromPlainObject(plainObject) {
    return new Channel(plainObject);
  }

  /**
   * Genera un ID único para el canal basado en su nombre y grupo.
   * @param {string} name - Nombre del canal
   * @param {string} [group] - Grupo del canal
   * @returns {string} ID único generado
   */
  static generateId(name, group = 'General') {
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const cleanGroup = group.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return `ch_${cleanGroup}_${cleanName}`;
  }
}