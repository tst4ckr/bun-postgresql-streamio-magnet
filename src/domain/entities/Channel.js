/**
 * @fileoverview Channel Entity - Representa un canal de TV
 * Implementa los principios de DDD con identidad única y invariantes de negocio
 */

import { StreamQuality } from '../value-objects/StreamQuality.js';

export class Channel {
  static TYPES = {
    TV: 'tv'
  };

  static GENRES = {
    NEWS: 'News',
    SPORTS: 'Sports', 
    ENTERTAINMENT: 'Entertainment',
    MUSIC: 'Music',
    MOVIES: 'Movies',
    KIDS: 'Kids',
    DOCUMENTARY: 'Documentary',
    GENERAL: 'General'
  };

  /**
   * @private
   */
  #id;
  #name;
  #logo;
  #streamUrl;
  #genre;
  #country;
  #language;
  #quality;
  #type;
  #isActive;
  #lastValidated;
  #metadata;

  /**
   * @param {Object} params - Parámetros del canal
   * @param {string} params.id - ID único del canal
   * @param {string} params.name - Nombre del canal
   * @param {string} params.logo - URL del logo
   * @param {string} params.streamUrl - URL del stream
   * @param {string} params.genre - Género del canal
   * @param {string} params.country - País del canal
   * @param {string} params.language - Idioma del canal
   * @param {string|StreamQuality} params.quality - Calidad del stream
   * @param {string} params.type - Tipo de contenido ('tv' o 'channel')
   * @param {boolean} params.isActive - Si el canal está activo
   * @param {Object} params.metadata - Metadatos adicionales
   */
  constructor({
    id,
    name,
    logo,
    streamUrl,
    genre = Channel.GENRES.GENERAL,
    country = 'Internacional',
    language = 'es',
    quality = StreamQuality.QUALITIES.AUTO,
    type = Channel.TYPES.TV,
    isActive = true,
    metadata = {}
  }) {
    this.#validateRequiredFields({ id, name, streamUrl });
    this.#validateBusinessRules({ id, name, streamUrl, type, genre });

    this.#id = id;
    this.#name = name;
    this.#logo = logo;
    this.#streamUrl = streamUrl;
    this.#genre = genre;
    this.#country = country;
    this.#language = language;
    this.#quality = quality instanceof StreamQuality ? quality : StreamQuality.fromString(quality);
    this.#type = type;
    this.#isActive = isActive;
    this.#lastValidated = null;
    this.#metadata = { ...metadata };

    Object.freeze(this.#metadata);
  }

  /**
   * Valida campos requeridos
   * @private
   */
  #validateRequiredFields({ id, name, streamUrl }) {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('El ID del canal es requerido y debe ser una cadena no vacía');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('El nombre del canal es requerido y debe ser una cadena no vacía');
    }

