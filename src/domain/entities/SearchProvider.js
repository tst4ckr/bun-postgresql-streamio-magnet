import { z } from 'zod';

/**
 * @fileoverview SearchProvider Entity - Representa un proveedor de búsqueda de torrents
 * Implementa principios DDD con configuración y capacidades del proveedor
 */

const SearchProviderSchema = z.object({
  id: z.string().min(1, 'El ID no puede estar vacío'),
  name: z.string().min(1, 'El nombre no puede estar vacío'),
  baseUrl: z.string().url('URL base inválida'),
  language: z.enum(['es', 'en', 'multi']).default('es'),
  priority: z.number().int().min(1).max(10).default(5),
  enabled: z.boolean().default(true),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().min(1).default(30),
    requestsPerHour: z.number().int().min(1).default(1000)
  }).default({ requestsPerMinute: 30, requestsPerHour: 1000 }),
  capabilities: z.object({
    supportsMovies: z.boolean().default(true),
    supportsSeries: z.boolean().default(true),
    supportsQualityFilter: z.boolean().default(false),
    supportsYearFilter: z.boolean().default(false),
    supportsImdbSearch: z.boolean().default(false),
    requiresCloudflareBypass: z.boolean().default(false)
  }).default({}),
  selectors: z.object({
    searchUrl: z.string().min(1, 'URL de búsqueda requerida'),
    resultContainer: z.string().min(1, 'Selector de contenedor requerido'),
    titleSelector: z.string().min(1, 'Selector de título requerido'),
    magnetSelector: z.string().min(1, 'Selector de magnet requerido'),
    sizeSelector: z.string().optional(),
    seedersSelector: z.string().optional(),
    leechersSelector: z.string().optional(),
    qualitySelector: z.string().optional(),
    dateSelector: z.string().optional()
  }),
  headers: z.record(z.string()).default({}),
  timeout: z.number().int().min(1000).max(30000).default(10000)
});

export class SearchProvider {
  constructor(data) {
    const validated = SearchProviderSchema.parse(data);
    Object.assign(this, validated);
    Object.freeze(this);
  }

  /**
   * Crea un proveedor MejorTorrent
   * @returns {SearchProvider}
   */
  static createMejorTorrent() {
    return new SearchProvider({
      id: 'mejortorrent',
      name: 'MejorTorrent',
      baseUrl: 'https://mejortorrent.rip',
      language: 'es',
      priority: 1,
      enabled: true,
      rateLimit: {
        requestsPerMinute: 20,
        requestsPerHour: 800
      },
      capabilities: {
        supportsMovies: true,
        supportsSeries: true,
        supportsQualityFilter: true,
        supportsYearFilter: true,
        supportsImdbSearch: false,
        requiresCloudflareBypass: true
      },
      selectors: {
        searchUrl: '/buscar/{term}',
        resultContainer: '.fichas-listado .ficha-listado',
        titleSelector: '.titulo-ficha a',
        magnetSelector: '.enlaces-descarga a[href^="magnet:"]',
        sizeSelector: '.datos-ficha .size',
        seedersSelector: '.datos-ficha .seeds',
        leechersSelector: '.datos-ficha .peers',
        qualitySelector: '.calidad-ficha',
        dateSelector: '.fecha-ficha'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000
    });
  }

  /**
   * Crea un proveedor Wolfmax4k
   * @returns {SearchProvider}
   */
  static createWolfmax4k() {
    return new SearchProvider({
      id: 'wolfmax4k',
      name: 'Wolfmax4k',
      baseUrl: 'https://wolfmax4k.com',
      language: 'es',
      priority: 2,
      enabled: true,
      rateLimit: {
        requestsPerMinute: 25,
        requestsPerHour: 1000
      },
      capabilities: {
        supportsMovies: true,
        supportsSeries: true,
        supportsQualityFilter: true,
        supportsYearFilter: false,
        supportsImdbSearch: false,
        requiresCloudflareBypass: false
      },
      selectors: {
        searchUrl: '/search?q={term}',
        resultContainer: '.movie-item, .series-item',
        titleSelector: '.movie-title, .series-title',
        magnetSelector: '.download-links a[href^="magnet:"]',
        sizeSelector: '.file-size',
        seedersSelector: '.seeders',
        leechersSelector: '.leechers',
        qualitySelector: '.quality-badge',
        dateSelector: '.upload-date'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 12000
    });
  }

  /**
   * Crea un proveedor Cinecalidad
   * @returns {SearchProvider}
   */
  static createCinecalidad() {
    return new SearchProvider({
      id: 'cinecalidad',
      name: 'Cinecalidad',
      baseUrl: 'https://cinecalidad.lol',
      language: 'es',
      priority: 3,
      enabled: true,
      rateLimit: {
        requestsPerMinute: 30,
        requestsPerHour: 1200
      },
      capabilities: {
        supportsMovies: true,
        supportsSeries: true,
        supportsQualityFilter: false,
        supportsYearFilter: true,
        supportsImdbSearch: false,
        requiresCloudflareBypass: false
      },
      selectors: {
        searchUrl: '/?s={term}',
        resultContainer: '.result-item',
        titleSelector: '.title a',
        magnetSelector: '.download-button[href^="magnet:"]',
        sizeSelector: '.meta-size',
        seedersSelector: '.meta-seeds',
        leechersSelector: '.meta-peers',
        qualitySelector: '.quality',
        dateSelector: '.meta-date'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
  }

  /**
   * Construye la URL de búsqueda con el término proporcionado
   * @param {string} searchTerm - Término de búsqueda
   * @returns {string} URL completa de búsqueda
   */
  buildSearchUrl(searchTerm) {
    const encodedTerm = encodeURIComponent(searchTerm);
    const searchPath = this.selectors.searchUrl.replace('{term}', encodedTerm);
    return `${this.baseUrl}${searchPath}`;
  }

  /**
   * Verifica si el proveedor soporta el tipo de contenido
   * @param {string} contentType - Tipo de contenido ('movie' o 'series')
   * @returns {boolean}
   */
  supportsContentType(contentType) {
    if (contentType === 'movie') {
      return this.capabilities.supportsMovies;
    }
    if (contentType === 'series') {
      return this.capabilities.supportsSeries;
    }
    return false;
  }

  /**
   * Verifica si el proveedor está disponible para usar
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Obtiene la configuración de headers para las requests
   * @returns {Object}
   */
  getRequestHeaders() {
    return { ...this.headers };
  }

  /**
   * Obtiene la configuración de rate limiting
   * @returns {Object}
   */
  getRateLimitConfig() {
    return { ...this.rateLimit };
  }

  /**
   * Verifica si requiere bypass de Cloudflare
   * @returns {boolean}
   */
  requiresCloudflareBypass() {
    return this.capabilities.requiresCloudflareBypass;
  }

  /**
   * Obtiene la prioridad del proveedor (menor número = mayor prioridad)
   * @returns {number}
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Compara proveedores por prioridad
   * @param {SearchProvider} other - Otro proveedor
   * @returns {number} -1 si este tiene mayor prioridad, 1 si menor, 0 si igual
   */
  comparePriority(other) {
    return this.priority - other.priority;
  }
}