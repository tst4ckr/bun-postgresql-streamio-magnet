/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { addonConfig, manifest } from './config/addonConfig.js';
import { CascadingMagnetRepository } from './infrastructure/repositories/CascadingMagnetRepository.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';

/**
 * Clase principal que encapsula la lógica del addon.
 */
class MagnetAddon {
  #config;
  #logger;
  #magnetRepository;
  #addonBuilder;

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
      this.#config.repository.torrentioApiUrl,
      this.#logger,
      this.#config.repository.timeout
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
  }

  /**
   * Configura rutas personalizadas para configuración de idioma.
   * @param {StreamHandler} streamHandler - Handler de streams
   */
  #setupLanguageRoutes(streamHandler) {
    // Ruta para configurar idioma prioritario
    this.#addonBuilder.defineResourceHandler('configure', async (args) => {
      const { action, language } = args;
      
      if (action === 'set-language' && language) {
        try {
          streamHandler.setPriorityLanguage(language);
          this.#logger.info(`Idioma prioritario configurado: ${language}`);
          return {
            success: true,
            message: `Idioma prioritario configurado a: ${language}`,
            currentLanguage: language
          };
        } catch (error) {
          this.#logger.error(`Error al configurar idioma: ${error.message}`);
          return {
            success: false,
            error: error.message
          };
        }
      }
      
      if (action === 'get-language') {
        const currentLanguage = streamHandler.getPriorityLanguage();
        return {
          success: true,
          currentLanguage: currentLanguage || 'none'
        };
      }
      
      return {
        success: false,
        error: 'Acción no válida. Use: set-language o get-language'
      };
    });
    
    this.#logger.info('Rutas de configuración de idioma configuradas.');
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
    this.#logger.info(`🌐 Configurar idioma: ${baseUrl}/configure/set-language/spanish`);
    this.#logger.info(`🔍 Ver idioma actual: ${baseUrl}/configure/get-language`);
  }

  /**
   * Crea un logger simple.
   * @returns {Object} Logger.
   */
  #createLogger() {
    const { logLevel } = this.#config.logging;

    return {
      info: (message, ...args) => {
        if (['info', 'debug'].includes(logLevel)) {
          console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
        }
      },
      warn: (message, ...args) => {
        if (['info', 'warn', 'debug'].includes(logLevel)) {
          console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
        }
      },
      error: (message, ...args) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
      },
      debug: (message, ...args) => {
        if (logLevel === 'debug') {
          console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
        }
      }
    };
  }
}

/**
 * Función principal para ejecutar el addon.
 */
async function main() {
  try {
    const addon = new MagnetAddon();
    await addon.start();
  } catch (error) {
    console.error('❌ Error fatal al iniciar el addon:', error.message || error);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
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