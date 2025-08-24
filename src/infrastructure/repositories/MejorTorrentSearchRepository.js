import { TorrentSearchRepository, SearchRepositoryError, NetworkError, ParsingError, SearchTimeoutError } from '../../domain/repositories/TorrentSearchRepository.js';
import { TorrentResult } from '../../domain/entities/TorrentResult.js';
import { SearchProvider } from '../../domain/entities/SearchProvider.js';
import { JSDOM } from 'jsdom';

/**
 * @fileoverview MejorTorrentSearchRepository - Implementación específica para MejorTorrent
 * Maneja scraping, parsing y rate limiting para el proveedor MejorTorrent
 */

export class MejorTorrentSearchRepository extends TorrentSearchRepository {
  constructor(httpClient, cacheService, rateLimiter) {
    super();
    this.httpClient = httpClient;
    this.cacheService = cacheService;
    this.rateLimiter = rateLimiter;
    this.provider = SearchProvider.createMejorTorrent();
    this.lastRequestTime = 0;
    this.requestCount = 0;
  }

  /**
   * Busca torrents en MejorTorrent
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {Promise<TorrentResult[]>}
   */
  async searchTorrents(searchQuery) {
    try {
      // Verificar cache primero
      const cachedResults = await this.getCachedResults(searchQuery);
      if (cachedResults) {
        return cachedResults;
      }

      // Verificar rate limiting
      await this.enforceRateLimit();

      // Realizar búsqueda
      const results = await this.performSearch(searchQuery);

      // Cachear resultados
      await this.cacheResults(searchQuery, results, 1800); // 30 minutos

      return results;
    } catch (error) {
      throw new SearchRepositoryError(
        `Error buscando en MejorTorrent: ${error.message}`,
        error,
        this.provider.id
      );
    }
  }

