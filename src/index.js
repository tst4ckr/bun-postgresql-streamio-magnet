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
      try {
        // Delegar a StreamHandler para todo tipo excepto TV
        if (args.type !== 'tv') {
          return await this.#streamHandler.createAddonHandler()(args);
        }
        
        // Para TV, usar TvHandler si está disponible
        if (this.#tvHandler) {
          return await this.#tvHandler.createStreamHandler()(args);
        }
        
        return { streams: [] };
      } catch (error) {
        this.#logger.error('Error in stream handler', { error: error.message, args });
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
      try {
        // Solo TvHandler maneja catálogos
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
      try {
        // Delegar a TvHandler para TV
        if (args.type === 'tv' && this.#tvHandler) {
          return await this.#tvHandler.createMetaHandler()(args);
        }
        
        // Respuesta por defecto para otros tipos
        return { meta: {} };
      } catch (error) {
        this.#logger.error('Error in meta handler', { error: error.message, args });
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

    const { port } = this.#config.server;
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