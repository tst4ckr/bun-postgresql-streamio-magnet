import { TorrentSearchRepository } from '../../domain/repositories/TorrentSearchRepository.js';
import { SearchProvider } from '../../domain/entities/SearchProvider.js';
import { TorrentResult } from '../../domain/entities/TorrentResult.js';
import { SearchQuery } from '../../domain/value-objects/SearchQuery.js';
import { JSDOM } from 'jsdom';

/**
 * Repositorio de búsqueda para Cinecalidad
 * Especializado en contenido en español con variedad de calidades
 */
export class CinecalidadSearchRepository extends TorrentSearchRepository {
  constructor(httpClient, cacheService = null, configService = null) {
    super();
    this.httpClient = httpClient;
    this.cacheService = cacheService;
    this.configService = configService;
    
    // Configuración específica de Cinecalidad
    this.provider = new SearchProvider({
      id: 'cinecalidad',
      name: 'Cinecalidad',
      baseUrl: 'https://cinecalidad.lol',
      language: 'es',
      categories: ['movies', 'series'],
      features: ['spanish_audio', 'latino', 'subtitles', 'multi_quality'],
      priority: 3,
      rateLimit: {
        requests: 15,
        windowMs: 60000 // 1 minuto
      },
      selectors: {
        searchUrl: '/search',
        resultContainer: '.movie-item, .serie-item',
        titleSelector: '.movie-title, .serie-title',
        magnetSelector: '.download-link[href*="magnet:"]',
        sizeSelector: '.file-size',
        seedersSelector: '.seeders-count',
        leechersSelector: '.leechers-count',
        dateSelector: '.upload-date',
        qualitySelector: '.quality-tag',
        languageSelector: '.language-tag'
      },
      searchParams: {
        query: 's',
        type: 'type',
        quality: 'quality',
        year: 'year'
      }
    });
    
    this.lastRequestTime = 0;
    this.searchCache = new Map();
  }

  /**
   * Busca torrents en Cinecalidad
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
      
      // Filtrar y ordenar resultados priorizando español/latino
      const filteredResults = this.filterAndSortResults(results, searchQuery);
      
      // Cachear resultados
      await this.cacheResults(searchQuery, filteredResults);
      
      // Registrar estadísticas
      this.logSearchStats(searchQuery, filteredResults.length);
      
      return filteredResults;
    } catch (error) {
      console.error(`❌ Error en búsqueda Cinecalidad:`, error.message);
      throw error;
    }
  }

  /**
   * Realiza la búsqueda HTTP en Cinecalidad
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
        'Upgrade-Insecure-Requests': '1',
        'Referer': this.provider.baseUrl
      }
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return this.parseSearchResults(response.data, searchQuery);
  }

  /**
   * Construye la URL de búsqueda para Cinecalidad
   * @param {SearchQuery} searchQuery - Consulta de búsqueda
   * @returns {string}
   */
  buildSearchUrl(searchQuery) {
    const baseUrl = this.provider.baseUrl;
    const searchPath = this.provider.selectors.searchUrl;
    
    // Construir término de búsqueda optimizado para español/latino
    let searchTerm = searchQuery.term;
    
    // Agregar año si está disponible
    if (searchQuery.year) {
      searchTerm += ` ${searchQuery.year}`;
    }
    
    // Agregar información de temporada/episodio para series
    if (searchQuery.type === 'series' && searchQuery.season) {
      searchTerm += ` temporada ${searchQuery.season}`;
      if (searchQuery.episode) {
        searchTerm += ` capitulo ${searchQuery.episode}`;
      }
    }
    
    const params = new URLSearchParams({
      [this.provider.searchParams.query]: searchTerm
    });
    
    // Agregar tipo si está especificado
    if (searchQuery.type === 'movie') {
      params.set(this.provider.searchParams.type, 'peliculas');
    } else if (searchQuery.type === 'series') {
      params.set(this.provider.searchParams.type, 'series');
    }
    
    // Agregar año como parámetro separado
    if (searchQuery.year) {
      params.set(this.provider.searchParams.year, searchQuery.year.toString());
    }
    
    return `${baseUrl}${searchPath}?${params.toString()}`;
  }

  /**
   * Parsea los resultados HTML de Cinecalidad
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
        console.warn(`⚠️ Error parseando resultado Cinecalidad:`, error.message);
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
    
    // Extraer calidad
    const quality = this.normalizeQuality(title, element);
    
    // Extraer idioma
    const language = this.extractLanguage(title, element);
    
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
      language: language || this.provider.language,
      year,
      imdbId: searchQuery.imdbId,
      season: searchQuery.season,
      episode: searchQuery.episode,
      uploadDate,
      verified: seeders >= 3, // Considerar verificado si tiene al menos 3 seeders
      features: this.extractFeatures(title, element)
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
   * Normaliza la calidad del video
   * @param {string} title - Título del torrent
   * @param {Element} element - Elemento DOM
   * @returns {string}
   */
  normalizeQuality(title, element = null) {
    const titleLower = title.toLowerCase();
    
    // Buscar en elemento de calidad específico
    if (element) {
      const qualityElement = element.querySelector(this.provider.selectors.qualitySelector);
      if (qualityElement) {
        const qualityText = qualityElement.textContent.trim().toLowerCase();
        if (qualityText.includes('4k') || qualityText.includes('2160p')) return '4K';
        if (qualityText.includes('1080p')) return '1080p';
        if (qualityText.includes('720p')) return '720p';
        if (qualityText.includes('480p')) return '480p';
      }
    }
    
    // Buscar en el título
    if (titleLower.includes('2160p') || titleLower.includes('4k')) return '4K';
    if (titleLower.includes('1080p')) return '1080p';
    if (titleLower.includes('720p')) return '720p';
    if (titleLower.includes('480p')) return '480p';
    if (titleLower.includes('dvdrip')) return 'DVDRip';
    if (titleLower.includes('webrip')) return 'WEBRip';
    if (titleLower.includes('bluray')) return 'BluRay';
    
    return 'Unknown';
  }