    if (!streamUrl || typeof streamUrl !== 'string' || streamUrl.trim().length === 0) {
      throw new Error('La URL del stream es requerida y debe ser una cadena no vacía');
    }
  }

  /**
   * Valida reglas de negocio
   * @private
   */
  #validateBusinessRules({ id, name, streamUrl, type, genre }) {
    // Validar formato del ID
    if (!this.#isValidChannelId(id)) {
      throw new Error('El ID del canal debe tener el formato correcto (tv_ o ch_ seguido de caracteres válidos)');
    }

    // Validar URL del stream
    if (!this.#isValidStreamUrl(streamUrl)) {
      throw new Error('La URL del stream no tiene un formato válido');
    }

    // Validar tipo
    if (type !== Channel.TYPES.TV) {
      throw new Error(`Tipo de canal inválido: ${type}. Debe ser: ${Channel.TYPES.TV}`);
    }

    // Validar género
    if (!Object.values(Channel.GENRES).includes(genre)) {
      throw new Error(`Género inválido: ${genre}. Valores válidos: ${Object.values(Channel.GENRES).join(', ')}`);
    }

    // Validar longitud del nombre
    if (name.length > 100) {
      throw new Error('El nombre del canal no puede exceder 100 caracteres');
    }
  }

  /**
   * Valida formato del ID del canal
   * @private
   * @param {string} id 
   * @returns {boolean}
   */
  #isValidChannelId(id) {
    const channelIdPattern = /^tv_[a-zA-Z0-9_-]+$/;
    return channelIdPattern.test(id);
  }

  /**
   * Valida formato de URL del stream
   * @private
   * @param {string} url 
   * @returns {boolean}
   */
  #isValidStreamUrl(url) {
    try {
      const urlObj = new URL(url);
      const validProtocols = ['http:', 'https:', 'rtmp:', 'rtmps:'];
      const validExtensions = ['.m3u8', '.m3u', '.ts'];
      
      return validProtocols.includes(urlObj.protocol) ||
             validExtensions.some(ext => url.toLowerCase().includes(ext)) ||
             url.toLowerCase().includes('stream');
    } catch {
      return false;
    }
  }

  // Getters - Propiedades inmutables
  get id() { return this.#id; }
  get name() { return this.#name; }
  get logo() { return this.#logo; }
  get streamUrl() { return this.#streamUrl; }
  get genre() { return this.#genre; }
  get country() { return this.#country; }
  get language() { return this.#language; }
  get quality() { return this.#quality; }
  get type() { return this.#type; }
  get isActive() { return this.#isActive; }
  get lastValidated() { return this.#lastValidated; }
  get metadata() { return { ...this.#metadata }; }

  /**
   * Verifica si el stream es válido basado en la URL
   * @returns {boolean}
   */
  isValidStream() {
    if (!this.#streamUrl || !this.#isActive) {
      return false;
    }

    return this.#streamUrl.includes('.m3u8') || 
           this.#streamUrl.startsWith('rtmp://') ||
           this.#streamUrl.startsWith('rtmps://') ||
           this.#streamUrl.includes('stream') ||
           this.#streamUrl.startsWith('https://');
  }

  /**
   * Verifica si el canal es HD
   * @returns {boolean}
   */
  isHighDefinition() {
    return this.#quality.isHighDefinition();
  }

  /**
   * Genera un nuevo canal con stream actualizado
   * @param {string} newStreamUrl 
   * @returns {Channel} Nueva instancia con stream actualizado
   */
  withUpdatedStream(newStreamUrl) {
    return new Channel({
      id: this.#id,
      name: this.#name,
      logo: this.#logo,
      streamUrl: newStreamUrl,
      genre: this.#genre,
      country: this.#country,
      language: this.#language,
      quality: this.#quality,
      type: this.#type,
      isActive: this.#isActive,
      metadata: this.#metadata
    });
  }

  /**
   * Marca el canal como validado
   * @returns {Channel} Nueva instancia con timestamp de validación
   */
  markAsValidated() {
    const newChannel = new Channel({
      id: this.#id,
      name: this.#name,
      logo: this.#logo,
      streamUrl: this.#streamUrl,
      genre: this.#genre,
      country: this.#country,
      language: this.#language,
      quality: this.#quality,
      type: this.#type,
      isActive: this.#isActive,
      metadata: this.#metadata
    });
    
    newChannel.#lastValidated = new Date();
    return newChannel;
  }

  /**
   * Desactiva el canal
   * @returns {Channel} Nueva instancia desactivada
   */
  deactivate() {
    return new Channel({
      id: this.#id,
      name: this.#name,
      logo: this.#logo,
      streamUrl: this.#streamUrl,
      genre: this.#genre,
      country: this.#country,
      language: this.#language,
      quality: this.#quality,
      type: this.#type,
      isActive: false,
      metadata: this.#metadata
    });
  }

  /**
   * Convierte a meta preview para catálogos de Stremio
   * @returns {Object}
   */
  toMetaPreview() {
    return {
      id: this.#id,
      type: this.#type,
      name: this.#name,
      poster: this.#logo || process.env.FALLBACK_LOGO,
      posterShape: 'square',
      genres: [this.#genre],
      description: `Canal ${this.#name} - ${this.#country}`,
      releaseInfo: this.#country,
      links: [
        {
          name: this.#genre,
          category: 'genre',
          url: `stremio:///discover/catalog/${this.#type}/${this.#genre}`
        }
      ]
    };
  }

  /**
   * Convierte a meta completo para detalles de Stremio
   * @returns {Object}
   */
  toMetaDetail() {
    return {
      id: this.#id,
      type: this.#type,
      name: this.#name,
      poster: this.#logo || process.env.FALLBACK_LOGO,
      posterShape: 'square',
      background: this.#logo,
      genres: [this.#genre],
      description: `Canal de ${this.#genre} en ${this.#language.toUpperCase()} desde ${this.#country}. Calidad: ${this.#quality.value}`,
      country: this.#country,
      language: this.#language,
      runtime: 'En vivo',
      releaseInfo: this.#country,
      links: [
        {
          name: this.#genre,
          category: 'genre',
          url: `stremio:///discover/catalog/${this.#type}/${this.#genre}`
        },
        {
          name: this.#country,
          category: 'country',
          url: `stremio:///discover/catalog/${this.#type}/${this.#country}`
        }
      ],
      behaviorHints: {
        defaultVideoId: this.#id
      }
    };
  }

  /**
   * Convierte a stream optimizado para Stremio TV
   * @returns {Object}
   */
  toStream() {
    const stream = {
      name: `${this.#name} (${this.#quality.value})`,
      description: `${this.#genre} • ${this.#country} • ${this.#language.toUpperCase()}`,
      url: this.#streamUrl
    };

    // Configurar hints de comportamiento para TV en vivo
    const behaviorHints = {};

    // Para streams RTMP o no-HTTPS (común en IPTV)
    if (this.#streamUrl.startsWith('rtmp') || 
        this.#streamUrl.startsWith('http://') || 
        !this.#streamUrl.startsWith('https://')) {
      behaviorHints.notWebReady = true;
    }

    // Restricciones geográficas básicas
    const allowedCountries = process.env.ALLOWED_COUNTRIES?.split(',').map(c => c.trim().toLowerCase());
    if (allowedCountries?.length > 0) {
      behaviorHints.countryWhitelist = allowedCountries;
    }

    // Agregar behaviorHints si hay configuraciones
    if (Object.keys(behaviorHints).length > 0) {
      stream.behaviorHints = behaviorHints;
    }

    return stream;
  }

  /**
   * Genera ID único para canal
   * @static
   * @param {string} name - Nombre del canal
   * @param {string} type - Tipo de canal
   * @returns {string}
   */
  static generateId(name, type = Channel.TYPES.TV) {
    const prefix = 'tv_';
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    
    return `${prefix}${sanitized}`;
  }

  /**
   * Mapea géneros del español al inglés estándar de Stremio
   * @static
   * @private
   * @param {string} genre 
   * @returns {string}
   */
  static #mapGenreToStandard(genre) {
    const genreMap = {
      'Noticias': 'News',
      'Deportes': 'Sports',
      'Entretenimiento': 'Entertainment',
      'Música': 'Music',
      'Películas': 'Movies',
      'Infantil': 'Kids',
      'Documentales': 'Documentary',
      'General': 'General'
    };

    return genreMap[genre] || genre;
  }

  /**
   * Crea instancia desde datos CSV
   * @static
   * @param {Object} csvRow 
   * @returns {Channel}
   */
  static fromCSV(csvRow) {
    return new Channel({
      id: csvRow.id || Channel.generateId(csvRow.name, csvRow.type),
      name: csvRow.name,
      logo: csvRow.logo,
      streamUrl: csvRow.stream_url,
      genre: Channel.#mapGenreToStandard(csvRow.genre || 'General'),
      country: csvRow.country || 'Internacional',
      language: csvRow.language || 'es',
      quality: csvRow.quality || StreamQuality.QUALITIES.AUTO,
      type: csvRow.type || Channel.TYPES.TV,
      isActive: csvRow.is_active !== 'false',
      metadata: {
        source: 'csv',
        originalData: csvRow
      }
    });
  }

  /**
   * Crea instancia desde datos M3U
   * @static
   * @param {Object} m3uData 
   * @returns {Channel}
   */
  static fromM3U(m3uData) {
    const quality = StreamQuality.fromUrl(m3uData.url);
    
    return new Channel({
      id: m3uData.id || Channel.generateId(m3uData.name, Channel.TYPES.TV),
      name: m3uData.name,
      logo: m3uData.logo,
      streamUrl: m3uData.url,
      genre: m3uData.group || Channel.GENRES.GENERAL,
      country: m3uData.country || 'Internacional',
      language: m3uData.language || 'es',
      quality: quality,
      type: Channel.TYPES.TV,
      isActive: true,
      metadata: {
        source: 'm3u',
        tvgId: m3uData.tvgId,
        originalData: m3uData
      }
    });
  }

  /**
   * Serializa a JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.#id,
      name: this.#name,
      logo: this.#logo,
      streamUrl: this.#streamUrl,
      genre: this.#genre,
      country: this.#country,
      language: this.#language,
      quality: this.#quality.toJSON(),
      type: this.#type,
      isActive: this.#isActive,
      lastValidated: this.#lastValidated,
      metadata: this.#metadata
    };
  }

  /**
   * Verifica igualdad con otro canal
   * @param {Channel} other 
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof Channel && this.#id === other.#id;
  }

  /**
   * Genera hash del canal
   * @returns {string}
   */
  toString() {
    return `Channel(${this.#id}: ${this.#name})`;
  }
}

export default Channel;
