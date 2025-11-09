/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

// Cargar variables de entorno una sola vez, antes de cualquier otro import
import './config/loadEnv.js';

import { addonBuilder, serveHTTP, getRouter } from 'stremio-addon-sdk';
import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { addonConfig, getManifest, populateTvGenreOptionsFromCsv } from './config/addonConfig.js';
import { CascadingMagnetRepository } from './infrastructure/repositories/CascadingMagnetRepository.js';
import { StreamHandler } from './application/handlers/StreamHandler.js';
import { TvHandler } from './application/handlers/TvHandler.js';
import { CsvTvRepository } from './infrastructure/repositories/CsvTvRepository.js';
import { RemoteCsvTvRepository } from './infrastructure/repositories/RemoteCsvTvRepository.js';
import { M3UTvRepository } from './infrastructure/repositories/M3UTvRepository.js';
import { DynamicTvRepository } from './infrastructure/repositories/DynamicTvRepository.js';
import { IpRoutingService } from './infrastructure/services/IpRoutingService.js';
import { RequestContext } from './infrastructure/utils/RequestContext.js';
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
  #tvRefreshIntervalId;

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

    // 2. Preparar manifest con opciones de género dinámicas desde CSV (si disponible)
    await populateTvGenreOptionsFromCsv();
    const manifest = getManifest();

    // 3. Crear Addon Builder
    this.#addonBuilder = new addonBuilder(manifest);
    this.#logger.info(`Addon: ${manifest.name} v${manifest.version}`);

    // 4. Configurar Stream Handler
    this.#streamHandler = new StreamHandler(this.#magnetRepository, this.#config, this.#logger);

    // 5. Configurar handlers
    await this.#setupHandlers();
  }

  /**
   * Configura todos los handlers del addon.
   * @private
   */
  async #setupHandlers() {
    const csvDefaultPath = this.#config.repository.tvCsvDefaultPath;
    const csvWhitelistPath = this.#config.repository.tvCsvWhitelistPath;
    const m3uUrl = this.#config.repository.m3uUrl;
    const m3uUrlBackup = this.#config.repository.m3uUrlBackup;

    this.#setupStreamHandler();

    // Cadena de respaldo: CSV whitelist/default → M3U primario → M3U backup
    // Preparar repositorios y ruteo por IP
    let whitelistRepo = null;
    let defaultRepo = null;
    let m3uRepo = null;
    let m3uBackupRepo = null;

    const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

    // Inicializar repositorio CSV (whitelist) desde ruta local o URL
    try {
      if (csvWhitelistPath) {
        if (isUrl(csvWhitelistPath)) {
          this.#logger.info(`CSV whitelist remoto: ${csvWhitelistPath}`);
          whitelistRepo = new RemoteCsvTvRepository(csvWhitelistPath.trim(), this.#logger);
          await whitelistRepo.init();
        } else if (existsSync(csvWhitelistPath)) {
          this.#logger.info(`CSV whitelist local: ${csvWhitelistPath}`);
          whitelistRepo = new CsvTvRepository(csvWhitelistPath, this.#logger);
          await whitelistRepo.init();
        } else {
          this.#logger.warn(`CSV whitelist no encontrado en ruta local: ${csvWhitelistPath}`);
        }
      }
    } catch (err) {
      this.#logger.warn(`No se pudo inicializar CSV whitelist (${csvWhitelistPath}): ${err?.message || err}`);
    }

    // Inicializar repositorio CSV (default) desde ruta local o URL
    try {
      if (csvDefaultPath) {
        if (isUrl(csvDefaultPath)) {
          this.#logger.info(`CSV default remoto: ${csvDefaultPath}`);
          defaultRepo = new RemoteCsvTvRepository(csvDefaultPath.trim(), this.#logger);
          await defaultRepo.init();
        } else if (existsSync(csvDefaultPath)) {
          this.#logger.info(`CSV default local: ${csvDefaultPath}`);
          defaultRepo = new CsvTvRepository(csvDefaultPath, this.#logger);
          await defaultRepo.init();
        } else {
          this.#logger.warn(`CSV default no encontrado en ruta local: ${csvDefaultPath}`);
        }
      }
    } catch (err) {
      this.#logger.warn(`No se pudo inicializar CSV default: ${err?.message || err}`);
    }

    // Preparar M3U primario y backup si no hay CSVs
    const tryCreateM3URepo = async (url, label) => {
      if (url && typeof url === 'string' && url.trim()) {
        try {
          const repo = new M3UTvRepository(url.trim(), this.#config, this.#logger);
          const preloaded = await repo.getAllTvs();
          const count = preloaded?.length || 0;
          if (count === 0) throw new Error('M3U sin canales válidos');
          this.#logger.info(`M3U (${label}) cargado: ${count} canales`);
          return repo;
        } catch (e) {
          this.#logger.warn(`Error M3U (${label}): ${e?.message || e}`);
        }
      }
      return null;
    };

    if (!defaultRepo && !whitelistRepo) {
      m3uRepo = await tryCreateM3URepo(m3uUrl, 'M3U_URL');
      if (!m3uRepo) {
        m3uBackupRepo = await tryCreateM3URepo(m3uUrlBackup, 'M3U_URL_BACKUP');
      }
    }

    const ipRouting = new IpRoutingService(this.#config.ipRouting.whitelist, this.#config.ipRouting.cacheTtlSeconds, this.#logger);
    const dynamicRepo = new DynamicTvRepository({
      whitelistRepo,
      defaultRepo,
      m3uRepo,
      m3uBackupRepo,
      assignmentCacheTtlSeconds: 120
    }, ipRouting, this.#logger);

    this.#tvHandler = new TvHandler(dynamicRepo, this.#config, this.#logger);
    this.#logger.info('TvHandler configurado con DynamicTvRepository');

    this.#setupCatalogHandler();
    this.#setupMetaHandler();
  }

  /**
   * Configura rutas adicionales.
   * @private
   */
  #setupAdditionalRoutes(app) {
  // Configuración de rutas estáticas configurable
  const STATIC_DIR = process.env.STATIC_DIR || 'static';
  const STATIC_MOUNT_PATH = process.env.STATIC_MOUNT_PATH || '/static';
  app.use(STATIC_MOUNT_PATH, express.static(STATIC_DIR));
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
        // Para TV o Channel, usar TvHandler si está disponible
        if (args.type === 'tv' || args.type === 'channel') {
          this.#logger.debug(`[DEBUG] Processing TV request - TvHandler available: ${!!this.#tvHandler}`);
          if (this.#tvHandler) {
            this.#logger.debug(`[DEBUG] Delegating to TvHandler for type: ${args.type}`);
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
        }
        
        // Delegar a StreamHandler para el resto de tipos
        this.#logger.debug(`[DEBUG] Delegating to StreamHandler for type: ${args.type}`);
        const result = await this.#streamHandler.createAddonHandler()(args);
        this.#logger.debug(`[DEBUG] StreamHandler result:`, {
          streamsCount: result?.streams?.length || 0,
          hasStreams: !!(result?.streams?.length)
        });
        return result;
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
   * Configura TvHandler para canales de TV desde un archivo CSV.
   * @private
   * @param {string} csvPath - Ruta al archivo CSV
   */
  async #setupTvHandlerFromCsv(csvPath) {
    try {
      const tvRepository = new CsvTvRepository(csvPath, this.#logger);
      await tvRepository.init(); // Cargar los datos del CSV
      this.#tvHandler = new TvHandler(tvRepository, this.#config, this.#logger);
      this.#logger.info('TvHandler configurado con CsvTvRepository');
    } catch (error) {
      this.#logger.error('Error configurando TvHandler con CSV:', error);
      throw error;
    }
  }

  /**
   * Configura TvHandler para canales de TV desde una fuente M3U.
   * @private
   * @param {string} m3uUrl - URL o ruta al archivo M3U
   */
  async #setupTvHandlerFromM3U(m3uUrl) {
    try {
      this.#logger.info(`Usando M3U_URL: ${m3uUrl}`);
      const tvRepository = new M3UTvRepository(m3uUrl, this.#config, this.#logger);
      // Cargar inicialmente para detectar errores tempranos y evitar "empty content"
      const preloaded = await tvRepository.getAllTvs();
      const count = preloaded?.length || 0;
      if (count === 0) {
        throw new Error('M3U_URL cargada pero sin canales válidos (#EXTINF sin URL de stream)');
      }
      this.#logger.info(`Cargados ${count} canales desde M3U_URL`);
      this.#tvHandler = new TvHandler(tvRepository, this.#config, this.#logger);
      this.#logger.info('TvHandler configurado con M3UTvRepository');
    } catch (error) {
      this.#logger.error('Error configurando TvHandler con M3U_URL:', error);
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
        // Solo TvHandler maneja catálogos para TV y Channel
        if ((args.type === 'tv' || args.type === 'channel') && this.#tvHandler) {
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
        // Delegar a TvHandler para TV y Channel
        if ((args.type === 'tv' || args.type === 'channel') && this.#tvHandler) {
          this.#logger.debug(`[DEBUG] Delegating to TvHandler for ${args.type} meta request`);
          const result = await this.#tvHandler.createMetaHandler()(args);
          this.#logger.debug(`[DEBUG] TvHandler meta result:`, {
            hasMetaId: !!result?.meta?.id,
            metaType: result?.meta?.type,
            metaName: result?.meta?.name,
            defaultVideoId: result?.meta?.behaviorHints?.defaultVideoId,
            videosCount: Array.isArray(result?.meta?.videos) ? result.meta.videos.length : 0,
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
    // Protege contra múltiples inicios en el mismo proceso
    const START_FLAG = '__magnet_addon_started__';
    if (globalThis[START_FLAG]) {
      if (this.#logger) {
        this.#logger.warn('Detectado segundo intento de inicio del addon en el mismo proceso. Se omite.');
      } else {
        console.warn('Detectado segundo intento de inicio del addon en el mismo proceso. Se omite.');
      }
      return;
    }
    globalThis[START_FLAG] = true;
    await this.initialize();

    const port = Number(process.env.PORT || this.#config.server.port);
    this.#logger.info(`Iniciando servidor en el puerto ${port}...`);

    const addonInterface = this.#addonBuilder.getInterface();
    const app = express();
    // Confiar en cabeceras de proxy para obtener IP real
    app.set('trust proxy', true);
    const router = getRouter(addonInterface);
    
    // Middleware global para capturar IP y establecer contexto
    app.use((req, res, next) => {
      try {
        RequestContext.run(req, () => {
          const ip = RequestContext.getIp();
          this.#logger.info(`[IP Capture] Solicitud entrante desde IP='${ip || 'unknown'}'`, {
            path: req.path,
            method: req.method
          });
          next();
        });
      } catch (e) {
        this.#logger.warn(`[IP Capture] Error determinando IP: ${e?.message || e}`);
        next();
      }
    });

    // Ruta de landing segura en '/'
    app.get('/', (req, res) => {
      try {
        // Cabeceras de seguridad básicas para la landing
        res.set({
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          // CSP restrictiva para contenido estático básico
          'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
        });
  const filePath = path.join(process.cwd(), process.env.STATIC_DIR || 'static', 'index.html');
        res.sendFile(filePath, (err) => {
          if (err) {
            // Fallback a una landing mínima si no existe index.html
            const manifestUrl = `${process.env.BASE_URL || `http://localhost:${port}`}/manifest.json`;
            res.status(200).send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stremio Addon</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 16px;">
  <h1>Addon de Stremio</h1>
  <p>Este servidor expone un addon compatible con Stremio.</p>
  <p>
    <a href="${manifestUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ver manifest.json</a>
  </p>
  <p>Para instalarlo en Stremio, copia la URL del manifest y pégala en la sección “Install Addon via URL”.</p>
  <hr>
  <p style="color:#666;font-size:14px">Si ves esta página, la raíz (/) está funcionando. Los endpoints del protocolo siguen disponibles: /manifest.json, /catalog, /meta, /stream.</p>
</body></html>`);
          }
        });
      } catch (e) {
        res.status(500).send('Landing no disponible');
      }
    });

    // Montar router del addon (proporciona /manifest.json y endpoints del protocolo)
    app.use('/', router);
    this.#setupAdditionalRoutes(app);

    const server = app.listen(port, () => {
      const localUrl = `http://localhost:${port}`;
      this.#logger.info(`✅ Addon iniciado en: ${localUrl}`);
      this.#logger.info(`🔗 Manifiesto: ${localUrl}/manifest.json`);
      this.#logger.info(`🖼️  Archivos estáticos servidos en: ${localUrl}/static`);

      // Establecer BASE_URL automáticamente si no está definida para evitar cuelgues por rutas relativas
      if (!process.env.BASE_URL || !process.env.BASE_URL.trim()) {
        process.env.BASE_URL = localUrl;
        this.#logger.info(`BASE_URL no estaba definida. Se configuró automáticamente a: ${process.env.BASE_URL}`);
      }
    });

    server.on('error', (error) => {
      this.#logger.error('❌ Error al iniciar el servidor:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
      });
      process.exit(1);
    });
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