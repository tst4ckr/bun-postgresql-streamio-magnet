/**
 * @fileoverview Punto de entrada principal para VeoVeo Search Pro addon.
 * @description Addon avanzado de Stremio para búsqueda de contenido multimedia con sistema de búsqueda en cascada.
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
 * Gestor centralizado de errores para el addon.
 */
class ErrorManager {
  #logger;

  constructor(logger) {
    this.#logger = logger;
  }

  /**
   * Maneja errores de handlers con estrategia unificada.
   * @param {Error} error - Error capturado
   * @param {string} context - Contexto donde ocurrió el error
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Respuesta estandarizada de error
   */
  handleError(error, context, metadata = {}) {
    const errorInfo = {
      error: error.message || error,
      context,
      timestamp: new Date().toISOString(),
      errorType: error.constructor.name,
      ...metadata
    };

    // Log con stack trace solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      errorInfo.stack = error.stack;
    }

    this.#logger.error(`[${context}] Error capturado`, errorInfo);

    // Respuesta estandarizada según el contexto
    switch (context) {
      case 'stream':
        return { streams: [], cacheMaxAge: 300 };
      case 'catalog':
        return { metas: [], cacheMaxAge: 300 };
      case 'meta':
        return { meta: {}, cacheMaxAge: 300 };
      default:
        return { error: 'Internal server error' };
    }
  }
}

/**
 * Factory para inicialización de repositorios con inyección de dependencias.
 */
class RepositoryFactory {
  #config;
  #logger;
  #errorManager;

  constructor(config, logger, errorManager) {
    this.#config = config;
    this.#logger = logger;
    this.#errorManager = errorManager;
  }

  /**
   * Crea e inicializa el repositorio de magnets en cascada.
   * @returns {Promise<CascadingMagnetRepository>}
   */
  async createMagnetRepository() {
    try {
      const repository = new CascadingMagnetRepository(
        this.#config.repository.primaryCsvPath,
        this.#config.repository.secondaryCsvPath,
        this.#config.repository.animeCsvPath,
        this.#config.repository.torrentioApiUrl,
        this.#logger,
        this.#config.repository.timeout,
        undefined,
        this.#config.tor
      );
      
      await repository.initialize();
      this.#logger.info('✅ Repositorio de magnets inicializado correctamente');
      return repository;
    } catch (error) {
      throw new Error(`Error inicializando repositorio de magnets: ${error.message}`);
    }
  }

  /**
   * Crea e inicializa el repositorio de TV M3U si está configurado.
   * @returns {Promise<M3UTvRepository|null>}
   */
  async createTvRepository() {
    const { m3uUrl } = this.#config.repository;
    
    if (!m3uUrl) {
      this.#logger.info('📺 M3U URL no configurada, omitiendo repositorio de TV');
      return null;
    }

    try {
      const repository = new M3UTvRepository(m3uUrl, this.#config, this.#logger);
      this.#logger.info('✅ Repositorio de TV M3U inicializado correctamente');
      return repository;
    } catch (error) {
      this.#logger.warn(`⚠️ Error inicializando repositorio de TV: ${error.message}`);
      return null;
    }
  }
}

/**
 * Factory para creación de handlers con contratos claros.
 */
class HandlerFactory {
  #config;
  #logger;
  #errorManager;

  constructor(config, logger, errorManager) {
    this.#config = config;
    this.#logger = logger;
    this.#errorManager = errorManager;
  }

