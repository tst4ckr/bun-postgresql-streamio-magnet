/**
 * @fileoverview M3UChannelRepository - Repositorio para canales M3U.
 * Maneja la obtención y cache de canales desde fuentes M3U.
 */

import { M3UParser } from '../utils/M3UParser.js';

/**
 * Repositorio para canales M3U que implementa cache en memoria.
 * Responsabilidad única: gestionar acceso a canales desde fuentes M3U.
 */
export class M3UChannelRepository {
  #channels = new Map();
  #lastFetch = null;
  #cacheTimeout;
  #m3uUrl;

  /**
   * @param {string} m3uUrl - URL del archivo M3U
   * @param {number} [cacheTimeout=300000] - Timeout del cache en ms (5 min por defecto)
   */
  constructor(m3uUrl, cacheTimeout = 300000) {
    if (!m3uUrl || typeof m3uUrl !== 'string') {
      throw new Error('M3U URL is required');
    }
    
    this.#m3uUrl = m3uUrl;
    this.#cacheTimeout = cacheTimeout;
  }

  /**
   * Obtiene todos los canales disponibles.
   * @returns {Promise<Channel[]>} Array de canales
   */
  async getAllChannels() {
    await this.#ensureChannelsLoaded();
    return Array.from(this.#channels.values());
  }

  /**
   * Obtiene un canal por su ID.
   * @param {string} channelId - ID del canal
   * @returns {Promise<Channel|null>} Canal encontrado o null
   */
  async getChannelById(channelId) {
    await this.#ensureChannelsLoaded();
    return this.#channels.get(channelId) || null;
  }

  /**
   * Obtiene canales filtrados por grupo.
   * @param {string} group - Grupo a filtrar
   * @returns {Promise<Channel[]>} Array de canales del grupo
   */
  async getChannelsByGroup(group) {
    await this.#ensureChannelsLoaded();
    return Array.from(this.#channels.values())
      .filter(channel => channel.group === group);
  }

  /**
   * Obtiene todos los grupos disponibles.
   * @returns {Promise<string[]>} Array de grupos únicos
   */
  async getAvailableGroups() {
    await this.#ensureChannelsLoaded();
    const groups = new Set();
    this.#channels.forEach(channel => groups.add(channel.group));
    return Array.from(groups).sort();
  }

  /**
   * Busca canales por nombre.
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Promise<Channel[]>} Array de canales que coinciden
   */
  async searchChannels(searchTerm) {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    await this.#ensureChannelsLoaded();
    const term = searchTerm.toLowerCase();
    
    return Array.from(this.#channels.values())
      .filter(channel => 
        channel.name.toLowerCase().includes(term) ||
        channel.group.toLowerCase().includes(term) ||
        (channel.tvgName && channel.tvgName.toLowerCase().includes(term))
      );
  }

  /**
   * Obtiene estadísticas del repositorio.
   * @returns {Promise<Object>} Estadísticas de canales
   */
  async getStats() {
    await this.#ensureChannelsLoaded();
    
    const groups = new Map();
    this.#channels.forEach(channel => {
      const count = groups.get(channel.group) || 0;
      groups.set(channel.group, count + 1);
    });

    return {
      totalChannels: this.#channels.size,
      totalGroups: groups.size,
      groupStats: Object.fromEntries(groups),
      lastUpdate: this.#lastFetch,
      cacheTimeout: this.#cacheTimeout
    };
  }

  /**
   * Fuerza la recarga de canales desde la fuente.
   * @returns {Promise<void>}
   */
  async refreshChannels() {
    this.#lastFetch = null;
    this.#channels.clear();
    await this.#ensureChannelsLoaded();
  }

  /**
   * Verifica si el cache es válido.
   * @private
   * @returns {boolean} True si el cache es válido
   */
  #isCacheValid() {
    if (!this.#lastFetch) {
      return false;
    }
    
    const now = Date.now();
    return (now - this.#lastFetch) < this.#cacheTimeout;
  }

  /**
   * Asegura que los canales estén cargados en memoria.
   * @private
   * @returns {Promise<void>}
   */
  async #ensureChannelsLoaded() {
    if (this.#channels.size > 0 && this.#isCacheValid()) {
      return;
    }

    try {
      await this.#loadChannelsFromSource();
    } catch (error) {
      console.error('Error loading channels from M3U source:', error);
      
      // Si hay canales en cache, usarlos aunque estén expirados
      if (this.#channels.size > 0) {
        console.warn('Using expired cache due to fetch error');
        return;
      }
      
      throw new Error(`Failed to load channels: ${error.message}`);
    }
  }

  /**
   * Carga canales desde la fuente M3U.
   * @private
   * @returns {Promise<void>}
   */
  async #loadChannelsFromSource() {
    console.log(`Fetching M3U from: ${this.#m3uUrl}`);
    
    const response = await fetch(this.#m3uUrl, {
      headers: {
        'User-Agent': 'Stremio-Addon/1.0',
        'Accept': 'application/x-mpegURL, text/plain, */*'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const m3uContent = await response.text();
    
    if (!M3UParser.isValidM3U(m3uContent)) {
      throw new Error('Invalid M3U format received');
    }

    const channels = M3UParser.parse(m3uContent);
    
    // Actualizar cache
    this.#channels.clear();
    channels.forEach(channel => {
      this.#channels.set(channel.id, channel);
    });
    
    this.#lastFetch = Date.now();
    
    console.log(`Loaded ${channels.length} channels from M3U source`);
  }

  /**
   * Obtiene información de configuración del repositorio.
   * @returns {Object} Información de configuración
   */
  getConfig() {
    return {
      m3uUrl: this.#m3uUrl,
      cacheTimeout: this.#cacheTimeout,
      channelsLoaded: this.#channels.size,
      lastFetch: this.#lastFetch,
      cacheValid: this.#isCacheValid()
    };
  }
}