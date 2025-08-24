/**
 * @fileoverview TVAddonConfig - Configuración centralizada del addon
 * Implementa configuración dinámica sin hardcoding
 */

import { config } from 'dotenv';
import crypto from 'crypto';
import { Channel } from '../../domain/entities/Channel.js';

// Cargar variables de entorno
config({ path: '.env' });

/**
 * Configuración centralizada del addon de TV IPTV
 * Todos los valores son configurables via variables de entorno
 */
export class TVAddonConfig {
  static #instance = null;

  /**
   * @private
   */
  #config;

  /**
   * Constructor privado para implementar Singleton
   * @private
   */
  constructor() {
    this.#config = this.#loadConfiguration();
    this.#validateConfiguration();
    Object.freeze(this.#config);
  }

  /**
   * Obtiene la instancia única de configuración
   * @static
   * @returns {TVAddonConfig}
   */
  static getInstance() {
    if (!TVAddonConfig.#instance) {
      TVAddonConfig.#instance = new TVAddonConfig();
    }
    return TVAddonConfig.#instance;
  }

  /**
   * Carga la configuración desde variables de entorno
   * @private
   * @returns {Object}
   */
  #loadConfiguration() {
    const envSourceRaw = process.env.CHANNELS_SOURCE;
    const normalizedSource = this.#normalizeChannelSource(envSourceRaw);
    // Preferir automáticamente remote_m3u si no se especificó fuente pero hay M3U_URL
    const finalSource = (!envSourceRaw || envSourceRaw.trim() === '') && process.env.M3U_URL
      ? 'remote_m3u'
      : (normalizedSource || 'csv');

    return {
      // Configuración del servidor
      server: {
        port: parseInt(process.env.PORT) || 7000,
        host: process.env.HOST || '0.0.0.0',
        nodeEnv: process.env.NODE_ENV || 'development',
        enableCors: process.env.ENABLE_CORS === 'true',
        corsOrigin: process.env.CORS_ORIGIN || '*',
        enableHelmet: process.env.ENABLE_HELMET !== 'false',
        rateLimitRequestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE) || 100
      },

      // Configuración del addon
      addon: {
        id: process.env.ADDON_ID || 'org.stremio.tv-iptv-addon',
        name: process.env.ADDON_NAME || 'TV IPTV Addon',
        description: process.env.ADDON_DESCRIPTION || 'Canales de TV en vivo desde fuentes IPTV (M3U/RTMP)',
        version: process.env.ADDON_VERSION || '1.0.0',
        contactEmail: process.env.CONTACT_EMAIL || null,
        enableUserConfig: process.env.ENABLE_USER_CONFIG === 'true',
        enableDeepLinks: process.env.ENABLE_DEEP_LINKS !== 'false'
      },

      // Configuración de fuentes de datos
      dataSources: {
        channelsSource: finalSource,
        channelsFile: process.env.CHANNELS_FILE || 'data/channels.csv',
        m3uUrl: process.env.M3U_URL || null,
        backupM3uUrl: process.env.BACKUP_M3U_URL || null,
        enableAutoUpdate: process.env.ENABLE_AUTO_UPDATE === 'true',
        updateIntervalHours: parseInt(process.env.UPDATE_INTERVAL_HOURS) || 4
      },

      // Configuración de TV en vivo
      streaming: {
        defaultQuality: process.env.DEFAULT_QUALITY || 'HD',
        enableAdultChannels: process.env.ENABLE_ADULT_CHANNELS === 'true',
        cacheChannelsHours: parseInt(process.env.CACHE_CHANNELS_HOURS) || 6,
        streamTimeoutSeconds: parseInt(process.env.STREAM_TIMEOUT_SECONDS) || 30,
        maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS) || 100
      },

      // Configuración de assets
      assets: {
        logoCdnUrl: process.env.LOGO_CDN_URL || null,
        fallbackLogo: process.env.FALLBACK_LOGO || null,
        logoCacheHours: parseInt(process.env.LOGO_CACHE_HOURS) || 24,
        autoFetchLogos: process.env.AUTO_FETCH_LOGOS === 'true'
      },

      // Configuración de filtros
      filters: {
        allowedCountries: this.#parseCountryList(process.env.ALLOWED_COUNTRIES),
        blockedCountries: this.#parseCountryList(process.env.BLOCKED_COUNTRIES),
        defaultLanguage: process.env.DEFAULT_LANGUAGE || 'es',
        supportedLanguages: this.#parseLanguageList(process.env.SUPPORTED_LANGUAGES)
      },