  /**
   * Crea el handler de streams con servicios especializados inyectados.
   * @param {CascadingMagnetRepository} magnetRepository
   * @returns {StreamHandler}
   */
  async createStreamHandler(magnetRepository) {
    // Importar servicios especializados con sus dependencias
    const { StreamValidationService } = await import('./application/services/StreamValidationService.js');
    const { StreamProcessingService } = await import('./application/services/StreamProcessingService.js');
    const { StreamCacheService } = await import('./application/services/StreamCacheService.js');
    const { StreamMetricsService } = await import('./application/services/StreamMetricsService.js');
    
    // Importar servicios auxiliares necesarios
    const { DynamicValidationService } = await import('./infrastructure/services/DynamicValidationService.js');
    const { IdDetectorService } = await import('./infrastructure/services/IdDetectorService.js');
    const { UnifiedIdService } = await import('./infrastructure/services/UnifiedIdService.js');
    
    // Instanciar servicios auxiliares
    const validationService = new DynamicValidationService({
      idDetectorService: new IdDetectorService(this.#logger),
      unifiedIdService: new UnifiedIdService(this.#config, this.#logger),
      logger: this.#logger,
      config: this.#config
    });
    const idDetectorService = new IdDetectorService(this.#logger);
    const unifiedIdService = new UnifiedIdService(this.#config, this.#logger);
    
    // Instanciar servicios especializados
    const streamValidationService = new StreamValidationService(
      validationService,
      idDetectorService,
      this.#logger
    );
    
    const streamProcessingService = new StreamProcessingService(
      magnetRepository,
      unifiedIdService,
      this.#logger
    );
    
    const streamCacheService = new StreamCacheService(
      this.#config,
      this.#logger
    );
    
    const streamMetricsService = new StreamMetricsService(
      this.#logger,
      this.#config
    );
    
    // Crear StreamHandler con servicios inyectados
    return new StreamHandler(
      streamValidationService,
      streamProcessingService,
      streamCacheService,
      streamMetricsService,
      this.#logger,
      this.#config
    );
  }

  /**
   * Crea el handler de TV con repositorio inyectado.
   * @param {M3UTvRepository} tvRepository
   * @returns {TvHandler|null}
   */
  createTvHandler(tvRepository) {
    if (!tvRepository) {
      return null;
    }
    return new TvHandler(tvRepository, this.#config, this.#logger);
  }

  /**
   * Crea handler unificado de streams con delegación inteligente.
   * @param {StreamHandler} streamHandler
   * @param {TvHandler|null} tvHandler
   * @returns {Function}
   */
  createUnifiedStreamHandler(streamHandler, tvHandler) {
    return async (args) => {
      this.#logger.debug(`[STREAM] Procesando solicitud:`, {
        type: args.type,
        id: args.id,
        timestamp: new Date().toISOString()
      });

      try {
        // Delegación por tipo de contenido
        if (args.type === 'tv' && tvHandler) {
          this.#logger.debug(`[STREAM] Delegando a TvHandler`);
          return await tvHandler.createStreamHandler()(args);
        }

        this.#logger.debug(`[STREAM] Delegando a StreamHandler para tipo: ${args.type}`);
        return await streamHandler.createAddonHandler()(args);
      } catch (error) {
        return this.#errorManager.handleError(error, 'stream', { args });
      }
    };
  }

  /**
   * Crea handler unificado de catálogos.
   * @param {TvHandler|null} tvHandler
   * @returns {Function}
   */
  createUnifiedCatalogHandler(tvHandler) {
    return async (args) => {
      this.#logger.debug(`[CATALOG] Procesando solicitud:`, {
        type: args.type,
        id: args.id
      });

      try {
        if (args.type === 'tv' && tvHandler) {
          return await tvHandler.createCatalogHandler()(args);
        }
        
        // Solo TV maneja catálogos en este addon
        return { metas: [], cacheMaxAge: 3600 };
      } catch (error) {
        return this.#errorManager.handleError(error, 'catalog', { args });
      }
    };
  }

  /**
   * Crea handler unificado de metadatos.
   * @param {TvHandler|null} tvHandler
   * @returns {Function}
   */
  createUnifiedMetaHandler(tvHandler) {
    return async (args) => {
      this.#logger.debug(`[META] Procesando solicitud:`, {
        type: args.type,
        id: args.id
      });

      try {
        if (args.type === 'tv' && tvHandler) {
          return await tvHandler.createMetaHandler()(args);
        }
        
        // Respuesta por defecto para otros tipos
        return { meta: {}, cacheMaxAge: 3600 };
      } catch (error) {
        return this.#errorManager.handleError(error, 'meta', { args });
      }
    };
  }
}

/**
 * Configurador del servidor con responsabilidad única.
 */
class ServerConfigurator {
  #config;
  #logger;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Genera configuración optimizada del servidor.
   * @returns {Object} Configuración del servidor
   */
  generateServerOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const serverOptions = {
      port: this.#config.server.port,
      cacheMaxAge: this.#config.cache?.metadataCacheMaxAge || 3600,
      static: this.#config.server.enableStaticFiles 
        ? this.#config.server.staticPath 
        : undefined
    };

