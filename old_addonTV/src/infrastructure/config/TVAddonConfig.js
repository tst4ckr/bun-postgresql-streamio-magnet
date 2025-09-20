/**
 * @fileoverview TVAddonConfig - Configuración centralizada del addon
 * Implementa configuración dinámica sin hardcoding
 */

import crypto from 'crypto';
import { Channel } from '../../domain/entities/Channel.js';
import { EnvLoader } from './EnvLoader.js';

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
        // URLs M3U adicionales para múltiples fuentes
        m3uUrl1: process.env.M3U_URL1 || '',
        m3uUrl2: process.env.M3U_URL2 || '',
        m3uUrl3: process.env.M3U_URL3 || '',
        // Archivos M3U locales
        localM3uLatam1: process.env.LOCAL_M3U_LATAM1 || '',
        localM3uLatam2: process.env.LOCAL_M3U_LATAM2 || '',
        localM3uLatam3: process.env.LOCAL_M3U_LATAM3 || '',
        localM3uLatam4: process.env.LOCAL_M3U_LATAM4 || '',
        localM3uIndex: process.env.LOCAL_M3U_INDEX || '',
        // Archivo CSV local adicional
        localChannelsCsv: process.env.LOCAL_CHANNELS_CSV || '',
        // Archivo CSV de canales validados
        validatedChannelsCsv: process.env.VALIDATED_CHANNELS_CSV || 'data/tv.csv',
        // Configuración del modo automático
        autoM3uUrl: process.env.AUTO_M3U_URL || null
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
        supportedLanguages: this.#parseLanguageList(process.env.SUPPORTED_LANGUAGES),
        // Filtros de contenido
        filterReligiousContent: process.env.FILTER_RELIGIOUS_CONTENT === 'true',
        filterAdultContent: process.env.FILTER_ADULT_CONTENT === 'true',
        filterPoliticalContent: process.env.FILTER_POLITICAL_CONTENT === 'true',
        religiousKeywords: this.#parseKeywordList(process.env.RELIGIOUS_KEYWORDS),
        adultKeywords: this.#parseKeywordList(process.env.ADULT_KEYWORDS),
        politicalKeywords: this.#parseKeywordList(process.env.POLITICAL_KEYWORDS)
      },

      // Configuración de cache optimizada para streams en vivo según SDK
      cache: {
        // Cache corto para streams en vivo (recomendación SDK: 0-600 segundos)
        streamCacheMaxAge: parseInt(process.env.STREAM_CACHE_MAX_AGE) || 120, // 2 minutos
        streamStaleRevalidate: parseInt(process.env.STREAM_STALE_REVALIDATE) || 300, // 5 minutos
        streamStaleError: parseInt(process.env.STREAM_STALE_ERROR) || 900, // 15 minutos
        
        // catalogCacheMaxAge removed - catalog functionality disabled
        
        // Cache medio para metadatos (recomendación SDK: 3600-86400 segundos)
        metaCacheMaxAge: parseInt(process.env.META_CACHE_MAX_AGE) || 3600, // 1 hora
        
        // Cache adicional para manifest (recomendación SDK: 86400 segundos)
        manifestCacheMaxAge: parseInt(process.env.MANIFEST_CACHE_MAX_AGE) || 86400 // 24 horas
      },

      // Configuración de validación (solo manual, sin validación periódica automática)
      validation: {
        validateStreamsOnStartup: process.env.VALIDATE_STREAMS_ON_STARTUP === 'true',
        removeInvalidStreams: process.env.REMOVE_INVALID_STREAMS === 'true',
        streamValidationTimeout: parseInt(process.env.STREAM_VALIDATION_TIMEOUT) || 45, // Optimizado para alta latencia
        streamValidationMaxRetries: parseInt(process.env.STREAM_VALIDATION_MAX_RETRIES) || 3, // Más reintentos para conexiones lentas
        streamValidationRetryDelay: parseInt(process.env.STREAM_VALIDATION_RETRY_DELAY) || 2000,
        validationBatchSize: parseInt(process.env.VALIDATION_BATCH_SIZE) || 25, // Reducido para alta latencia
        maxValidationConcurrency: parseInt(process.env.MAX_VALIDATION_CONCURRENCY) || 5, // Optimizado para servidores internacionales
        // Configuración de conversión HTTPS a HTTP
        convertHttpsToHttp: process.env.CONVERT_HTTPS_TO_HTTP === 'true',
        validateHttpConversion: process.env.VALIDATE_HTTP_CONVERSION === 'true',
        httpConversionTimeout: parseInt(process.env.HTTP_CONVERSION_TIMEOUT) || 20, // Aumentado para alta latencia
        httpConversionMaxRetries: parseInt(process.env.HTTP_CONVERSION_MAX_RETRIES) || 3, // Más reintentos
        // Configuración de validación temprana
        enableEarlyValidation: process.env.ENABLE_EARLY_VALIDATION === 'true',
        earlyValidationTimeout: parseInt(process.env.EARLY_VALIDATION_TIMEOUT) || 30, // Optimizado para alta latencia
        earlyValidationConcurrency: parseInt(process.env.EARLY_VALIDATION_CONCURRENCY) || 3, // Reducido para alta latencia
        earlyValidationBatchSize: parseInt(process.env.EARLY_VALIDATION_BATCH_SIZE) || 15, // Reducido para alta latencia
        earlyValidationCacheSize: parseInt(process.env.EARLY_VALIDATION_CACHE_SIZE) || 1000,
        earlyValidationCacheTtl: parseInt(process.env.EARLY_VALIDATION_CACHE_TTL) || 3600,
        // Configuración de deduplicación inteligente
        enableIntelligentDeduplication: process.env.ENABLE_INTELLIGENT_DEDUPLICATION === 'true',
      deduplicationStrategy: process.env.DEDUPLICATION_STRATEGY || 'prioritize_working',
      // Archivos CSV que deben ignorarse en la deduplicación
      deduplicationIgnoreFiles: this.#parseFileList(process.env.DEDUPLICATION_IGNORE_FILES),
      // Umbrales de similitud para deduplicación
      nameSimilarityThreshold: parseFloat(process.env.NAME_SIMILARITY_THRESHOLD || '0.95'),
      urlSimilarityThreshold: parseFloat(process.env.URL_SIMILARITY_THRESHOLD || '0.98'),
      // Configuración adicional de deduplicación
      enableHdUpgrade: process.env.ENABLE_HD_UPGRADE !== 'false',
      preserveSourcePriority: process.env.PRESERVE_SOURCE_PRIORITY !== 'false',
      enableMetrics: process.env.ENABLE_DEDUPLICATION_METRICS !== 'false',
      
      // Validación antes del filtrado
      validateBeforeFiltering: process.env.VALIDATE_BEFORE_FILTERING === 'true',
      validateFilteredChannels: process.env.VALIDATE_FILTERED_CHANNELS === 'true',
      validateAfterFiltering: process.env.VALIDATE_AFTER_FILTERING === 'true',
      
      // Configuración de timeout para descarga de playlists
      playlistFetchTimeout: parseInt(process.env.PLAYLIST_FETCH_TIMEOUT) || 180000 // 3 minutos por defecto
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
   * Parsea lista de palabras clave desde variable de entorno
   * @private
   * @param {string} keywordList 
   * @returns {string[]}
   */
  #parseKeywordList(keywordList) {
    if (!keywordList) return [];
    return keywordList.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
  }

  /**
   * Parsea lista de archivos desde variable de entorno
   * @private
   * @param {string} fileList 
   * @returns {string[]}
   */
  #parseFileList(fileList) {
    if (!fileList) return [];
    return fileList.split(',').map(f => f.trim()).filter(f => f.length > 0);
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
      throw new Error('Puerto del servidor inválido');
    }

    // Validar configuración del addon
    if (!addon.id || !addon.name) {
      throw new Error('ID y nombre del addon requeridos');
    }

    // Validar ID del addon
    if (!this.#isValidAddonId(addon.id)) {
      throw new Error('ID de addon con formato inválido');
    }

    // Validar fuente de datos
    const validSources = (process.env.VALID_SOURCES || 'csv,m3u,remote_m3u,hybrid,automatic').split(',');
    if (!validSources.includes(dataSources.channelsSource)) {
      throw new Error(`Fuente de canales inválida. Usar: ${validSources.join(', ')}`);
    }

    // Validar URLs si son necesarias
    if (dataSources.channelsSource.includes('m3u') && !dataSources.m3uUrl) {
      throw new Error('URL M3U requerida para fuentes remotas');
    }

    // Validar configuración del modo automático
    if (dataSources.channelsSource === 'automatic' && !dataSources.autoM3uUrl) {
      throw new Error('URL M3U automática requerida');
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
    if (s === 'automatic' || s === 'auto') return 'automatic';
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
      
      // Catálogos disponibles desde tv.csv
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
   * Genera catálogos de TV desde tv.csv
   * @private
   * @returns {Array} Lista de catálogos configurados
   */
  #generateTVCatalogs() {
    return [
      {
        type: 'tv',
        id: 'tv_all',
        name: 'Todos los Canales',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_peru',
        name: 'Canales de Perú',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_hd',
        name: 'Canales HD',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_news',
        name: 'Noticias',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_sports',
        name: 'Deportes',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_entertainment',
        name: 'Entretenimiento',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'tv',
        id: 'tv_by_genre',
        name: 'Por Género',
        extra: [
          { name: 'genre', isRequired: false },
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
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
