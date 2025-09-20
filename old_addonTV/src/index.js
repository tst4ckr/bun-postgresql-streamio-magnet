/**
 * Addon principal TV IPTV para Stremio
 * Implementa una arquitectura limpia con separación de responsabilidades
 */

import pkg from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = pkg;

// Cargar variables de entorno al inicio
import { EnvLoader } from './infrastructure/config/EnvLoader.js';
EnvLoader.getInstance();

// Configuración e infraestructura
import { TVAddonConfig } from './infrastructure/config/TVAddonConfig.js';
// Removed unused import M3UParserService
import { StreamHealthService } from './infrastructure/services/StreamHealthService.js';
import { SecurityMiddleware } from './infrastructure/middleware/SecurityMiddleware.js';
import { ErrorHandler } from './infrastructure/error/ErrorHandler.js';
import { EnhancedLoggerFactory } from './infrastructure/services/EnhancedLoggerService.js';

// Capa de aplicación
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { CatalogHandler } from './application/handlers/CatalogHandler.js';
import { ChannelRepositoryFactory } from './infrastructure/factories/ChannelRepositoryFactory.js';
import { InvalidChannelManagementService } from './application/services/InvalidChannelManagementService.js';
import { ValidatedChannelsCsvService } from './application/services/ValidatedChannelsCsvService.js';

/**
 * Clase principal del addon TV IPTV para Stremio
 * Implementa el patrón Singleton y maneja el ciclo de vida completo del addon
 */
class TVIPTVAddon {

  #config;
  #logger;
  #channelRepository;
  #channelService;
  #healthService;
  #invalidChannelService;
  #catalogHandler;
  #addonBuilder;
  #securityMiddleware;
  #errorHandler;
  #isInitialized = false;