      // Configuración de cache optimizada para streams en vivo según SDK
      cache: {
        // Cache corto para streams en vivo (recomendación SDK: 0-600 segundos)
        streamCacheMaxAge: parseInt(process.env.STREAM_CACHE_MAX_AGE) || 120, // 2 minutos
        streamStaleRevalidate: parseInt(process.env.STREAM_STALE_REVALIDATE) || 300, // 5 minutos
        streamStaleError: parseInt(process.env.STREAM_STALE_ERROR) || 900, // 15 minutos
        
        // Cache medio para catálogos (recomendación SDK: 1800-7200 segundos)
        catalogCacheMaxAge: parseInt(process.env.CATALOG_CACHE_MAX_AGE) || 1800, // 30 minutos
        
        // Cache medio para metadatos (recomendación SDK: 3600-86400 segundos)
        metaCacheMaxAge: parseInt(process.env.META_CACHE_MAX_AGE) || 3600, // 1 hora
        
        // Cache adicional para manifest (recomendación SDK: 86400 segundos)
        manifestCacheMaxAge: parseInt(process.env.MANIFEST_CACHE_MAX_AGE) || 86400 // 24 horas
      },

      // Configuración de validación
      validation: {
        validateStreamsOnStartup: process.env.VALIDATE_STREAMS_ON_STARTUP === 'true',
        validateStreamsIntervalMinutes: parseInt(process.env.VALIDATE_STREAMS_INTERVAL_MINUTES) || 15,
        removeInvalidStreams: process.env.REMOVE_INVALID_STREAMS === 'true',
        streamValidationTimeout: parseInt(process.env.STREAM_VALIDATION_TIMEOUT) || 10,
        validationBatchSize: parseInt(process.env.VALIDATION_BATCH_SIZE) || 50,
        validateAllChannels: process.env.VALIDATE_ALL_CHANNELS !== 'false',
        maxValidationConcurrency: parseInt(process.env.MAX_VALIDATION_CONCURRENCY) || 10
      },




      // Configuración de logs
      logging: {
        logLevel: process.env.LOG_LEVEL || 'info',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
        enablePerformanceMetrics: process.env.ENABLE_PERFORMANCE_METRICS === 'true',
        logFilePath: process.env.LOG_FILE_PATH || 'logs/addon.log'
      },