  /**
   * Realiza la búsqueda real en MejorTorrent
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {Promise<TorrentResult[]>}
   */
  async performSearch(searchQuery) {
    const searchUrl = this.buildSearchUrl(searchQuery);
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get(searchUrl, {
        headers: this.provider.getRequestHeaders(),
        timeout: this.provider.timeout,
        followRedirects: true,
        maxRedirects: 3
      });

      const responseTime = Date.now() - startTime;
      const results = await this.parseSearchResults(response.data, searchQuery);

      // Registrar estadísticas
      await this.logSearchStats(searchQuery, this.provider.id, results.length, responseTime);

      return results;
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new SearchTimeoutError(this.provider.id, this.provider.timeout);
      }
      throw new NetworkError(this.provider.id, searchUrl, error);
    }
  }

  /**
   * Construye la URL de búsqueda
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {string}
   */
  buildSearchUrl(searchQuery) {
    let searchTerm = searchQuery.getNormalizedTerm();
    
    // Agregar año si está disponible
    if (searchQuery.year) {
      searchTerm += ` ${searchQuery.year}`;
    }

    // Agregar información de temporada/episodio para series
    if (searchQuery.isEpisodeSearch()) {
      searchTerm += ` S${searchQuery.season.toString().padStart(2, '0')}E${searchQuery.episode.toString().padStart(2, '0')}`;
    }

    return this.provider.buildSearchUrl(searchTerm);
  }

  /**
   * Parsea los resultados de búsqueda del HTML
   * @param {string} html - HTML de respuesta
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {Promise<TorrentResult[]>}
   */
  async parseSearchResults(html, searchQuery) {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const results = [];

      const resultElements = document.querySelectorAll(this.provider.selectors.resultContainer);

      for (const element of resultElements) {
        try {
          const result = await this.parseResultElement(element, searchQuery);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          // Log error pero continúa con otros resultados
          console.warn(`Error parseando resultado individual: ${error.message}`);
        }
      }

      return this.filterAndSortResults(results, searchQuery);
    } catch (error) {
      throw new ParsingError(this.provider.id, this.provider.selectors.resultContainer, error);
    }
  }

  /**
   * Parsea un elemento individual de resultado
   * @param {Element} element - Elemento DOM
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {Promise<TorrentResult|null>}
   */
  async parseResultElement(element, searchQuery) {
    try {
      // Extraer título
      const titleElement = element.querySelector(this.provider.selectors.titleSelector);
      if (!titleElement) return null;
      const title = titleElement.textContent.trim();

      // Extraer enlace magnet
      const magnetElement = element.querySelector(this.provider.selectors.magnetSelector);
      if (!magnetElement) return null;
      const magnetUrl = magnetElement.getAttribute('href');
      if (!magnetUrl || !magnetUrl.startsWith('magnet:')) return null;

      // Extraer info hash del magnet
      const infoHashMatch = magnetUrl.match(/btih:([a-fA-F0-9]{40})/i);
      if (!infoHashMatch) return null;
      const infoHash = infoHashMatch[1].toLowerCase();

      // Extraer tamaño
      const sizeElement = element.querySelector(this.provider.selectors.sizeSelector);
      const size = sizeElement ? this.normalizeSize(sizeElement.textContent.trim()) : 'Desconocido';

      // Extraer seeders
      const seedersElement = element.querySelector(this.provider.selectors.seedersSelector);
      const seeders = seedersElement ? parseInt(seedersElement.textContent.trim()) || 0 : 0;

      // Extraer leechers
      const leechersElement = element.querySelector(this.provider.selectors.leechersSelector);
      const leechers = leechersElement ? parseInt(leechersElement.textContent.trim()) || 0 : 0;

      // Extraer calidad
      const qualityElement = element.querySelector(this.provider.selectors.qualitySelector);
      const quality = qualityElement ? this.normalizeQuality(qualityElement.textContent.trim()) : this.extractQualityFromTitle(title);

      // Extraer fecha
      const dateElement = element.querySelector(this.provider.selectors.dateSelector);
      const uploadDate = dateElement ? this.parseDate(dateElement.textContent.trim()) : null;

      // Extraer año del título si no se proporcionó en la consulta
      const year = searchQuery.year || this.extractYearFromTitle(title);

      return new TorrentResult({
        title,
        infoHash,
        magnetUrl,
        size,
        quality,
        seeders,
        leechers,
        provider: this.provider.name,
        language: this.provider.language,
        year,
        imdbId: searchQuery.imdbId,
        season: searchQuery.season,
        episode: searchQuery.episode,
        uploadDate,
        verified: this.isVerifiedResult(element)
      });
    } catch (error) {
      throw new ParsingError(this.provider.id, 'elemento individual', error);
    }
  }

  /**
   * Normaliza el tamaño del archivo
   * @param {string} sizeText - Texto del tamaño
   * @returns {string}
   */
  normalizeSize(sizeText) {
    if (!sizeText) return 'Desconocido';
    
    // Convertir a formato estándar
    const sizeMatch = sizeText.match(/([0-9.,]+)\s*(GB|MB|KB|TB)/i);
    if (sizeMatch) {
      const value = parseFloat(sizeMatch[1].replace(',', '.'));
      const unit = sizeMatch[2].toUpperCase();
      return `${value} ${unit}`;
    }
    
    return sizeText;
  }

  /**
   * Normaliza la calidad del video
   * @param {string} qualityText - Texto de calidad
   * @returns {string}
   */
  normalizeQuality(qualityText) {
    if (!qualityText) return 'SD';
    
    const text = qualityText.toLowerCase();
    
    if (text.includes('4k') || text.includes('2160p')) return '4K';
    if (text.includes('1080p') || text.includes('fhd')) return '1080p';
    if (text.includes('720p') || text.includes('hd')) return '720p';
    if (text.includes('480p') || text.includes('sd')) return 'SD';
    
    return qualityText;
  }

  /**
   * Extrae la calidad del título
   * @param {string} title - Título del torrent
   * @returns {string}
   */
  extractQualityFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('4k') || titleLower.includes('2160p')) return '4K';
    if (titleLower.includes('1080p')) return '1080p';
    if (titleLower.includes('720p')) return '720p';
    if (titleLower.includes('480p')) return 'SD';
    
    return 'HD';
  }

  /**
   * Extrae el año del título
   * @param {string} title - Título del torrent
   * @returns {number|null}
   */
  extractYearFromTitle(title) {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  /**
   * Parsea fecha de subida
   * @param {string} dateText - Texto de fecha
   * @returns {Date|null}
   */
  parseDate(dateText) {
    if (!dateText) return null;
    
    try {
      // Intentar varios formatos de fecha comunes en español
      const date = new Date(dateText);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Verifica si el resultado está verificado
   * @param {Element} element - Elemento DOM
   * @returns {boolean}
   */
  isVerifiedResult(element) {
    // Buscar indicadores de verificación comunes
    const verifiedIndicators = ['.verified', '.vip', '.trusted', '.check'];
    return verifiedIndicators.some(selector => element.querySelector(selector));
  }

  /**
   * Filtra y ordena los resultados
   * @param {TorrentResult[]} results - Resultados sin filtrar
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {TorrentResult[]}
   */
  filterAndSortResults(results, searchQuery) {
    // Filtrar duplicados por info hash
    const uniqueResults = results.filter((result, index, self) => 
      index === self.findIndex(r => r.infoHash === result.infoHash)
    );

    // Ordenar por puntuación de calidad
    return uniqueResults
      .sort((a, b) => b.getQualityScore() - a.getQualityScore())
      .slice(0, 50); // Limitar a 50 resultados
  }

  /**
   * Aplica rate limiting
   * @returns {Promise<void>}
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 60000 / this.provider.rateLimit.requestsPerMinute; // ms entre requests

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Implementaciones de métodos base requeridos
   */
  async searchInProvider(searchQuery, provider) {
    if (provider.id !== this.provider.id) {
      throw new SearchRepositoryError('Proveedor no compatible', null, provider.id);
    }
    return this.searchTorrents(searchQuery);
  }

  async getAvailableProviders() {
    return [this.provider];
  }

  async getEnabledProviders() {
    return this.provider.isAvailable() ? [this.provider] : [];
  }

  async getProviderById(providerId) {
    return providerId === this.provider.id ? this.provider : null;
  }

  async isProviderAvailable(providerId) {
    return providerId === this.provider.id && this.provider.isAvailable();
  }

  async getCachedResults(searchQuery) {
    if (!this.cacheService) return null;
    return this.cacheService.get(searchQuery.getCacheKey());
  }

  async cacheResults(searchQuery, results, ttlSeconds) {
    if (!this.cacheService) return;
    return this.cacheService.set(searchQuery.getCacheKey(), results, ttlSeconds);
  }

  async cleanExpiredCache() {
    if (!this.cacheService) return 0;
    return this.cacheService.cleanExpired();
  }

  async logSearchStats(searchQuery, providerId, resultCount, responseTime) {
    // Implementar logging básico
    console.log(`[${new Date().toISOString()}] Búsqueda en ${providerId}: "${searchQuery.term}" - ${resultCount} resultados en ${responseTime}ms`);
  }
}