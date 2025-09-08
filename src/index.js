/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { addonConfig, manifest } from './config/addonConfig.js';
import { CascadingMagnetRepository } from './infrastructure/repositories/CascadingMagnetRepository.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';
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

    // 4. Configurar rutas personalizadas para configuración de idioma
    this.#setupLanguageRoutes(streamHandler);
    
    // 5. Configurar rutas de diagnóstico (comentario informativo)
    this.#setupDiagnosticRoutes();
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
   * Inicia el servidor HTTP del addon.
   */
  async start() {
    await this.initialize();

    const { port } = this.#config.server;
    this.#logger.info(`Iniciando servidor en el puerto ${port}...`);

    serveHTTP(this.#addonBuilder.getInterface(), { port });

    const baseUrl = `http://127.0.0.1:${port}`;
    this.#logger.info(`✅ Addon iniciado en: ${baseUrl}`);
    this.#logger.info(`🔗 Manifiesto: ${baseUrl}/manifest.json`);
    this.#logger.info(`🌐 Configuración de idioma: Disponible mediante StreamHandler`);
    this.#logger.info(`📝 Idioma actual: ${this.#streamHandler.getPriorityLanguage() || 'spanish (por defecto)'}`);
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
    if (logger) {
      logger.error('❌ Error fatal al iniciar el addon', {
        error: error.message || error,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      console.error('❌ Error fatal al iniciar el addon:', error.message || error);
      if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
      }
    }
    process.exit(1);
  }
}

// Exportar para uso externo
export { MagnetAddon };

// Ejecutar si es el módulo principal
if (import.meta.main) {
  main();
}