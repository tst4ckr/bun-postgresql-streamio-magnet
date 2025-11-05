/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

// Cargar variables de entorno una sola vez, antes de cualquier otro import
import './config/loadEnv.js';

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { existsSync } from 'fs';
import { addonConfig, manifest } from './config/addonConfig.js';
import { CascadingMagnetRepository } from './infrastructure/repositories/CascadingMagnetRepository.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { TvHandler } from './application/handlers/TvHandler.js';
import { M3UTvRepository } from './infrastructure/repositories/M3UTvRepository.js';
import { EnhancedLogger } from './infrastructure/utils/EnhancedLogger.js';

/**
 * Clase principal que encapsula la lógica del addon.
 */
class MagnetAddon {
  #config;
  #logger;
  #magnetRepository;
  #addonBuilder;
  #streamHandler;
  #tvHandler;
  #tvRepository;
  #tvRefreshIntervalId;

  constructor() {
    this.#config = addonConfig;
    this.#logger = this.#createLogger();
    this.#logger.info('Inicializando Magnet Search Addon...');
  }

  /**
   * Inicializa los componentes del addon.
   */
  async initialize() {
    this.#logger.info('Configuración cargada:', this.#config);

    // 1. Inicializar Repositorio en Cascada
    this.#magnetRepository = new CascadingMagnetRepository(
      this.#config.repository.primaryCsvPath,
      this.#config.repository.secondaryCsvPath,
      this.#config.repository.animeCsvPath,
      this.#config.repository.torrentioApiUrl,
      this.#logger,
      this.#config.repository.timeout,
      undefined,
      this.#config.tor
    );
    await this.#magnetRepository.initialize();
    this.#logger.info('Repositorio de magnets inicializado');

    // 2. Crear Addon Builder
    this.#addonBuilder = new addonBuilder(manifest);
    this.#logger.info(`Addon: ${manifest.name} v${manifest.version}`);

    // 3. Configurar Stream Handler
    this.#streamHandler = new StreamHandler(this.#magnetRepository, this.#config, this.#logger);

    // 4. Configurar handlers
    await this.#setupHandlers();