    // Optimizaciones para producción
    if (isProduction) {
      serverOptions.cacheMaxAge = Math.max(serverOptions.cacheMaxAge, 7200);
      
      this.#logger.info('🚀 Configuración de producción aplicada:', {
        cacheMaxAge: `${serverOptions.cacheMaxAge}s`,
        staticServing: serverOptions.static ? 'habilitado' : 'deshabilitado'
      });
    }

    return serverOptions;
  }

  /**
   * Inicia el servidor con configuración optimizada.
   * @param {Object} addonInterface - Interfaz del addon
   * @param {Object} serverOptions - Opciones del servidor
   */
  startServer(addonInterface, serverOptions) {
    serveHTTP(addonInterface, serverOptions);
    
    const baseUrl = `http://127.0.0.1:${serverOptions.port}`;
    this.#logger.info(`✅ Addon iniciado en: ${baseUrl}`);
    this.#logger.info(`🔗 Manifiesto: ${baseUrl}/manifest.json`);
    
    this.#logger.debug('📊 Configuraciones aplicadas:', {
      port: serverOptions.port,
      cacheMaxAge: `${serverOptions.cacheMaxAge}s`,
      staticPath: serverOptions.static || 'no configurado',
      environment: process.env.NODE_ENV || 'development'
    });
  }
}

/**
 * Clase principal refactorizada con responsabilidades separadas.
 */
class MagnetAddon {
  #config;
  #logger;
  #errorManager;
  #repositoryFactory;
  #handlerFactory;
  #serverConfigurator;
  #addonBuilder;
  #tvRefreshInterval;

  constructor(dependencies = {}) {
    this.#config = dependencies.config || addonConfig;
    this.#logger = dependencies.logger || this.#createLogger();
    this.#errorManager = new ErrorManager(this.#logger);
    this.#repositoryFactory = new RepositoryFactory(this.#config, this.#logger, this.#errorManager);
    this.#handlerFactory = new HandlerFactory(this.#config, this.#logger, this.#errorManager);
    this.#serverConfigurator = new ServerConfigurator(this.#config, this.#logger);
    
    this.#logger.info('🔧 MagnetAddon inicializado con arquitectura refactorizada');
  }

  /**
   * Inicializa todos los componentes del addon de forma modular.
   */
  async initialize() {
    try {
      this.#logger.info('🚀 Iniciando inicialización del addon...');
      
      // 1. Inicializar repositorios
      const { magnetRepository, tvRepository } = await this.#initializeRepositories();
      
      // 2. Crear handlers con dependencias inyectadas
      const { streamHandler, tvHandler } = await this.#createHandlers(magnetRepository, tvRepository);
      
      // 3. Configurar addon builder
      this.#setupAddonBuilder(streamHandler, tvHandler);
      
      // 4. Configurar refresco automático de TV
      this.#setupTvRefresh(tvRepository);
      
      this.#logger.info('✅ Inicialización completada exitosamente');
    } catch (error) {
      this.#logger.error('❌ Error durante la inicialización:', {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Inicializa repositorios de forma independiente.
   * @private
   * @returns {Promise<Object>} Repositorios inicializados
   */
  async #initializeRepositories() {
    this.#logger.info('📦 Inicializando repositorios...');
    
    const [magnetRepository, tvRepository] = await Promise.allSettled([
      this.#repositoryFactory.createMagnetRepository(),
      this.#repositoryFactory.createTvRepository()
    ]);

    // Validar repositorio crítico de magnets
    if (magnetRepository.status === 'rejected') {
      throw new Error(`Repositorio de magnets falló: ${magnetRepository.reason.message}`);
    }

    // TV repository es opcional
    const tvRepo = tvRepository.status === 'fulfilled' ? tvRepository.value : null;
    if (tvRepository.status === 'rejected') {
      this.#logger.warn('⚠️ Repositorio de TV no disponible, continuando sin funcionalidad TV');
    }

    return {
      magnetRepository: magnetRepository.value,
      tvRepository: tvRepo
    };
  }

  /**
   * Crea handlers con dependencias inyectadas.
   * @private
   * @param {CascadingMagnetRepository} magnetRepository
   * @param {M3UTvRepository|null} tvRepository
   * @returns {Promise<Object>} Handlers creados
   */
  async #createHandlers(magnetRepository, tvRepository) {
    this.#logger.info('🎯 Creando handlers especializados...');
    
    const streamHandler = await this.#handlerFactory.createStreamHandler(magnetRepository);
    const tvHandler = this.#handlerFactory.createTvHandler(tvRepository);
    
    this.#logger.info(`📺 TV Handler: ${tvHandler ? 'habilitado' : 'deshabilitado'}`);
    
    return { streamHandler, tvHandler };
  }