  /**
   * Extrae el idioma del contenido
   * @param {string} title - Título del torrent
   * @param {Element} element - Elemento DOM
   * @returns {string}
   */
  extractLanguage(title, element = null) {
    const titleLower = title.toLowerCase();
    
    // Buscar en elemento de idioma específico
    if (element) {
      const languageElement = element.querySelector(this.provider.selectors.languageSelector);
      if (languageElement) {
        const languageText = languageElement.textContent.trim().toLowerCase();
        if (languageText.includes('latino')) return 'es-latino';
        if (languageText.includes('español') || languageText.includes('spanish')) return 'es';
        if (languageText.includes('dual')) return 'dual';
      }
    }
    
    // Buscar en el título
    if (titleLower.includes('latino')) return 'es-latino';
    if (titleLower.includes('español') || titleLower.includes('spanish')) return 'es';
    if (titleLower.includes('dual')) return 'dual';
    if (titleLower.includes('subtitulado') || titleLower.includes('sub')) return 'es-sub';
    
    return 'es'; // Por defecto español
  }

  /**
   * Extrae características especiales del título
   * @param {string} title - Título del torrent
   * @param {Element} element - Elemento DOM
   * @returns {string[]}
   */
  extractFeatures(title, element = null) {
    const features = [];
    const titleLower = title.toLowerCase();
    
    // Características de calidad
    if (titleLower.includes('4k') || titleLower.includes('2160p')) features.push('4K');
    if (titleLower.includes('hdr')) features.push('HDR');
    if (titleLower.includes('remux')) features.push('REMUX');
    if (titleLower.includes('extended')) features.push('Extended');
    if (titleLower.includes('director')) features.push('Director\'s Cut');
    
    // Características de audio
    if (titleLower.includes('latino')) features.push('Latino');
    if (titleLower.includes('dual')) features.push('Dual Audio');
    if (titleLower.includes('atmos')) features.push('Dolby Atmos');
    if (titleLower.includes('dts')) features.push('DTS');
    
    // Características de codificación
    if (titleLower.includes('hevc') || titleLower.includes('x265')) features.push('HEVC');
    if (titleLower.includes('x264')) features.push('x264');
    
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
      /480p/i,
      /dvdrip/i,
      /webrip/i,
      /bluray/i
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
    
    // Priorizar contenido en español/latino
    const title = result.title.toLowerCase();
    const hasSpanish = title.includes('latino') || title.includes('español') || 
                      title.includes('spanish') || title.includes('dual');
    
    // Verificar relevancia del título
    const searchTerms = searchQuery.term.toLowerCase().split(' ');
    const titleWords = title.split(' ');
    
    let matchCount = 0;
    for (const term of searchTerms) {
      if (term.length > 2 && titleWords.some(word => word.toLowerCase().includes(term))) {
        matchCount++;
      }
    }
    
    // Requerir al menos 50% de coincidencia para contenido español, 70% para otros
    const requiredMatchRatio = hasSpanish ? 0.5 : 0.7;
    const matchRatio = matchCount / searchTerms.length;
    
    return matchRatio >= requiredMatchRatio;
  }

  /**
   * Filtra y ordena los resultados priorizando español/latino
   * @param {TorrentResult[]} results - Resultados a filtrar
   * @param {SearchQuery} searchQuery - Consulta original
   * @returns {TorrentResult[]}
   */
  filterAndSortResults(results, searchQuery) {
    const maxResults = this.configService?.get('search.maxResults') || 50;
    
    return results
      .filter(result => result.seeders > 0) // Solo resultados con seeders
      .sort((a, b) => {
        // Priorizar contenido en español/latino
        const aIsSpanish = a.language.includes('es') || a.title.toLowerCase().includes('latino');
        const bIsSpanish = b.language.includes('es') || b.title.toLowerCase().includes('latino');
        
        if (aIsSpanish && !bIsSpanish) return -1;
        if (!aIsSpanish && bIsSpanish) return 1;
        
        // Luego por calidad (1080p > 720p > 480p)
        const qualityOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
        const aQuality = qualityOrder[a.quality] || 0;
        const bQuality = qualityOrder[b.quality] || 0;
        
        if (bQuality !== aQuality) {
          return bQuality - aQuality;
        }
        
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
   * Obtiene los proveedores habilitados
   * @returns {Promise<SearchProvider[]>}
   */
  async getEnabledProviders() {
    return this.provider.isAvailable() ? [this.provider] : [];
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
    console.log(`🔍 Cinecalidad: "${searchQuery.term}" -> ${resultCount} resultados`);
  }
}