      // Configuración avanzada
      advanced: {
        enableFailover: process.env.ENABLE_FAILOVER === 'true',
        maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
        retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000
      }
    };
  }

  /**
   * Parsea lista de países desde variable de entorno
   * @private
   * @param {string} countryList 
   * @returns {string[]}
   */
  #parseCountryList(countryList) {
    if (!countryList) return [];
    return countryList.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0);
  }

  /**
   * Parsea lista de idiomas desde variable de entorno
   * @private
   * @param {string} languageList 
   * @returns {string[]}
   */
  #parseLanguageList(languageList) {
    if (!languageList) return [];
    return languageList.split(',').map(l => l.trim().toLowerCase()).filter(l => l.length > 0);
  }


  /**
   * Valida la configuración cargada
   * @private
   * @throws {Error}
   */
  #validateConfiguration() {
    const { server, addon, dataSources } = this.#config;

    // Validar configuración del servidor
    if (server.port < 1 || server.port > 65535) {
      throw new Error('Puerto del servidor debe estar entre 1 y 65535');
    }

    // Validar configuración del addon
    if (!addon.id || !addon.name) {
      throw new Error('ID y nombre del addon son requeridos');
    }

    // Validar ID del addon
    if (!this.#isValidAddonId(addon.id)) {
      throw new Error('ID del addon debe seguir el formato: org.domain.addon-name');
    }

    // Validar fuente de datos
    const validSources = (process.env.VALID_SOURCES || 'csv,m3u,remote_m3u,hybrid').split(',');
    if (!validSources.includes(dataSources.channelsSource)) {
      throw new Error(`Fuente de canales inválida. Valores válidos: ${validSources.join(', ')}`);
    }

    // Validar URLs si son necesarias
    if (dataSources.channelsSource.includes('m3u') && !dataSources.m3uUrl) {
      throw new Error('URL de M3U es requerida para fuentes remotas');
    }
  }

  /**
   * Normaliza el valor de CHANNELS_SOURCE para evitar typos (remote_m3u, remote_m3U, REMOTE_M3U, etc.)
   * @private
   * @param {string} source
   * @returns {string}
   */
  #normalizeChannelSource(source) {
    if (!source) return 'csv';
    const s = String(source).toLowerCase().trim();
    if (s === 'remote_m3u' || s === 'remote-m3u' || s === 'remotem3u') return 'remote_m3u';
    if (s === 'm3u' || s === 'local_m3u' || s === 'local-m3u') return 'm3u';
    if (s === 'csv') return 'csv';
    if (s === 'hybrid' || s === 'mixed') return 'hybrid';
    return s;
  }

  /**
   * Valida formato del ID del addon
   * @private
   * @param {string} id 
   * @returns {boolean}
   */
  #isValidAddonId(id) {
    const addonIdPattern = /^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/;
    return addonIdPattern.test(id);
  }

  // Getters para acceso a configuración

  get server() { return { ...this.#config.server }; }
  get addon() { return { ...this.#config.addon }; }
  get dataSources() { return { ...this.#config.dataSources }; }
  get streaming() { return { ...this.#config.streaming }; }
  get assets() { return { ...this.#config.assets }; }
  get filters() { return { ...this.#config.filters }; }
  get cache() { return { ...this.#config.cache }; }
  get validation() { return { ...this.#config.validation }; }



  get logging() { return { ...this.#config.logging }; }
  get advanced() { return { ...this.#config.advanced }; }

  /**
   * Obtiene toda la configuración
   * @returns {Object}
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.#config));
  }

  /**
   * Genera el manifest de Stremio optimizado para TV según especificaciones del SDK
   * @returns {Object}
   */
  generateManifest() {
    const { addon, streaming } = this.#config;

    // Incluir una firma de la configuración para invalidar caché del cliente
    // cuando cambie `config.env` (evita que Stremio persista estado viejo).
    const configSignature = this.getConfigSignature().slice(0, 8);
    const versionWithSignature = `${addon.version}+${configSignature}`;

    const manifest = {
      // Campos obligatorios según SDK
      id: addon.id,
      version: versionWithSignature,
      name: addon.name,
      description: addon.description,
      
      // Tipos de contenido soportados - usar 'tv' para canales en vivo
      types: ['tv'],
      
      // Recursos que el addon puede manejar
      resources: ['catalog', 'meta', 'stream'],
      
      // Catálogos disponibles
      catalogs: this.#generateTVCatalogs(),
      
      // Prefijos de ID para identificar contenido del addon
      idPrefixes: ['tv_'],
      
      // Configuración de comportamiento
      behaviorHints: {
        adult: false,
        p2p: false,
        configurable: false,
        configurationRequired: false
      }
    };

    // Agregar campos opcionales solo si están definidos
    if (addon.contactEmail) {
      manifest.contactEmail = addon.contactEmail;
    }

    if (addon.logo) {
      manifest.logo = addon.logo;
    }

    if (addon.background) {
      manifest.background = addon.background;
    }

    return manifest;
  }

  /**
   * Calcula una firma estable de la configuración relevante.
   * Cambia si se modifica `config.env` y se usa para bustear caché del cliente.
   * @returns {string} hash hex (sha256)
   */
  getConfigSignature() {
    // Solo los campos que impactan el comportamiento del addon hacia el cliente
    const relevant = {
      server: {
        port: this.#config.server.port,
        nodeEnv: this.#config.server.nodeEnv
      },
      dataSources: {
        channelsSource: this.#config.dataSources.channelsSource,
        channelsFile: this.#config.dataSources.channelsFile,
        m3uUrl: this.#config.dataSources.m3uUrl,
        backupM3uUrl: this.#config.dataSources.backupM3uUrl
      },
      streaming: this.#config.streaming,
      filters: this.#config.filters,
      cache: this.#config.cache,
      validation: this.#config.validation
    };

    const json = JSON.stringify(relevant);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Genera catálogos optimizados para TV
   * @private
   * @returns {Array}
   */
  /**
   * Genera catálogos según especificaciones del SDK de Stremio
   * @private
   * @returns {Array}
   */
  #generateTVCatalogs() {
    return [
      // Catálogo principal de canales TV
      {
        type: 'tv',
        id: 'tv_channels',
        name: 'Canales de TV',
        extra: [
          {
            name: 'search',
            isRequired: false
          },
          {
            name: 'genre',
            isRequired: false
          },
          {
            name: 'skip',
            isRequired: false
          }
        ]
      },
      // Catálogo de canales por país
      {
        type: 'tv',
        id: 'tv_by_country',
        name: 'Canales por País',
        extra: [
          {
            name: 'search',
            isRequired: false
          },
          {
            name: 'skip',
            isRequired: false
          }
        ]
      }
    ];
  }

  /**
   * Genera la configuración de usuario
   * @private
   * @returns {Array}
   */
  getConfig(section) {
    if (!section) return this.getAll();
    return { ...this.#config[section] };
  }

  /**
   * Verifica si está en modo desarrollo
   * @returns {boolean}
   */
  isDevelopment() {
    return this.#config.server.nodeEnv === 'development';
  }

  /**
   * Verifica si está en modo producción
   * @returns {boolean}
   */
  isProduction() {
    return this.#config.server.nodeEnv === 'production';
  }

  /**
   * Obtiene la URL base del addon
   * @returns {string}
   */
  getBaseUrl() {
    const { server } = this.#config;
    const protocol = server.nodeEnv === 'production' ? 'https' : 'http';
    const host = server.host === '0.0.0.0' ? 'localhost' : server.host;
    return `${protocol}://${host}:${server.port}`;
  }

  /**
   * Serializa la configuración para logs
   * @returns {Object}
   */
  toJSON() {
    const config = this.getAll();
    
    // Ocultar información sensible
    if (config.dataSources.m3uUrl) {
      config.dataSources.m3uUrl = '***HIDDEN***';
    }
    if (config.dataSources.backupM3uUrl) {
      config.dataSources.backupM3uUrl = '***HIDDEN***';
    }
    
    return config;
  }
}

export default TVAddonConfig;
