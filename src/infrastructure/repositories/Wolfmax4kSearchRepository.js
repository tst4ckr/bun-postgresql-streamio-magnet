import { TorrentSearchRepository } from '../../domain/repositories/TorrentSearchRepository.js';
import { SearchProvider } from '../../domain/entities/SearchProvider.js';
import { TorrentResult } from '../../domain/entities/TorrentResult.js';
import { SearchQuery } from '../../domain/value-objects/SearchQuery.js';
import { JSDOM } from 'jsdom';

/**
 * Repositorio de búsqueda para Wolfmax4k
 * Especializado en contenido 4K y alta calidad
 */
export class Wolfmax4kSearchRepository extends TorrentSearchRepository {
  constructor(httpClient, cacheService = null, configService = null) {
    super();
    this.httpClient = httpClient;
    this.cacheService = cacheService;
    this.configService = configService;
    
    // Configuración específica de Wolfmax4k
    this.provider = new SearchProvider({
      id: 'wolfmax4k',
      name: 'Wolfmax4k',
      baseUrl: 'https://wolfmax4k.com',
      language: 'es',
      categories: ['movies', 'series'],
      features: ['4k', 'hdr', 'dolby_vision', 'atmos'],
      priority: 2,
      rateLimit: {
        requests: 10,
        windowMs: 60000 // 1 minuto
      },
      selectors: {
        searchUrl: '/buscar',
        resultContainer: '.torrent-item',
        titleSelector: '.torrent-title a',
        magnetSelector: '.magnet-link',
        sizeSelector: '.torrent-size',
        seedersSelector: '.seeders',
        leechersSelector: '.leechers',
        dateSelector: '.upload-date',
        qualitySelector: '.quality-badge'
      },
      searchParams: {
        query: 'q',
        category: 'cat',
        sort: 'sort',
        order: 'order'
      }
    });
    
    this.lastRequestTime = 0;
    this.searchCache = new Map();
  }

  /**
   * Busca torrents en Wolfmax4k
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<TorrentResult[]>}
   */
  async searchTorrents(searchQuery, options = {}) {
    try {
      // Verificar caché primero
      const cachedResults = await this.getCachedResults(searchQuery);
      if (cachedResults && !options.skipCache) {
        return cachedResults;
      }

      // Aplicar rate limiting
      await this.enforceRateLimit();

      // Realizar búsqueda
      const results = await this.performSearch(searchQuery, options);
      
      // Filtrar y ordenar resultados priorizando 4K
      const filteredResults = this.filterAndSortResults(results, searchQuery);
      
      // Cachear resultados
      await this.cacheResults(searchQuery, filteredResults);
      
      // Registrar estadísticas
      this.logSearchStats(searchQuery, filteredResults.length);
      
      return filteredResults;
    } catch (error) {
      console.error(`❌ Error en búsqueda Wolfmax4k:`, error.message);
      throw error;
    }
  }

  /**
   * Realiza la búsqueda HTTP en Wolfmax4k
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<TorrentResult[]>}
   */
  async performSearch(searchQuery, options = {}) {
    const searchUrl = this.buildSearchUrl(searchQuery);
    
    const response = await this.httpClient.get(searchUrl, {
      timeout: options.timeout || 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return this.parseSearchResults(response.data, searchQuery);
  }

  /**
   * Construye la URL de búsqueda para Wolfmax4k
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {string}
   */
  buildSearchUrl(searchQuery) {
    const baseUrl = this.provider.baseUrl;
    const searchPath = this.provider.selectors.searchUrl;
    
    // Construir término de búsqueda optimizado para 4K
    let searchTerm = searchQuery.term;
    
    // Agregar año si está disponible
    if (searchQuery.year) {
      searchTerm += ` ${searchQuery.year}`;
    }
    
    // Priorizar contenido 4K
    if (!searchTerm.toLowerCase().includes('4k') && !searchTerm.toLowerCase().includes('2160p')) {
      searchTerm += ' 4K';
    }
    
    // Agregar información de temporada/episodio para series
    if (searchQuery.type === 'series' && searchQuery.season) {
      searchTerm += ` S${String(searchQuery.season).padStart(2, '0')}`;
      if (searchQuery.episode) {
        searchTerm += `E${String(searchQuery.episode).padStart(2, '0')}`;
      }
    }
    
    const params = new URLSearchParams({
      [this.provider.searchParams.query]: searchTerm,
      [this.provider.searchParams.sort]: 'seeders',
      [this.provider.searchParams.order]: 'desc'
    });
    
    // Agregar categoría si está especificada
    if (searchQuery.type === 'movie') {
      params.set(this.provider.searchParams.category, 'peliculas');
    } else if (searchQuery.type === 'series') {
      params.set(this.provider.searchParams.category, 'series');
    }
    
    return `${baseUrl}${searchPath}?${params.toString()}`;
  }

  /**
   * Parsea los resultados HTML de Wolfmax4k
   * @param {string} html - HTML de respuesta
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {TorrentResult[]}
   */
  parseSearchResults(html, searchQuery) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const resultElements = document.querySelectorAll(this.provider.selectors.resultContainer);
    const results = [];
    
    for (const element of resultElements) {
      try {
        const result = this.parseResultElement(element, searchQuery);
        if (result && this.isVerifiedResult(result, searchQuery)) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`⚠️ Error parseando resultado Wolfmax4k:`, error.message);
      }
    }
    
    return results;
  }

