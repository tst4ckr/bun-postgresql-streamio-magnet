/**
 * @fileoverview Punto de entrada principal para VeoVeo Search Pro addon.
 * @description Addon avanzado de Stremio para búsqueda de contenido multimedia con sistema de búsqueda en cascada.
 * Configura e inicia el servidor del addon de Stremio con inicialización por fases ordenada.
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { addonConfig, manifest } from './config/addonConfig.js';
import { CascadingMagnetRepository } from './infrastructure/repositories/CascadingMagnetRepository.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { TvHandler } from './application/handlers/TvHandler.js';
import { M3UTvRepository } from './infrastructure/repositories/M3UTvRepository.js';
import { EnhancedLogger } from './infrastructure/utils/EnhancedLogger.js';
import { TorService } from './infrastructure/services/TorService.js';
import { TVChannelProcessorService } from './infrastructure/services/TVChannelProcessorService.js';

/**
 * Gestor de inicialización por fases para dependencias tecnológicas.
 * Garantiza orden correcto y estabilidad en el arranque del sistema.
 */
class TechnicalBootstrapManager {
  #logger;
  #config;
  #phases;
  #currentPhase;
  #bootstrapState;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
    this.#currentPhase = 0;
    this.#bootstrapState = new Map();
    this.#phases = [
      { name: 'RUNTIME_VALIDATION', handler: this.#validateRuntimeEnvironment.bind(this) },
      { name: 'TOR_INITIALIZATION', handler: this.#initializeTorService.bind(this) },
      { name: 'NETWORK_VALIDATION', handler: this.#validateNetworkConnectivity.bind(this) },
      { name: 'STORAGE_PREPARATION', handler: this.#prepareStorageLayer.bind(this) },
      { name: 'TV_PROCESSOR_INITIALIZATION', handler: this.#initializeTVChannelProcessor.bind(this) },
      { name: 'SERVICE_DEPENDENCIES', handler: this.#initializeServiceDependencies.bind(this) }
    ];
  }

  /**
   * Ejecuta todas las fases de inicialización en orden secuencial.
   * @returns {Promise<Object>} Estado de inicialización completo
   */
  async executeBootstrap() {
    this.#logger.info('🚀 Iniciando bootstrap tecnológico por fases...');
    
    try {
      for (const phase of this.#phases) {
        await this.#executePhase(phase);
      }
      
      this.#logger.info('✅ Bootstrap tecnológico completado exitosamente');
      return this.#getBootstrapSummary();
    } catch (error) {
      this.#logger.error(`❌ Bootstrap falló en fase ${this.#getCurrentPhaseName()}:`, {
        phase: this.#getCurrentPhaseName(),
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      throw new Error(`Bootstrap tecnológico falló: ${error.message}`);
    }
  }

  /**
   * Ejecuta una fase específica con validación y logging.
   * @private
   * @param {Object} phase - Configuración de la fase
   */
  async #executePhase(phase) {
    const startTime = Date.now();
    this.#logger.info(`📋 Ejecutando fase: ${phase.name}`);
    
    try {
      const result = await phase.handler();
      const duration = Date.now() - startTime;
      
      this.#bootstrapState.set(phase.name, {
        status: 'SUCCESS',
        result,
        duration,
        timestamp: new Date().toISOString()
      });
      
      this.#logger.info(`✅ Fase ${phase.name} completada (${duration}ms)`);
      this.#currentPhase++;
    } catch (error) {
      this.#bootstrapState.set(phase.name, {
        status: 'FAILED',
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * FASE 1: Validación del entorno de ejecución (Bun, Node.js, etc.)
   * @private
   */
  async #validateRuntimeEnvironment() {
    this.#logger.debug('🔍 Validando entorno de ejecución...');
    
    const runtime = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      bunVersion: process.versions?.bun || 'N/A',
      environment: process.env.NODE_ENV || 'development',
      containerized: !!process.env.CONTAINER_ENV
    };

    // Validaciones críticas
    if (runtime.bunVersion === 'N/A' && !process.versions?.node) {
      throw new Error('Runtime JavaScript no detectado (Bun/Node.js requerido)');
    }

    // Validar variables de entorno críticas
    const requiredEnvVars = ['HOST', 'PORT'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName] && !this.#config.server[varName.toLowerCase()]);
    
    if (missingVars.length > 0) {
      this.#logger.warn(`⚠️ Variables de entorno faltantes: ${missingVars.join(', ')}`);
    }

    this.#logger.info('✅ Entorno de ejecución validado:', runtime);
    return runtime;
  }

  /**
   * FASE 2: Inicialización del servicio Tor
   * @private
   */
  async #initializeTorService() {
    this.#logger.debug('🔐 Inicializando servicio Tor...');
    
    const torService = new TorService(this.#config.tor, this.#logger);
    
    if (torService.isEnabled()) {
      this.#logger.info('🔐 Tor habilitado, verificando disponibilidad...');
      
      const isAvailable = await torService.isAvailable();
      if (!isAvailable) {
        this.#logger.warn('⚠️ Tor configurado pero no disponible, continuando sin proxy');
      } else {
        this.#logger.info('✅ Tor disponible y funcionando correctamente');
      }
    } else {
      this.#logger.info('ℹ️ Tor deshabilitado, usando conexión directa');
    }

    return {
      service: torService,
      enabled: torService.isEnabled(),
      available: torService.isEnabled() ? await torService.isAvailable() : false,
      config: torService.getConfig()
    };
  }

  /**
   * FASE 3: Validación de conectividad de red
   * @private
   */
  async #validateNetworkConnectivity() {
    this.#logger.debug('🌐 Validando conectividad de red...');
    
    const connectivityTests = [
      { name: 'DNS_RESOLUTION', test: () => this.#testDnsResolution() },
      { name: 'HTTP_CONNECTIVITY', test: () => this.#testHttpConnectivity() },
      { name: 'API_ENDPOINTS', test: () => this.#testApiEndpoints() }
    ];

    const results = {};
    
    for (const { name, test } of connectivityTests) {
      try {
        results[name] = await test();
        this.#logger.debug(`✅ ${name}: OK`);
      } catch (error) {
        results[name] = { error: error.message };
        this.#logger.warn(`⚠️ ${name}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * FASE 4: Preparación de la capa de almacenamiento
   * @private
   */
  async #prepareStorageLayer() {
    this.#logger.debug('💾 Preparando capa de almacenamiento...');
    
    const { CsvFileInitializer } = await import('./infrastructure/utils/CsvFileInitializer.js');
    
    const csvFiles = [
      { path: this.#config.repository.primaryCsvPath, name: 'magnets.csv' },
      { path: this.#config.repository.secondaryCsvPath, name: 'torrentio.csv' },
      { path: this.#config.repository.animeCsvPath, name: 'anime.csv' }
    ];

    const initResults = {};
    
    for (const { path, name } of csvFiles) {
      try {
        CsvFileInitializer.ensureCsvFileExists(path, name);
        initResults[name] = { status: 'READY', path };
        this.#logger.debug(`✅ ${name}: Inicializado`);
      } catch (error) {
        initResults[name] = { status: 'ERROR', error: error.message };
        this.#logger.error(`❌ ${name}: ${error.message}`);
        throw error;
      }
    }

    return initResults;
  }

  /**
   * FASE 5: Inicialización del servicio TVChannelProcessor
   * @private
   */
  async #initializeTVChannelProcessor() {
    this.#logger.debug('🎬 Inicializando TVChannelProcessor...');
    
    try {
      // Verificar si TVChannelProcessor está habilitado
      if (!this.#config.tvProcessor?.enabled) {
        this.#logger.info('📺 TVChannelProcessor deshabilitado en configuración');
        return {
          enabled: false, 
          status: 'disabled',
          message: 'TVChannelProcessor disabled in configuration'
        };
      }

      // Crear instancia del servicio
      const tvProcessorService = new TVChannelProcessorService(
        this.#logger, 
        this.#config
      );

      // Inicializar el servicio
      await tvProcessorService.initialize();

      this.#logger.info('✅ TVChannelProcessor inicializado correctamente');

      return {
        enabled: true,
        status: 'initialized',
        service: tvProcessorService,
        config: tvProcessorService.getConfig(),
        message: 'TVChannelProcessor initialized successfully'
      };

    } catch (error) {
      this.#logger.error('❌ Error inicializando TVChannelProcessor:', error);
      
      // Solo lanzar error si es crítico para el funcionamiento
      if (this.#config.tvProcessor?.integration?.replaceM3UTvRepository) {
        throw new Error(`Critical TVChannelProcessor initialization failed: ${error.message}`);
      }
      
      this.#logger.warn('⚠️ TVChannelProcessor falló pero el sistema continuará con M3UTvRepository');
      
      return {
        enabled: false,
        status: 'error',
        error: error.message,
        message: `TVChannelProcessor initialization failed: ${error.message}`
      };
    }
  }

  /**
   * FASE 6: Inicialización de dependencias de servicios
   * @private
   */
  async #initializeServiceDependencies() {
    this.#logger.debug('🔧 Inicializando dependencias de servicios...');
    
    // Validar que los servicios críticos estén disponibles
    const serviceChecks = {
      torService: this.#bootstrapState.get('TOR_INITIALIZATION')?.result?.service,
      storageLayer: this.#bootstrapState.get('STORAGE_PREPARATION')?.result,
      networkConnectivity: this.#bootstrapState.get('NETWORK_VALIDATION')?.result
    };

    // Agregar TVChannelProcessor al chequeo de servicios
    serviceChecks.tvProcessor = this.#bootstrapState.get('TV_PROCESSOR_INITIALIZATION')?.result;

    // Verificar integridad de dependencias críticas (excluyendo TVChannelProcessor que es opcional)
    const criticalDependencies = {
      torService: serviceChecks.torService,
      storageLayer: serviceChecks.storageLayer,
      networkConnectivity: serviceChecks.networkConnectivity
    };

    const missingDependencies = Object.entries(criticalDependencies)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingDependencies.length > 0) {
      throw new Error(`Dependencias críticas faltantes: ${missingDependencies.join(', ')}`);
    }

    return {
      dependencies: serviceChecks,
      readyForRepositoryInitialization: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Prueba de resolución DNS
   * @private
   */
  async #testDnsResolution() {
    const dns = await import('dns');
    return new Promise((resolve, reject) => {
      dns.resolve('google.com', (err) => {
        if (err) reject(new Error(`DNS resolution failed: ${err.message}`));
        else resolve({ status: 'OK' });
      });
    });
  }

  /**
   * Prueba de conectividad HTTP básica
   * @private
   */
  async #testHttpConnectivity() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://httpbin.org/status/200', {
        signal: controller.signal,
        method: 'HEAD'
      });
      
      clearTimeout(timeoutId);
      return { status: response.ok ? 'OK' : 'FAILED', statusCode: response.status };
    } catch (error) {
      return { status: 'FAILED', error: error.message };
    }
  }

  /**
   * Prueba de endpoints de API críticos
   * @private
   */
  async #testApiEndpoints() {
    const endpoints = [
      this.#config.repository.torrentioApiUrl
    ];

    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(endpoint, {
          signal: controller.signal,
          method: 'HEAD'
        });
        
        clearTimeout(timeoutId);
        results[endpoint] = { status: response.ok ? 'OK' : 'FAILED', statusCode: response.status };
      } catch (error) {
        results[endpoint] = { status: 'FAILED', error: error.message };
      }
    }

