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
    this.#streamHandler = streamHandler;
    
    // Configurar handlers después de inicializar TV (se configurarán en #setupHandlers)
    this.#logger.info('Preparando configuración de handlers...');

    // 4. Configurar TV M3U (después de la cascada de magnets)
    await this.#setupTvHandlers();

    // 5. Configurar rutas personalizadas para configuración de idioma
    this.#setupLanguageRoutes(streamHandler);
    
    // 6. Configurar rutas de diagnóstico (comentario informativo)
    this.#setupDiagnosticRoutes();
  }

  /**
   * Configura handlers independientes según sus responsabilidades específicas.
   * StreamHandler para magnets, TvHandler para TV M3U (si está configurado).
   */
  async #setupTvHandlers() {
    const m3uUrl = this.#config.repository.m3uUrl;
    
    // Siempre configurar StreamHandler para magnets
    this.#setupStreamHandler();
    
    // Configurar TvHandler solo si M3U_URL está disponible
    if (m3uUrl) {
      await this.#setupTvHandler(m3uUrl);
    } else {
      this.#logger.info('M3U_URL no configurada. Funcionalidad de TV M3U deshabilitada.');
    }

    // Configurar handlers comunes
    this.#setupCatalogHandler();
    this.#setupMetaHandler();
  }

  /**
   * Configura StreamHandler para magnets (movies, series, anime).
   * @private
   */
  #setupStreamHandler() {
    // Configurar handler de streams para magnets
    this.#addonBuilder.defineStreamHandler(this.#createCombinedStreamHandler());
    
    this.#logger.info('StreamHandler configurado para magnets (movies, series, anime).');
  }

  /**
   * Configura TvHandler para canales de TV M3U.
   * @private
   * @param {string} m3uUrl - URL del archivo M3U
   */
  async #setupTvHandler(m3uUrl) {
    try {
      // Inicializar repositorio de TV M3U
      this.#tvRepository = new M3UTvRepository(m3uUrl, this.#config, this.#logger);
      
      // Inicializar handler de TV
      this.#tvHandler = new TvHandler(this.#tvRepository, this.#config, this.#logger);
      
      this.#logger.info(`TvHandler configurado para TV M3U con URL: ${m3uUrl}`);
    } catch (error) {
      this.#logger.error('Error configurando TvHandler:', error);
      throw error;
    }
  }

  /**
   * Configura handler de catálogo combinado para todos los tipos.
   * @private
   */
  #setupCatalogHandler() {
    this.#addonBuilder.defineCatalogHandler(this.#createCombinedCatalogHandler());
    this.#logger.info('Handler de catálogo combinado configurado para todos los tipos.');
  }

  /**
   * Crea un handler combinado de streams que maneja tanto magnets como TV.
   * @private
   * @returns {Function} Handler combinado de streams
   */
  #createCombinedStreamHandler() {
    return async (args) => {
      try {
        // Si es tipo 'tv', usar TvHandler
        if (args.type === 'tv' && this.#tvHandler) {
          return await this.#tvHandler.createStreamHandler()(args);
        }
        
        // Para otros tipos (movie, series), usar StreamHandler
        return await this.#streamHandler.createAddonHandler()(args);
      } catch (error) {
        this.#logger.error('Error in combined stream handler', { error: error.message, args });
        return { streams: [] };
      }
    };
  }

  /**
   * Crea un handler combinado de catálogos que maneja tanto magnets como TV.
   * @private
   * @returns {Function} Handler combinado de catálogos
   */
  #createCombinedCatalogHandler() {
    return async (args) => {
      try {
        // Si es tipo 'tv', usar TvHandler
        if (args.type === 'tv' && this.#tvHandler) {
          return await this.#tvHandler.createCatalogHandler()(args);
        }
        
        // Para otros tipos, retornar catálogo vacío (StreamHandler no maneja catálogos)
        return { 
          metas: [], 
          cacheMaxAge: this.#config.cache.catalogCacheMaxAge,
          staleRevalidate: this.#config.cache.staleRevalidate,
          staleError: this.#config.cache.staleError
        };
      } catch (error) {
        this.#logger.error('Error in combined catalog handler', { error: error.message, args });
        return { metas: [] };
      }
    };
  }

  /**
   * Configura Meta Handler mejorado para TV y otros contenidos.
   * @private
   */
  #setupMetaHandler() {
    this.#addonBuilder.defineMetaHandler(async (args) => {
      this.#logger.info('Meta request received', { type: args.type, id: args.id });
      
      try {
        // Para canales de TV, buscar el canal real en el repositorio
        if (args.type === 'tv' && this.#tvHandler) {
          // Mapear ID alternativo si es necesario (reutilizar lógica de TvHandler)
          const actualId = this.#mapAlternativeTvId(args.id);
          const tv = await this.#tvRepository.getTvById(actualId);
          
          if (tv) {
            this.#logger.info(`TV channel found for meta: ${tv.name} (${actualId})`);
            return {
              meta: tv.toStremioMeta(),
              cacheMaxAge: this.#config.cache.metadataCacheMaxAge
            };
          } else {
            this.#logger.warn(`TV channel not found for meta: ${args.id} (mapped: ${actualId})`);
          }
        }
        
        // Para otros tipos o si no se encontró el canal, retornar metadatos básicos
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

    this.#logger.info('MetaHandler configurado con soporte para TV.');
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
   * Mapea IDs alternativos de TV a IDs correctos (reutiliza lógica de TvHandler).
   * @private
   * @param {string} id - ID original
   * @returns {string} ID mapeado o el original si no hay mapeo
   */
  #mapAlternativeTvId(id) {
    // Mapeo de IDs alternativos comunes para TV
    const idMappings = {
      // Bob Esponja - mapeos comunes
      'tv_ch_kids_bobesponjala': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_bobesponja': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_bobespoja': 'tv_ch_kids_bobesponjalatam',
      'tv_ch_kids_spongebob': 'tv_ch_kids_bobesponjalatam',
      
      // Bob l'éponge - versión francesa
      'tv_ch_kids_boblponge': 'tv_ch_kids_boblponge',
      'tv_ch_kids_bobleponge': 'tv_ch_kids_boblponge',
      
      // Pluto TV Bob Esponja
      'tv_ch_kids_plutotvbobesponja': 'tv_ch_kids_plutotvbobesponja720p',
      'tv_ch_kids_plutotvspongebob': 'tv_ch_kids_plutotvbobesponja720p'
    };

    return idMappings[id] || id;
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