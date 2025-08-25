/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { addonConfig, manifest } from './config/addonConfig.js';
import { MagnetRepositoryFactory } from './infrastructure/factories/MagnetRepositoryFactory.js';
import { MagnetService } from './application/services/MagnetService.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';

/**
 * Clase principal que encapsula la lógica del addon.
 */
class MagnetAddon {
  #config;
  #logger;
  #magnetRepository;
  #magnetService;
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

    // 1. Inicializar Repositorio
    this.#magnetRepository = MagnetRepositoryFactory.create(
      this.#config.repository.csvSource,
      this.#logger,
      this.#config.repository.timeout
    );
    await this.#magnetRepository.initialize();
    this.#logger.info('Repositorio de magnets inicializado.');

    // 2. Inicializar Servicio
    this.#magnetService = new MagnetService(this.#magnetRepository, this.#logger);
    this.#logger.info('Servicio de magnets inicializado.');

    // 3. Crear Addon Builder
    this.#addonBuilder = new addonBuilder(manifest);
    this.#logger.info(`Addon builder creado: ${manifest.name} v${manifest.version}`);

    // 4. Configurar Handlers
    const streamHandler = new StreamHandler(this.#magnetService, this.#config, this.#logger);
    this.#addonBuilder.defineStreamHandler(streamHandler.createAddonHandler());
    this.#logger.info('Handler de streams configurado.');
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