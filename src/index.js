/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
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
      await this.#setupTvHandler(m3uUrl);
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
        // Delegar a StreamHandler para todo tipo excepto TV
        if (args.type !== 'tv') {
          this.#logger.debug(`[DEBUG] Delegating to StreamHandler for type: ${args.type}`);
          const result = await this.#streamHandler.createAddonHandler()(args);
          this.#logger.debug(`[DEBUG] StreamHandler result:`, {
            streamsCount: result?.streams?.length || 0,
            hasStreams: !!(result?.streams?.length)
          });
          return result;
        }
        
        // Para TV, usar TvHandler si está disponible
        this.#logger.debug(`[DEBUG] Processing TV request - TvHandler available: ${!!this.#tvHandler}`);
        if (this.#tvHandler) {
          this.#logger.debug(`[DEBUG] Delegating to TvHandler for tv type`);
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

      // Iniciar el refresco periódico de canales de TV
      const refreshInterval = 5 * 60 * 1000; // 5 minutos
      setInterval(async () => {
        try {
          this.#logger.info('Refrescando canales de TV desde la fuente M3U...');
          await this.#tvRepository.refreshTvs();
          this.#logger.info('Canales de TV refrescados con éxito.');
        } catch (error) {
          this.#logger.error('Error al refrescar los canales de TV:', error);
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
        // Solo TvHandler maneja catálogos para TV
        if (args.type === 'tv' && this.#tvHandler) {
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
        // Delegar a TvHandler para TV
        if (args.type === 'tv' && this.#tvHandler) {
          this.#logger.debug(`[DEBUG] Delegating to TvHandler for tv meta request`);
          const result = await this.#tvHandler.createMetaHandler()(args);
          this.#logger.debug(`[DEBUG] TvHandler meta result:`, {
            hasMetaId: !!result?.meta?.id,
            metaType: result?.meta?.type,
            metaName: result?.meta?.name,
            defaultVideoId: result?.meta?.behaviorHints?.defaultVideoId,
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
    await this.initialize();

    // Usar siempre el puerto configurado en addonConfig para evitar conflictos con variables de entorno del sistema
    const { port: defaultPort } = this.#config.server;
    const port = Number(defaultPort);
    this.#logger.info(`Iniciando servidor en el puerto ${port}...`);

    // Usar serveHTTP nativo del SDK de Stremio
    // Incluye CORS automático y optimizaciones para addons
    const addonInterface = this.#addonBuilder.getInterface();
    
    const serverOptions = {
      port: port,
      cacheMaxAge: this.#config.cache?.metadataCacheMaxAge || 3600 // 1 hora por defecto
    };

    // Iniciar servidor con serveHTTP nativo
    serveHTTP(addonInterface, serverOptions);
    
    const baseUrl = `http://127.0.0.1:${port}`;
    this.#logger.info(`✅ Addon iniciado en: ${baseUrl}`);
    this.#logger.info(`🔗 Manifiesto: ${baseUrl}/manifest.json`);
    this.#logger.info(`🚀 Servidor optimizado con SDK nativo de Stremio`);
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