  /**
   * Parsea un elemento de resultado individual
   * @param {Element} element - Elemento DOM
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {TorrentResult|null}
   */
  parseResultElement(element, searchQuery) {
    // Extraer título
    const titleElement = element.querySelector(this.provider.selectors.titleSelector);
    if (!titleElement) return null;
    
    const title = titleElement.textContent.trim();
    if (!title) return null;
    
    // Extraer magnet link
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
    const size = sizeElement ? this.normalizeSize(sizeElement.textContent.trim()) : null;
    
    // Extraer calidad (priorizar 4K)
    const quality = this.normalizeQuality(title);
    
    // Extraer seeders y leechers
    const seedersElement = element.querySelector(this.provider.selectors.seedersSelector);
    const leechersElement = element.querySelector(this.provider.selectors.leechersSelector);
    
    const seeders = seedersElement ? parseInt(seedersElement.textContent.trim()) || 0 : 0;
    const leechers = leechersElement ? parseInt(leechersElement.textContent.trim()) || 0 : 0;
    
    // Extraer fecha de subida
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
      verified: seeders >= 5, // Considerar verificado si tiene al menos 5 seeders
      features: this.extractFeatures(title)
    });
  }

  /**
   * Normaliza el tamaño del archivo
   * @param {string} sizeStr - Cadena de tamaño
   * @returns {string|null}
   */
  normalizeSize(sizeStr) {
    if (!sizeStr) return null;
    
    // Patrones comunes de tamaño
    const sizeMatch = sizeStr.match(/([0-9.,]+)\s*(GB|MB|TB|KB)/i);
    if (!sizeMatch) return null;
    
    const [, size, unit] = sizeMatch;
    const normalizedSize = size.replace(',', '.');
    
    return `${normalizedSize} ${unit.toUpperCase()}`;
  }

  /**
   * Normaliza la calidad del video priorizando 4K
   * @param {string} title - Título del torrent
   * @returns {string}
   */
  normalizeQuality(title) {
    const titleLower = title.toLowerCase();
    
    // Prioridad para formatos 4K
    if (titleLower.includes('2160p') || titleLower.includes('4k')) {
      if (titleLower.includes('hdr')) return '4K HDR';
      if (titleLower.includes('dolby vision')) return '4K Dolby Vision';
      return '4K';
    }
    
    // Otras calidades
    if (titleLower.includes('1080p')) return '1080p';
    if (titleLower.includes('720p')) return '720p';
    if (titleLower.includes('480p')) return '480p';
    
    return 'Unknown';
  }

  /**
   * Extrae características especiales del título
   * @param {string} title - Título del torrent
   * @returns {string[]}
   */
  extractFeatures(title) {
    const features = [];
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('4k') || titleLower.includes('2160p')) features.push('4K');
    if (titleLower.includes('hdr')) features.push('HDR');
    if (titleLower.includes('dolby vision')) features.push('Dolby Vision');
    if (titleLower.includes('atmos')) features.push('Dolby Atmos');
    if (titleLower.includes('dts-x')) features.push('DTS:X');
    if (titleLower.includes('hevc') || titleLower.includes('x265')) features.push('HEVC');
    if (titleLower.includes('remux')) features.push('REMUX');
    
    return features;
  }

  /**
   * Extrae la calidad específica del título
   * @param {string} title - Título del torrent
   * @returns {string|null}
   */
  extractQualityFromTitle(title) {
    const qualityPatterns = [
      /2160p|4k/i,
      /1080p/i,
      /720p/i,
      /480p/i
    ];
    
    for (const pattern of qualityPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[0].toUpperCase();
      }
    }
    
    return null;
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
   * Parsea una fecha de texto
   * @param {string} dateStr - Cadena de fecha
   * @returns {Date|null}
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    try {
      // Intentar varios formatos de fecha
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verifica si un resultado es válido
   * @param {TorrentResult} result - Resultado a verificar
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {boolean}
   */
  isVerifiedResult(result, searchQuery) {
    // Verificaciones básicas
    if (!result.title || !result.magnetUrl || !result.infoHash) {
      return false;
    }
    
    // Priorizar resultados 4K
    const title = result.title.toLowerCase();
    const has4K = title.includes('4k') || title.includes('2160p');
    
    // Verificar relevancia del título
    const searchTerms = searchQuery.term.toLowerCase().split(' ');
    const titleWords = title.split(' ');
    
    let matchCount = 0;
    for (const term of searchTerms) {
      if (term.length > 2 && titleWords.some(word => word.toLowerCase().includes(term))) {
        matchCount++;
      }
    }
    
    // Requerir al menos 60% de coincidencia para contenido no-4K
    const requiredMatchRatio = has4K ? 0.4 : 0.6;
    const matchRatio = matchCount / searchTerms.length;
    
    return matchRatio >= requiredMatchRatio;
  }

  /**
   * Filtra y ordena los resultados priorizando 4K
   * @param {TorrentResult[]} results - Resultados a filtrar
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {TorrentResult[]}
   */
  filterAndSortResults(results, searchQuery) {
    const maxResults = this.configService?.get('search.maxResults') || 50;
    
    return results
      .filter(result => result.seeders > 0) // Solo resultados con seeders
      .sort((a, b) => {
        // Priorizar 4K
        const aIs4K = a.quality.includes('4K') || a.title.toLowerCase().includes('4k');
        const bIs4K = b.quality.includes('4K') || b.title.toLowerCase().includes('4k');
        
        if (aIs4K && !bIs4K) return -1;
        if (!aIs4K && bIs4K) return 1;
        
        // Luego por seeders
        if (b.seeders !== a.seeders) {
          return b.seeders - a.seeders;
        }
        
        // Finalmente por fecha (más reciente primero)
        if (a.uploadDate && b.uploadDate) {
          return b.uploadDate.getTime() - a.uploadDate.getTime();
        }
        
        return 0;
      })
      .slice(0, maxResults);
  }

  /**
   * Aplica rate limiting
   * @returns {Promise<void>}
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = this.provider.rateLimit.windowMs / this.provider.rateLimit.requests;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Busca en el proveedor específico
   * @param {string} providerId - ID del proveedor
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<TorrentResult[]>}
   */
  async searchInProvider(providerId, searchQuery, options = {}) {
    if (providerId !== this.provider.id) {
      throw new Error(`Proveedor ${providerId} no soportado por este repositorio`);
    }
    
    return this.searchTorrents(searchQuery, options);
  }

  /**
   * Obtiene los proveedores disponibles
   * @returns {Promise<SearchProvider[]>}
   */
  async getAvailableProviders() {
    return [this.provider];
  }



  /**
   * Obtiene un proveedor por ID
   * @param {string} providerId - ID del proveedor
   * @returns {Promise<SearchProvider|null>}
   */
  async getProviderById(providerId) {
    return providerId === this.provider.id ? this.provider : null;
  }

  /**
   * Verifica si un proveedor está disponible
   * @param {string} providerId - ID del proveedor
   * @returns {Promise<boolean>}
   */
  async isProviderAvailable(providerId) {
    return providerId === this.provider.id && this.provider.isAvailable();
  }

  /**
   * Obtiene resultados del caché
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {Promise<TorrentResult[]|null>}
   */
  async getCachedResults(searchQuery) {
    if (!this.cacheService) return null;
    return this.cacheService.get(searchQuery.getCacheKey());
  }

  /**
   * Cachea los resultados
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {TorrentResult[]} results - Resultados a cachear
   * @returns {Promise<void>}
   */
  async cacheResults(searchQuery, results) {
    if (!this.cacheService) return;
    
    const ttl = this.configService?.get('cache.searchTtl') || 3600; // 1 hora por defecto
    await this.cacheService.set(searchQuery.getCacheKey(), results, ttl);
  }

  /**
   * Limpia el caché expirado
   * @returns {Promise<void>}
   */
  async cleanExpiredCache() {
    if (!this.cacheService) return;
    await this.cacheService.cleanup();
  }

  /**
   * Registra estadísticas de búsqueda
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @param {number} resultCount - Número de resultados
   */
  logSearchStats(searchQuery, resultCount) {
    console.log(`🔍 Wolfmax4k: "${searchQuery.term}" -> ${resultCount} resultados`);
  }
}