    // 5. Configurar rutas adicionales
    this.#setupAdditionalRoutes();
  }

  /**
   * Configura todos los handlers del addon.
   * @private
   */
  async #setupHandlers() {
    const m3uUrl = this.#config.repository.m3uUrl;
    
    this.#setupStreamHandler();
    
    if (m3uUrl) {
      // Validar que la fuente M3U sea usable: http/https, file:// o ruta local existente
      let canSetupTv = false;
      try {
        const urlObj = new URL(m3uUrl);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:' || urlObj.protocol === 'file:') {
          canSetupTv = true;
        } else {
          this.#logger.warn(`M3U_URL con protocolo no soportado: ${m3uUrl}.`);
        }
      } catch (_err) {
        // No es URL válida, intentar como ruta local
        if (existsSync(m3uUrl)) {
          canSetupTv = true;
        } else {
          this.#logger.warn(`Ruta local M3U no encontrada: ${m3uUrl}.`);
        }
      }

      if (canSetupTv) {
        await this.#setupTvHandler(m3uUrl);
      } else {
        this.#logger.warn('TV deshabilitado por fuente M3U inválida');
      }
    }

    this.#setupCatalogHandler();
    this.#setupMetaHandler();
  }

  /**
   * Configura rutas adicionales.
   * @private
   */
  #setupAdditionalRoutes() {
    this.#logger.info('Rutas adicionales configuradas');
  }

  /**
   * Configura StreamHandler para magnets (movies, series, anime).
   * @private
   */
  #setupStreamHandler() {
    this.#addonBuilder.defineStreamHandler(async (args) => {
      this.#logger.info(`[DEBUG] Main Stream Handler - Incoming request:`, {
        type: args.type,
        id: args.id,
        fullArgs: args,
        timestamp: new Date().toISOString()
      });

      try {
        // Delegar a StreamHandler para todo tipo excepto TV o Channel
        if (args.type !== 'tv' && args.type !== 'channel') {
          this.#logger.debug(`[DEBUG] Delegating to StreamHandler for type: ${args.type}`);
          const result = await this.#streamHandler.createAddonHandler()(args);
          this.#logger.debug(`[DEBUG] StreamHandler result:`, {
            streamsCount: result?.streams?.length || 0,
            hasStreams: !!(result?.streams?.length)
          });
          return result;
        }
        
        // Para TV o Channel, usar TvHandler si está disponible
        this.#logger.debug(`[DEBUG] Processing TV request - TvHandler available: ${!!this.#tvHandler}`);
        if (this.#tvHandler) {
          this.#logger.debug(`[DEBUG] Delegating to TvHandler for type: ${args.type}`);
          const result = await this.#tvHandler.createStreamHandler()(args);
          this.#logger.debug(`[DEBUG] TvHandler result:`, {
            streamsCount: result?.streams?.length || 0,
            hasStreams: !!(result?.streams?.length),
            cacheMaxAge: result?.cacheMaxAge
          });
          return result;
        }
        
        this.#logger.warn(`[DEBUG] No TvHandler available for TV request - returning empty streams`);
        return { streams: [] };
      } catch (error) {
        this.#logger.error('[DEBUG] Error in main stream handler', { 
          error: error.message, 
          stack: error.stack,
          args,
          errorType: error.constructor.name
        });
        return { streams: [] };
      }
    });
    
    this.#logger.info('StreamHandler configurado.');
  }

  /**
   * Configura TvHandler para canales de TV M3U.
   * @private
   * @param {string} m3uUrl - URL del archivo M3U
   */
  async #setupTvHandler(m3uUrl) {
    try {
      this.#tvRepository = new M3UTvRepository(m3uUrl, this.#config, this.#logger);
      this.#tvHandler = new TvHandler(this.#tvRepository, this.#config, this.#logger);
      this.#logger.info('TvHandler configurado');

      // Evitar crear más de un intervalo de refresco
      if (this.#tvRefreshIntervalId) {
        this.#logger.warn('Intervalo de refresco de TV ya existe. No se crea otro.');
        return;
      }

      // Iniciar el refresco periódico de canales de TV (protegido contra solapamientos)
      const refreshInterval = Number(this.#config.repository.m3uCacheTimeout || (5 * 60 * 1000));
      let isRefreshingTv = false;
      this.#tvRefreshIntervalId = setInterval(async () => {
        if (isRefreshingTv) {
          this.#logger.warn('Saltando refresh de TV: ya hay un proceso de refresh en curso');
          return;
        }
        isRefreshingTv = true;
        try {
          this.#logger.info('Refrescando canales de TV desde la fuente M3U...');
          await this.#tvRepository.refreshTvs();
          this.#logger.info('Canales de TV refrescados con éxito.');
        } catch (error) {
          this.#logger.error('Error al refrescar los canales de TV:', error);
        } finally {
          isRefreshingTv = false;
        }
      }, refreshInterval);
    } catch (error) {
      this.#logger.error('Error configurando TvHandler:', error);
      throw error;
    }
  }

  /**
   * Configura handler de catálogo.
   * @private
   */
  #setupCatalogHandler() {
    this.#addonBuilder.defineCatalogHandler(async (args) => {
      this.#logger.info(`[DEBUG] Main Catalog Handler - Incoming request:`, {
        type: args.type,
        id: args.id,
        extra: args.extra,
        timestamp: new Date().toISOString()
      });
      try {
        // Solo TvHandler maneja catálogos para TV y Channel
        if ((args.type === 'tv' || args.type === 'channel') && this.#tvHandler) {
          return await this.#tvHandler.createCatalogHandler()(args);
        }
        
        // StreamHandler no maneja catálogos
        return { metas: [] };
      } catch (error) {
        this.#logger.error('Error in catalog handler', { error: error.message, args });
        return { metas: [] };
      }
    });
    
    this.#logger.info('CatalogHandler configurado.');
  }



  /**
   * Configura Meta Handler.
   * @private
   */
  #setupMetaHandler() {
    this.#addonBuilder.defineMetaHandler(async (args) => {
      this.#logger.info(`[DEBUG] Main Meta Handler - Incoming request:`, {
        type: args.type,
        id: args.id,
        fullArgs: args,
        timestamp: new Date().toISOString()
      });

      try {
        // Delegar a TvHandler para TV y Channel
        if ((args.type === 'tv' || args.type === 'channel') && this.#tvHandler) {
          this.#logger.debug(`[DEBUG] Delegating to TvHandler for ${args.type} meta request`);
          const result = await this.#tvHandler.createMetaHandler()(args);
          this.#logger.debug(`[DEBUG] TvHandler meta result:`, {
            hasMetaId: !!result?.meta?.id,
            metaType: result?.meta?.type,
            metaName: result?.meta?.name,
            defaultVideoId: result?.meta?.behaviorHints?.defaultVideoId,
            videosCount: Array.isArray(result?.meta?.videos) ? result.meta.videos.length : 0,
            cacheMaxAge: result?.cacheMaxAge
          });
          return result;
        }
        
        this.#logger.debug(`[DEBUG] Non-TV meta request or no TvHandler - returning empty meta`);
        // Respuesta por defecto para otros tipos
        return { meta: {} };
      } catch (error) {
        this.#logger.error('[DEBUG] Error in main meta handler', { 
          error: error.message, 
          stack: error.stack,
          args,
          errorType: error.constructor.name
        });
        return { meta: {} };
      }
    });
    
    this.#logger.info('MetaHandler configurado.');
  }
  
  /**
   * Inicia el servidor HTTP del addon usando serveHTTP nativo del SDK.
   */
  async start() {
    // Protege contra múltiples inicios en el mismo proceso
    const START_FLAG = '__magnet_addon_started__';
    if (globalThis[START_FLAG]) {
      if (this.#logger) {
        this.#logger.warn('Detectado segundo intento de inicio del addon en el mismo proceso. Se omite.');
      } else {
        console.warn('Detectado segundo intento de inicio del addon en el mismo proceso. Se omite.');
      }
      return;
    }
    globalThis[START_FLAG] = true;
    await this.initialize();

    const port = Number(process.env.PORT || this.#config.server.port);
    this.#logger.info(`Iniciando servidor en el puerto ${port}...`);

    const addonInterface = this.#addonBuilder.getInterface();
    
    const serverOptions = {
      port: port,
      cacheMaxAge: this.#config.cache?.metadataCacheMaxAge || 3600,
    };

    serveHTTP(addonInterface, serverOptions)
      .then(({ url }) => {
        this.#logger.info(`✅ Addon iniciado en: ${url}`);
        this.#logger.info(`🔗 Manifiesto: ${url}/manifest.json`);
        this.#logger.info(`🚀 Servidor optimizado con SDK nativo de Stremio`);
      })
      .catch(error => {
        this.#logger.error('❌ Error al iniciar el servidor:', {
          error: error.message,
          stack: error.stack,
          code: error.code,
        });
        process.exit(1);
      });
  }

  /**
   * Crea un logger mejorado con configuración optimizada para producción.
   * @returns {EnhancedLogger} Logger con trazabilidad completa y overhead mínimo.
   */
  #createLogger() {
    const { logLevel, enableDetailedLogging, production } = this.#config.logging;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // En producción, usar configuración optimizada
    const sourceTracking = isProduction ? false : enableDetailedLogging;
    const productionConfig = isProduction ? production : {};
    
    return new EnhancedLogger(logLevel, sourceTracking, productionConfig);
  }
}

/**
 * Función principal para ejecutar el addon.
 */
async function main() {
  let logger;
  try {
    // Crear logger para errores fatales
    logger = new EnhancedLogger('error', false, {
      errorOnly: true,
      minimalOutput: true
    });
    
    const addon = new MagnetAddon();
    await addon.start();
  } catch (error) {
    // Asegurar que siempre usemos EnhancedLogger
    if (!logger) {
      logger = new EnhancedLogger('error', false, {
        errorOnly: true,
        minimalOutput: true
      });
    }
    
    logger.error('❌ Error fatal al iniciar el addon', {
      error: error.message || error,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    process.exit(1);
  }
}

// Exportar para uso externo
export { MagnetAddon };

// Ejecutar si es el módulo principal
if (import.meta.main) {
  main();
}