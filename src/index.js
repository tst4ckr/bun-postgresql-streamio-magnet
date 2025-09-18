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
      undefined, // idService (usar por defecto)
      this.#config.tor // configuración de Tor
    );
    await this.#magnetRepository.initialize();
    this.#logger.info('Repositorio de magnets en cascada inicializado.');

    // 2. Crear Addon Builder
    this.#addonBuilder = new addonBuilder(manifest);
    this.#logger.info(`Addon builder creado: ${manifest.name} v${manifest.version}`);

    // 3. Configurar Stream Handler
    const streamHandler = new StreamHandler(this.#magnetRepository, this.#config, this.#logger);
    this.#addonBuilder.defineStreamHandler(streamHandler.createAddonHandler());
    this.#logger.info('Handler de streams configurado.');

    // 3.1. Configurar Catalog Handler
    this.#addonBuilder.defineCatalogHandler(async (args) => {
      this.#logger.info('Catalog request received', { type: args.type, id: args.id, extra: args.extra });
      
      try {
        // Por ahora retornamos un catálogo vacío ya que este addon se enfoca en streams
        // En futuras versiones se puede implementar catálogos de contenido popular
        return {
          metas: [],
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error in catalog handler', { error: error.message, args });
        return { metas: [] };
      }
    });
    this.#logger.info('Handler de catálogos configurado.');

    // 3.2. Configurar Meta Handler
    this.#addonBuilder.defineMetaHandler(async (args) => {
      this.#logger.info('Meta request received', { type: args.type, id: args.id });
      
      try {
        // Retornar metadatos básicos basados en el ID
        // En futuras versiones se puede integrar con APIs de metadatos
        const meta = {
          id: args.id,
          type: args.type,
          name: `Content ${args.id}`,
          poster: this.#config.addon?.logo,
          background: this.#config.addon?.background
        };
        
        return {
          meta: meta,
          cacheMaxAge: this.#config.cache.metadataCacheMaxAge
        };
      } catch (error) {
        this.#logger.error('Error in meta handler', { error: error.message, args });
        return { meta: {} };
      }
    });
    this.#logger.info('Handler de metadatos configurado.');

    // 4. Configurar TV M3U (después de la cascada de magnets)
    await this.#setupTvHandlers();

    // 5. Configurar rutas personalizadas para configuración de idioma
    this.#setupLanguageRoutes(streamHandler);
    
    // 6. Configurar rutas de diagnóstico (comentario informativo)
    this.#setupDiagnosticRoutes();
  }

  /**
   * Configura handlers para TV M3U.
   * Solo se inicializa si M3U_URL está configurada.
   */
  async #setupTvHandlers() {
    const m3uUrl = this.#config.repository.m3uUrl;
    
    if (!m3uUrl) {
      this.#logger.info('M3U_URL no configurada. Funcionalidad de TV M3U deshabilitada.');
      return;
    }

    try {
      // Inicializar repositorio de TV M3U
      this.#tvRepository = new M3UTvRepository(m3uUrl, this.#config, this.#logger);
      
      // Inicializar handler de TV
      this.#tvHandler = new TvHandler(this.#tvRepository, this.#logger);

      // Configurar handler de catálogo para TV
      this.#addonBuilder.defineCatalogHandler(async (args) => {
        if (args.type === 'tv') {
          try {
            return await this.#tvHandler.handleCatalog(args);
          } catch (error) {
            this.#logger.error('Error en catálogo de TV:', error);
            return { metas: [] };
          }
        }
        // Para otros tipos, retornar vacío (manejado por otros handlers)
        return { metas: [] };
      });

      // Configurar handler de metadatos para TV
      this.#addonBuilder.defineMetaHandler(async (args) => {
        if (args.type === 'tv' && args.id.startsWith('tv:')) {
          try {
            return await this.#tvHandler.handleMeta(args);
          } catch (error) {
            this.#logger.error('Error en metadatos de TV:', error);
            return null;
          }
        }
        // Para otros tipos, retornar null (manejado por otros handlers)
        return null;
      });

      // Configurar handler de streams para TV
      this.#addonBuilder.defineStreamHandler(async (args) => {
        if (args.type === 'tv' && args.id.startsWith('tv:')) {
          try {
            return await this.#tvHandler.handleStream(args);
          } catch (error) {
            this.#logger.error('Error en stream de TV:', error);
            return { streams: [] };
          }
        }
        // Para otros tipos, usar el handler de magnets existente
        return await this.#streamHandler.handleStream(args);
      });

      this.#logger.info(`TV M3U configurado correctamente con URL: ${m3uUrl}`);
    } catch (error) {
      this.#logger.error('Error configurando TV M3U:', error);
    }
  }

  /**
   * Configura rutas personalizadas para configuración de idioma.
   * @param {StreamHandler} streamHandler - Handler de streams
   */
  #setupLanguageRoutes(streamHandler) {
    // Almacenar referencia al streamHandler para uso en rutas personalizadas
    this.#streamHandler = streamHandler;
    this.#logger.info('Configuración de idioma disponible mediante métodos del StreamHandler.');
  }

  /**
   * Configura rutas de diagnóstico simples
   */
  #setupDiagnosticRoutes() {
    // Diagnóstico disponible en servidor independiente (puerto 3004)
    // Usar: bun run scripts/diagnostic-server.js
    this.#logger.info('Diagnóstico disponible en servidor independiente.');
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