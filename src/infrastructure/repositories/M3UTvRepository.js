/**
 * @fileoverview M3UTvRepository - Repositorio para canales de TV M3U.
 * Maneja la obtención y cache de canales de TV desde fuentes M3U.
 */

import { M3UParser } from '../utils/M3UParser.js';

/**
 * Repositorio para canales de TV M3U que implementa cache en memoria.
 * Responsabilidad única: gestionar acceso a canales de TV desde fuentes M3U.
 */
export class M3UTvRepository {
  #tvs = new Map();
  #lastFetch = null;
  #cacheTimeout;
  #m3uUrl;
  #logger;

  /**
   * @param {string} m3uUrl - URL del archivo M3U
   * @param {object} config - Objeto de configuración
   * @param {EnhancedLogger} logger - Instancia del logger
   */
  constructor(m3uUrl, config, logger) {
    if (!m3uUrl || typeof m3uUrl !== 'string') {
      throw new Error('M3U URL is required');
    }
    
    this.#m3uUrl = m3uUrl;
    this.#cacheTimeout = config.repository.m3uCacheTimeout;
    this.#logger = logger;
  }

  /**
   * Obtiene todos los canales de TV disponibles.
   * @returns {Promise<Tv[]>} Array de canales de TV
   */
  async getAllTvs() {
    await this.#ensureTvsLoaded();
    return Array.from(this.#tvs.values());
  }

  /**
   * Obtiene un canal por su ID.
   * @param {string} channelId - ID del canal
   * @returns {Promise<Tv|null>} Canal encontrado o null
   */
  async getTvById(channelId) {
    await this.#ensureTvsLoaded();
    return this.#tvs.get(channelId) || null;
  }

  /**
   * Obtiene todos los grupos disponibles.
   * @returns {Promise<string[]>} Array de grupos únicos
   */
  async getAvailableGroups() {
    await this.#ensureTvsLoaded();
    const groups = new Set();
    this.#tvs.forEach(tv => groups.add(tv.group));
    return Array.from(groups).sort();
  }

  /**
   * Obtiene estadísticas de los canales de TV.
   * @returns {Promise<Object>} Objeto con estadísticas
   */
  async getStats() {
    this.#logger.debug('[DEBUG] Fetching TV channels statistics');
    
    try {
      await this.#ensureTvsLoaded();
      const total = this.#tvs.size;
      const groups = new Set();
      this.#tvs.forEach(tv => groups.add(tv.group));
      
      const stats = {
        total,
        groups: groups.size,
        groupNames: Array.from(groups).sort(),
        lastUpdated: this.#lastFetch
      };
      
      this.#logger.debug('[DEBUG] TV channels statistics:', stats);
      return stats;
    } catch (error) {
      this.#logger.error('[DEBUG] Error fetching TV statistics', error);
      return {
        total: 0,
        groups: 0,
        groupNames: [],
        lastUpdated: null
      };
    }
  }

  /**
   * Fuerza la recarga de canales de TV desde la fuente.
   * @returns {Promise<void>}
   */
  async refreshTvs() {
    this.#lastFetch = null;
    this.#tvs.clear();
    await this.#ensureTvsLoaded();
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
   * Asegura que los canales de TV estén cargados en memoria.
   * @private
   * @returns {Promise<void>}
   */
  async #ensureTvsLoaded() {
    if (this.#tvs.size > 0 && this.#isCacheValid()) {
      return;
    }

    try {
      await this.#loadTvsFromSource();
    } catch (error) {
      this.#logger.error('Error loading tvs from M3U source:', error);
      
      // Si hay canales de TV en cache, usarlos aunque estén expirados
      if (this.#tvs.size > 0) {
        this.#logger.debug('Using expired cache due to fetch error');
        return;
      }
      
      throw new Error(`Failed to load tvs: ${error.message}`);
    }
  }

  /**
   * Carga canales de TV desde la fuente M3U.
   * @private
   * @returns {Promise<void>}
   */
  async #loadTvsFromSource() {
    this.#logger.debug(`Fetching M3U from: ${this.#m3uUrl}`);
    
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

    const tvs = M3UParser.parse(m3uContent);
    
    // Actualizar cache
    this.#tvs.clear();
    tvs.forEach(tv => {
      this.#tvs.set(tv.id, tv);
    });
    
    this.#lastFetch = Date.now();
    
    this.#logger.debug(`Loaded ${tvs.length} tvs from M3U source`);
  }

  /**
   * Obtiene información de configuración del repositorio.
   * @returns {Object} Información de configuración
   */
  getConfig() {
    return {
      m3uUrl: this.#m3uUrl,
      cacheTimeout: this.#cacheTimeout,
      channelsLoaded: this.#tvs.size,
      lastFetch: this.#lastFetch,
      cacheValid: this.#isCacheValid()
    };
  }
}