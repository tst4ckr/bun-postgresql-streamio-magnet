/**
 * @fileoverview M3UTvRepository - Repositorio para canales de TV M3U.
 * Maneja la obtención y cache de canales de TV desde fuentes M3U.
 */

import { M3UParser } from '../utils/M3UParser.js';
import { readFile } from 'fs/promises';
import { isLocalFile, resolveLocalPath, validateLocalFile, buildFileNotFoundError, processM3UContent, fetchM3UFromUrl, isCacheValid, generateTvStats, updateTvMap } from './M3UTvRepository_tools.js';

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
      const stats = generateTvStats(this.#tvs, this.#lastFetch);
      
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
    return isCacheValid(this.#lastFetch, this.#cacheTimeout);
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
    
    let m3uContent;
    
    // Detectar si es un archivo local o una URL remota
    if (isLocalFile(this.#m3uUrl)) {
      // Es un archivo local
      const filePath = resolveLocalPath(this.#m3uUrl);
      
      if (!validateLocalFile(this.#m3uUrl)) {
        throw new Error(buildFileNotFoundError(filePath));
      }
      
      m3uContent = await readFile(filePath, 'utf8');
      this.#logger.debug(`Loaded M3U content from local file: ${filePath}`);
    } else {
      // Es una URL remota
      m3uContent = await fetchM3UFromUrl(this.#m3uUrl, this.#logger);
    }
    
    // Procesar y validar el contenido M3U
    const tvs = processM3UContent(m3uContent, this.#logger);
    
    // Actualizar cache
    updateTvMap(this.#tvs, tvs);
    this.#lastFetch = Date.now();
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