  /**
   * Configura el addon builder con handlers unificados.
   * @private
   * @param {StreamHandler} streamHandler
   * @param {TvHandler|null} tvHandler
   */
  #setupAddonBuilder(streamHandler, tvHandler) {
    this.#logger.info('🔧 Configurando addon builder...');
    
    this.#addonBuilder = new addonBuilder(manifest);
    
    // Configurar handlers unificados con manejo de errores centralizado
    this.#addonBuilder.defineStreamHandler(
      this.#handlerFactory.createUnifiedStreamHandler(streamHandler, tvHandler)
    );
    
    this.#addonBuilder.defineCatalogHandler(
      this.#handlerFactory.createUnifiedCatalogHandler(tvHandler)
    );
    
    this.#addonBuilder.defineMetaHandler(
      this.#handlerFactory.createUnifiedMetaHandler(tvHandler)
    );
    
    this.#logger.info(`🎬 Addon configurado: ${manifest.name} v${manifest.version}`);
  }

  /**
   * Configura refresco automático de canales de TV.
   * @private
   * @param {M3UTvRepository|null} tvRepository
   */
  #setupTvRefresh(tvRepository) {
    if (!tvRepository) {
      return;
    }

    const refreshInterval = 5 * 60 * 1000; // 5 minutos
    this.#tvRefreshInterval = setInterval(async () => {
      try {
        this.#logger.debug('🔄 Refrescando canales de TV...');
        await tvRepository.refreshTvs();
        this.#logger.debug('✅ Canales de TV actualizados');
      } catch (error) {
        this.#errorManager.handleError(error, 'tv_refresh', { 
          interval: refreshInterval 
        });
      }
    }, refreshInterval);
    
    this.#logger.info(`⏰ Refresco automático de TV configurado (${refreshInterval / 1000}s)`);
  }

  /**
   * Inicia el servidor con configuración optimizada.
   */
  async start() {
    await this.initialize();

    const serverOptions = this.#serverConfigurator.generateServerOptions();
    const addonInterface = this.#addonBuilder.getInterface();
    
    this.#serverConfigurator.startServer(addonInterface, serverOptions);
  }

  /**
   * Limpia recursos al cerrar el addon.
   */
  cleanup() {
    if (this.#tvRefreshInterval) {
      clearInterval(this.#tvRefreshInterval);
      this.#logger.info('🧹 Refresco de TV detenido');
    }
  }

  /**
   * Crea logger optimizado según el entorno.
   * @private
   * @returns {EnhancedLogger}
   */
  #createLogger() {
    const { logLevel, enableDetailedLogging, production } = this.#config.logging;
    const isProduction = process.env.NODE_ENV === 'production';
    
    const sourceTracking = isProduction ? false : enableDetailedLogging;
    const productionConfig = isProduction ? production : {};
    
    return new EnhancedLogger(logLevel, sourceTracking, productionConfig);
  }
}

/**
 * Función principal optimizada con manejo de errores robusto.
 */
async function main() {
  let logger;
  let addon;
  
  try {
    // Logger para errores críticos
    logger = new EnhancedLogger('error', false, {
      errorOnly: true,
      minimalOutput: true
    });
    
    addon = new MagnetAddon();
    await addon.start();
    
    // Manejo de señales de cierre
    process.on('SIGINT', () => {
      logger.info('🛑 Cerrando addon...');
      addon.cleanup();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.info('🛑 Terminando addon...');
      addon.cleanup();
      process.exit(0);
    });
    
  } catch (error) {
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
    
    if (addon) {
      addon.cleanup();
    }
    
    process.exit(1);
  }
}

// Exportar para uso externo y testing
export { MagnetAddon, ErrorManager, RepositoryFactory, HandlerFactory, ServerConfigurator };

// Ejecutar si es el módulo principal
if (import.meta.main) {
  main();
}