  constructor() {
    this.#config = TVAddonConfig.getInstance();
    this.#logger = this.#createLogger();
    this.#errorHandler = new ErrorHandler(this.#logger, this.#config);
    this.#securityMiddleware = new SecurityMiddleware(this.#config, this.#logger);
    this.#logger.info('Iniciando Addon...');
  }


  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Addon inicializado');
      return;
    }

    try {
      this.#logger.info('Configuración:', this.#config.toJSON());

      await this.#initializeChannelRepository();
      await this.#initializeServices();
      
      // Generar archivo CSV con canales validados antes de inicializar el addon
      await this.#generateValidatedChannelsCsv();
      
      this.#createAddonBuilder();
      this.#configureHandlers();
      if (this.#config.validation.validateStreamsOnStartup) {
        await this.#validateStreamsOnStartup();
      }

      this.#isInitialized = true;
      this.#logger.info('Addon listo');

    } catch (error) {
      this.#logger.error('Error de inicialización:', error); // ERROR: Fallo en inicialización
      throw error;
    }
  }


  async start() {
    if (!this.#isInitialized) {
      await this.initialize();
    }

    const addonInterface = this.#addonBuilder.getInterface();
    const { server } = this.#config;

    this.#logger.info(`Servidor en puerto ${server.port}`);

    const serverOptions = this.#securityMiddleware.configureServerOptions();
    serveHTTP(addonInterface, serverOptions);

    this.#logger.info(`Addon iniciado: ${this.#config.getBaseUrl()}`);
    this.#logger.info(`Manifest: ${this.#config.getBaseUrl()}/manifest.json`);
    this.#logger.info(`Instalar: ${this.#config.getBaseUrl()}/install`);
    
  }


  #createLogger() {
    const { logging } = this.#config;
    
    // Crear logger mejorado con información de archivo fuente y línea
    return EnhancedLoggerFactory.createCompatibleLogger({
      logLevel: logging.logLevel,
      enableRequestLogging: logging.enableRequestLogging,
      enablePerformanceMetrics: logging.enablePerformanceMetrics,
      logFilePath: logging.logFilePath
    });
  }


  async #initializeChannelRepository() {
    this.#logger.info(`Creando repositorio...`);
    this.#channelRepository = await ChannelRepositoryFactory.createRepository(this.#config, this.#logger);
  }


  async #initializeServices() {
    this.#logger.info('Iniciando servicios...');

    // Usar directamente el repositorio como servicio de canales
    this.#channelService = this.#channelRepository;

    this.#healthService = new StreamHealthService(this.#config, this.#logger);
    this.#invalidChannelService = new InvalidChannelManagementService(
      this.#channelRepository,
      this.#config,
      this.#logger
    );
    this.#catalogHandler = new CatalogHandler(
      this.#channelRepository,
      this.#config,
      this.#logger
    );

    this.#logger.info('Servicios listos');
  }

  async #generateValidatedChannelsCsv() {
    try {
      this.#logger.info('Creando CSV de canales...');
      
      const csvService = new ValidatedChannelsCsvService(this.#config, this.#logger);
      const channels = await this.#channelRepository.getAllChannels();
      
      await csvService.writeValidatedChannels(channels);
      
      this.#logger.info(`CSV creado: ${this.#config.dataSources.validatedChannelsCsv}`);
    } catch (error) {
      this.#logger.error('Error al crear CSV:', error);
      throw error;
    }
  }


  #createAddonBuilder() {
    this.#logger.info('Creando builder...');

    const manifest = this.#config.generateManifest();
    this.#logger.debug('Manifest:', manifest);

    this.#addonBuilder = new addonBuilder(manifest);
    
    this.#logger.info(`Builder creado: ${manifest.name} v${manifest.version}`);
  }

  #configureHandlers() {
    this.#logger.info('Configurando handlers...');

    // Configurar catalog handler
    this.#addonBuilder.defineCatalogHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleCatalogRequest.bind(this),
        'catalog'
      )
    );

    this.#addonBuilder.defineMetaHandler(
      this.#errorHandler.wrapAddonHandler(
        this.#handleMetaRequest.bind(this),
        'meta'
      )
    );

    const streamHandler = new StreamHandler(
      this.#channelService,
      this.#config,
      this.#logger
    );
    
    this.#addonBuilder.defineStreamHandler(streamHandler.createAddonHandler());

    this.#logger.info('Handlers listos');
  }


  async #handleCatalogRequest(args) {
    return await this.#catalogHandler.handleCatalogRequest(args);
  }

  async #handleMetaRequest(args) {
    const { type, id } = args;

    if (type !== 'tv') {
      return { meta: null };
    }

    const channel = await this.#channelService.getChannelById(id);
    
    if (!channel) {
      return { meta: null };
    }

    return {
      meta: channel.toMetaDetail(),
      cacheMaxAge: this.#config.cache.metaCacheMaxAge,
      staleRevalidate: this.#config.cache.metaCacheMaxAge * 2,
      staleError: this.#config.cache.metaCacheMaxAge * 4
    };
  }

  async #validateStreamsOnStartup() {
    const startTime = Date.now();
    try {
      const channels = await this.#channelRepository.getAllChannels();
      
      if (!channels?.length) {
        this.#logger.warn('Sin canales para validar');
        return;
      }
      
      const results = await this.#healthService.checkChannels(channels);
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      const total = results.length;
      const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : '0.0';
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      this.#logger.info(`Validación: ${ok}/${total} OK (${successRate}%) en ${duration}s`);
      
    } catch (error) {
      this.#logger.error('Error de validación:', error);
    }
  }




}


/**
 * Función principal de inicialización del addon
 * Maneja la creación e inicio del addon con manejo robusto de errores
 */
async function main() {
  try {
    const addon = new TVIPTVAddon();
    await addon.start();
  } catch (error) {
    console.error('❌ Error fatal:', error.message || error);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Ejecutar si es módulo principal o directamente importado
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  main();
}

// Exports principales
export { TVIPTVAddon };
export default main;