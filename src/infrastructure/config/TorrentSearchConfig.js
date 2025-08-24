/**
 * @fileoverview TorrentSearchConfig - Configuración centralizada para el sistema de búsqueda de torrents
 * Maneja variables de entorno y configuración por defecto
 */

export class TorrentSearchConfig {
  constructor() {
    this.config = this.loadConfiguration();
  }

  /**
   * Carga la configuración desde variables de entorno y valores por defecto
   * @returns {Object}
   */
  loadConfiguration() {
    return {
      // Configuración del servidor
      server: {
        port: parseInt(process.env.TORRENT_SEARCH_PORT) || 3000,
        host: process.env.TORRENT_SEARCH_HOST || '0.0.0.0',
        timeout: parseInt(process.env.TORRENT_SEARCH_TIMEOUT) || 30000,
        maxConcurrentSearches: parseInt(process.env.MAX_CONCURRENT_SEARCHES) || 3
      },

      // Configuración de cache
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        maxMemoryMB: parseInt(process.env.CACHE_MAX_MEMORY_MB) || 64,
        defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL) || 1800, // 30 minutos
        cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300000, // 5 minutos
        maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES) || 1000,
        searchTtl: parseInt(process.env.CACHE_SEARCH_TTL) || 1800 // 30 minutos
      },

      // Configuración de proveedores
      providers: {
        defaultProviders: this.parseProviderList(process.env.DEFAULT_PROVIDERS) || [
          'mejortorrent',
          'wolfmax4k', 
          'cinecalidad'
        ],
        enabledProviders: this.parseProviderList(process.env.ENABLED_PROVIDERS) || [
          'mejortorrent',
          'wolfmax4k',
          'cinecalidad'
        ],
        
        // Configuración específica de MejorTorrent
        mejortorrent: {
          enabled: process.env.MEJORTORRENT_ENABLED !== 'false',
          baseUrl: process.env.MEJORTORRENT_BASE_URL || 'https://mejortorrent.com',
          timeout: parseInt(process.env.MEJORTORRENT_TIMEOUT) || 15000,
          rateLimit: {
            requestsPerMinute: parseInt(process.env.MEJORTORRENT_RATE_LIMIT) || 30,
            burstLimit: parseInt(process.env.MEJORTORRENT_BURST_LIMIT) || 5
          },
          userAgent: process.env.MEJORTORRENT_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          priority: parseInt(process.env.MEJORTORRENT_PRIORITY) || 1
        },

        // Configuración específica de Wolfmax4k
        wolfmax4k: {
          enabled: process.env.WOLFMAX4K_ENABLED !== 'false',
          baseUrl: process.env.WOLFMAX4K_BASE_URL || 'https://wolfmax4k.com',
          timeout: parseInt(process.env.WOLFMAX4K_TIMEOUT) || 15000,
          rateLimit: {
            requestsPerMinute: parseInt(process.env.WOLFMAX4K_RATE_LIMIT) || 20,
            burstLimit: parseInt(process.env.WOLFMAX4K_BURST_LIMIT) || 3
          },
          userAgent: process.env.WOLFMAX4K_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          priority: parseInt(process.env.WOLFMAX4K_PRIORITY) || 2
        },

        // Configuración específica de Cinecalidad
        cinecalidad: {
          enabled: process.env.CINECALIDAD_ENABLED !== 'false',
          baseUrl: process.env.CINECALIDAD_BASE_URL || 'https://cinecalidad.com',
          timeout: parseInt(process.env.CINECALIDAD_TIMEOUT) || 15000,
          rateLimit: {
            requestsPerMinute: parseInt(process.env.CINECALIDAD_RATE_LIMIT) || 25,
            burstLimit: parseInt(process.env.CINECALIDAD_BURST_LIMIT) || 4
          },
          userAgent: process.env.CINECALIDAD_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          priority: parseInt(process.env.CINECALIDAD_PRIORITY) || 3
        }
      },

      // Configuración de búsqueda
      search: {
        maxResults: parseInt(process.env.SEARCH_MAX_RESULTS) || 50,
        defaultSortBy: process.env.SEARCH_DEFAULT_SORT_BY || 'quality',
        filterDuplicates: process.env.SEARCH_FILTER_DUPLICATES !== 'false',
        includeStats: process.env.SEARCH_INCLUDE_STATS === 'true',
        defaultLanguage: process.env.SEARCH_DEFAULT_LANGUAGE || 'es',
        minTermLength: parseInt(process.env.SEARCH_MIN_TERM_LENGTH) || 2,
        maxTermLength: parseInt(process.env.SEARCH_MAX_TERM_LENGTH) || 100
      },

      // Configuración de HTTP client
      http: {
        timeout: parseInt(process.env.HTTP_TIMEOUT) || 15000,
        maxRedirects: parseInt(process.env.HTTP_MAX_REDIRECTS) || 3,
        retryAttempts: parseInt(process.env.HTTP_RETRY_ATTEMPTS) || 2,
        retryDelay: parseInt(process.env.HTTP_RETRY_DELAY) || 1000,
        userAgent: process.env.HTTP_USER_AGENT || 'TorrentSearchBot/1.0',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      },

      // Configuración de logging
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
        enableSearchLogging: process.env.ENABLE_SEARCH_LOGGING !== 'false',
        enableErrorLogging: process.env.ENABLE_ERROR_LOGGING !== 'false',
        logFormat: process.env.LOG_FORMAT || 'combined'
      },

      // Configuración de seguridad
      security: {
        enableCors: process.env.ENABLE_CORS !== 'false',
        corsOrigins: this.parseCorsOrigins(process.env.CORS_ORIGINS) || ['*'],
        enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutos
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        trustProxy: process.env.TRUST_PROXY === 'true'
      },

      // Configuración de desarrollo
      development: {
        enableDebug: process.env.NODE_ENV === 'development',
        enableMockData: process.env.ENABLE_MOCK_DATA === 'true',
        enableDetailedErrors: process.env.NODE_ENV === 'development',
        enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS === 'true'
      },

      // Configuración de Stremio
      stremio: {
        addonId: process.env.STREMIO_ADDON_ID || 'org.torrent.search.addon',
        addonName: process.env.STREMIO_ADDON_NAME || 'Torrent Search Addon',
        addonVersion: process.env.STREMIO_ADDON_VERSION || '1.0.0',
        addonDescription: process.env.STREMIO_ADDON_DESCRIPTION || 'Addon para búsqueda de torrents en múltiples proveedores',
        addonLogo: process.env.STREMIO_ADDON_LOGO || 'https://via.placeholder.com/256x256/000000/FFFFFF?text=TS',
        addonBackground: process.env.STREMIO_ADDON_BACKGROUND || 'https://via.placeholder.com/1920x1080/1a1a1a/FFFFFF?text=Torrent+Search',
        supportedTypes: this.parseStringArray(process.env.STREMIO_SUPPORTED_TYPES) || ['movie', 'series'],
        idPrefixes: this.parseStringArray(process.env.STREMIO_ID_PREFIXES) || ['tt']
      }
    };
  }

  /**
   * Obtiene un valor de configuración
   * @param {string} path - Ruta del valor (ej: 'cache.maxMemoryMB')
   * @param {*} defaultValue - Valor por defecto
   * @returns {*}
   */
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * Establece un valor de configuración
   * @param {string} path - Ruta del valor
   * @param {*} value - Nuevo valor
   */
  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Verifica si un proveedor está habilitado
   * @param {string} providerId - ID del proveedor
   * @returns {boolean}
   */
  isProviderEnabled(providerId) {
    const providerConfig = this.get(`providers.${providerId}`);
    if (!providerConfig) return false;
    
    return providerConfig.enabled && 
           this.get('providers.enabledProviders', []).includes(providerId);
  }

  /**
   * Obtiene la configuración de un proveedor
   * @param {string} providerId - ID del proveedor
   * @returns {Object|null}
   */
  getProviderConfig(providerId) {
    return this.get(`providers.${providerId}`);
  }

  /**
   * Obtiene todos los proveedores habilitados
   * @returns {string[]}
   */
  getEnabledProviders() {
    return this.get('providers.enabledProviders', [])
      .filter(providerId => this.isProviderEnabled(providerId));
  }

  /**
   * Valida la configuración
   * @returns {Object} - Resultado de validación
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Validar configuración del servidor
    if (this.get('server.port') < 1 || this.get('server.port') > 65535) {
      errors.push('Puerto del servidor debe estar entre 1 y 65535');
    }

    // Validar configuración de cache
    if (this.get('cache.maxMemoryMB') < 1) {
      errors.push('Memoria máxima del cache debe ser mayor a 0');
    }

    if (this.get('cache.maxMemoryMB') > 512) {
      warnings.push('Memoria del cache excede 512MB, puede causar problemas en entornos limitados');
    }

    // Validar proveedores
    const enabledProviders = this.getEnabledProviders();
    if (enabledProviders.length === 0) {
      warnings.push('No hay proveedores habilitados');
    }

    // Validar timeouts
    if (this.get('server.timeout') < 5000) {
      warnings.push('Timeout del servidor muy bajo, puede causar errores');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Obtiene un resumen de la configuración
   * @returns {Object}
   */
  getSummary() {
    return {
      server: {
        port: this.get('server.port'),
        host: this.get('server.host'),
        timeout: this.get('server.timeout')
      },
      cache: {
        enabled: this.get('cache.enabled'),
        maxMemoryMB: this.get('cache.maxMemoryMB'),
        maxEntries: this.get('cache.maxEntries')
      },
      providers: {
        enabled: this.getEnabledProviders(),
        total: Object.keys(this.get('providers', {})).filter(key => 
          key !== 'defaultProviders' && key !== 'enabledProviders'
        ).length
      },
      search: {
        maxResults: this.get('search.maxResults'),
        defaultLanguage: this.get('search.defaultLanguage')
      },
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Métodos auxiliares privados

  /**
   * Parsea una lista de proveedores desde string
   * @param {string} providersString - String separado por comas
   * @returns {string[]|null}
   */
  parseProviderList(providersString) {
    if (!providersString) return null;
    return providersString.split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  /**
   * Parsea orígenes CORS desde string
   * @param {string} originsString - String separado por comas
   * @returns {string[]|null}
   */
  parseCorsOrigins(originsString) {
    if (!originsString) return null;
    return originsString.split(',').map(o => o.trim()).filter(o => o.length > 0);
  }

  /**
   * Parsea array de strings desde variable de entorno
   * @param {string} arrayString - String separado por comas
   * @returns {string[]|null}
   */
  parseStringArray(arrayString) {
    if (!arrayString) return null;
    return arrayString.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
}

// Instancia singleton
let configInstance = null;

/**
 * Obtiene la instancia singleton de configuración
 * @returns {TorrentSearchConfig}
 */
export function getConfig() {
  if (!configInstance) {
    configInstance = new TorrentSearchConfig();
  }
  return configInstance;
}

/**
 * Reinicia la configuración (útil para tests)
 */
export function resetConfig() {
  configInstance = null;
}

export default TorrentSearchConfig;