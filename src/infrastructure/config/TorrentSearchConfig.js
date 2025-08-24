/**
 * @fileoverview TorrentSearchConfig - Configuración centralizada para el sistema de búsqueda de torrents
 * Maneja variables de entorno sin valores hardcodeados
 */

export class TorrentSearchConfig {
  constructor() {
    this.config = this.loadConfiguration();
  }

  /**
   * Carga la configuración desde variables de entorno
   * @returns {Object}
   */
  loadConfiguration() {
    return {
      // Configuración del servidor
      server: {
        port: parseInt(process.env.PORT) || 7000,
        host: process.env.HOST || '0.0.0.0',
        timeout: parseInt(process.env.SERVER_TIMEOUT) || 30000,
        maxConcurrentSearches: parseInt(process.env.MAX_CONCURRENT_SEARCHES) || 3
      },

      // Configuración de cache
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        maxMemoryMB: parseInt(process.env.CACHE_MAX_MEMORY_MB) || 64,
        defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
        cleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300,
        maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES) || 1000
      },

      // Configuración de proveedores
      providers: {
        mejortorrent: {
          enabled: process.env.MEJORTORRENT_ENABLED !== 'false',
          priority: parseInt(process.env.MEJORTORRENT_PRIORITY) || 1,
          rateLimit: parseInt(process.env.MEJORTORRENT_RATE_LIMIT) || 10
        },
        wolfmax4k: {
          enabled: process.env.WOLFMAX4K_ENABLED !== 'false',
          priority: parseInt(process.env.WOLFMAX4K_PRIORITY) || 2,
          rateLimit: parseInt(process.env.WOLFMAX4K_RATE_LIMIT) || 5
        },
        cinecalidad: {
          enabled: process.env.CINECALIDAD_ENABLED !== 'false',
          priority: parseInt(process.env.CINECALIDAD_PRIORITY) || 3,
          rateLimit: parseInt(process.env.CINECALIDAD_RATE_LIMIT) || 8
        }
      },

      // Configuración de búsqueda
      search: {
        maxResults: parseInt(process.env.SEARCH_MAX_RESULTS) || 50,
        timeout: parseInt(process.env.SEARCH_TIMEOUT) || 30000,
        defaultLanguage: process.env.SEARCH_DEFAULT_LANGUAGE || 'es',
        parallelRequests: parseInt(process.env.SEARCH_PARALLEL_REQUESTS) || 3
      },

      // Configuración de logging
      logging: {
        level: process.env.LOG_LEVEL || 'info'
      },

      // Configuración de seguridad
      security: {
        enableCors: process.env.ENABLE_CORS !== 'false',
        corsOrigins: process.env.CORS_ORIGINS || '*',
        enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100
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
    return this.get(`providers.${providerId}.enabled`, false);
  }

  /**
   * Valida la configuración actual
   * @returns {Object} Resultado de la validación
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Validar configuración del servidor
    const port = this.get('server.port');
    if (!port || port < 1 || port > 65535) {
      errors.push('Puerto del servidor inválido');
    }

    // Validar proveedores
    const providers = ['mejortorrent', 'wolfmax4k', 'cinecalidad'];
    const enabledProviders = providers.filter(p => this.isProviderEnabled(p));
    if (enabledProviders.length === 0) {
      warnings.push('No hay proveedores habilitados');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Obtiene un resumen de la configuración
   * @returns {Object} Resumen de la configuración
   */
  getSummary() {
    const providers = ['mejortorrent', 'wolfmax4k', 'cinecalidad'];
    const enabledProviders = providers.filter(p => this.isProviderEnabled(p));

    return {
      server: {
        port: this.get('server.port'),
        host: this.get('server.host')
      },
      cache: {
        enabled: this.get('cache.enabled'),
        maxAge: this.get('cache.maxAge')
      },
      providers: {
        enabled: enabledProviders,
        count: enabledProviders.length
      },
      search: {
        timeout: this.get('search.timeout'),
        maxResults: this.get('search.maxResults')
      }
    };
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