    return results;
  }

  /**
   * Obtiene el nombre de la fase actual
   * @private
   */
  #getCurrentPhaseName() {
    return this.#phases[this.#currentPhase]?.name || 'UNKNOWN';
  }

  /**
   * Genera resumen del estado de bootstrap
   * @private
   */
  #getBootstrapSummary() {
    const summary = {
      totalPhases: this.#phases.length,
      completedPhases: this.#currentPhase,
      success: this.#currentPhase === this.#phases.length,
      phases: Object.fromEntries(this.#bootstrapState),
      totalDuration: Array.from(this.#bootstrapState.values())
        .reduce((total, phase) => total + (phase.duration || 0), 0)
    };

    return summary;
  }

  /**
   * Obtiene el servicio Tor inicializado
   */
  getTorService() {
    return this.#bootstrapState.get('TOR_INITIALIZATION')?.result?.service || null;
  }

  /**
   * Obtiene el estado de la capa de almacenamiento
   */
  getStorageState() {
    return this.#bootstrapState.get('STORAGE_PREPARATION')?.result || null;
  }

  /**
   * Obtiene el servicio TVChannelProcessor inicializado
   */
  getTVChannelProcessorService() {
    return this.#bootstrapState.get('TV_PROCESSOR_INITIALIZATION')?.result?.service || null;
  }

  /**
   * Obtiene el estado del TVChannelProcessor
   */
  getTVChannelProcessorState() {
    return this.#bootstrapState.get('TV_PROCESSOR_INITIALIZATION')?.result || null;
  }
}
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
   * Crea el repositorio de TV apropiado basado en la configuración.
   * @returns {Promise<M3UTvRepository|TVChannelProcessorService|null>}
   */
  async createTvRepository() {
    try {
      // Verificar si TVChannelProcessor está disponible y habilitado para reemplazar M3UTvRepository
      const bootstrapManager = this.#config.bootstrapManager;
      const tvProcessorState = bootstrapManager?.getTVChannelProcessorState();
      
      if (tvProcessorState?.enabled && 
          tvProcessorState?.status === 'initialized' && 
          this.#config.tvProcessor?.integration?.replaceM3UTvRepository) {
        
        this.#logger.info('📺 Usando TVChannelProcessorService como repositorio de TV');
        return tvProcessorState.service;
      }

      // Fallback al M3UTvRepository tradicional
      const { m3uUrl } = this.#config.repository;
      
      if (!m3uUrl) {
        this.#logger.info('📺 M3U URL no configurada y TVChannelProcessor no disponible, omitiendo repositorio de TV');
        return null;
      }

      this.#logger.info('📺 Usando M3UTvRepository tradicional');
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
 * Función principal de inicialización del addon con bootstrap tecnológico ordenado.
 * Implementa inicialización por fases para garantizar estabilidad y orden.
 */
async function main() {
  let logger;
  let bootstrapManager;
  let addon;
  
  try {
    // FASE PREVIA: Configuración básica y logging
    const config = addonConfig;
    logger = new EnhancedLogger(config.logging.logLevel, false, {
      errorOnly: false,
      minimalOutput: false
    });
    
    logger.info('🎬 Iniciando Stremio Addon - VeoVeo Search Pro');
    logger.info(`📍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🏗️ Runtime: ${process.versions?.bun ? `Bun ${process.versions.bun}` : `Node.js ${process.version}`}`);
    
    // Inicializar gestor de bootstrap tecnológico
    bootstrapManager = new TechnicalBootstrapManager(config, logger);
    
    // Agregar referencia del bootstrapManager a la configuración para uso en factories
    config.bootstrapManager = bootstrapManager;
    
    // Ejecutar bootstrap por fases
    const bootstrapResult = await bootstrapManager.executeBootstrap();
    logger.info('📊 Bootstrap Summary:', {
      totalDuration: `${bootstrapResult.totalDuration}ms`,
      phases: bootstrapResult.completedPhases,
      success: bootstrapResult.success
    });

    // Inicializar addon con bootstrap completado
    addon = new MagnetAddon({ config, logger });
    await addon.start();
    
    logger.info('🚀 Addon iniciado exitosamente con bootstrap tecnológico:', {
      bootstrapDuration: `${bootstrapResult.totalDuration}ms`,
      torEnabled: bootstrapManager.getTorService()?.isEnabled() || false,
      storageFiles: Object.keys(bootstrapManager.getStorageState() || {})
    });
    
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
    
    return {
      addon,
      bootstrap: bootstrapResult,
      services: {
        torService: bootstrapManager.getTorService(),
        storageState: bootstrapManager.getStorageState()
      }
    };
    
  } catch (error) {
    if (!logger) {
      logger = new EnhancedLogger('error', false, {
        errorOnly: true,
        minimalOutput: true
      });
    }
    
    logger.error('❌ Error crítico durante la inicialización:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      phase: bootstrapManager?.getCurrentPhaseName?.() || 'UNKNOWN'
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