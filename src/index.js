/**
 * @fileoverview Punto de entrada principal para el addon de búsqueda de magnets.
 * Configura e inicia el servidor del addon de Stremio.
 */

// Cargar variables de entorno una sola vez, antes de cualquier otro import
import './config/loadEnv.js';

import addonSDK from 'stremio-addon-sdk';
// Compatibilidad con CommonJS de stremio-addon-sdk en Node.js
const { addonBuilder, serveHTTP, getRouter } = addonSDK;
import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
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
import { idDetectorService } from './infrastructure/services/IdDetectorService.js';

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
  #tvRefreshIntervalId; // { default?: NodeJS.Timer, whitelist?: NodeJS.Timer }
  #tvCsvWatchers; // Map<label, fs.FSWatcher>
  #ipRoutingService; // IpRoutingService used by DynamicTvRepository
  #tvRepoRefs; // { whitelistRepo, defaultRepo, m3uRepo, m3uBackupRepo }

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

    await this.#warmUpCachesFromEnv();

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

  async #warmUpCachesFromEnv() {
    const raw = process.env.CACHE_WARMUP_IDS || '';
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;
    for (const id of ids) {
      try {
        const detection = idDetectorService.detectIdType(id);
        let type = 'movie';
        if (detection.type && detection.type.includes('series')) type = 'series';
        else if (['kitsu','mal','anilist','anidb','kitsu_series','mal_series','anilist_series','anidb_series'].includes(detection.type)) type = 'anime';
        await this.#magnetRepository.getMagnetsByContentId(id, type);
        this.#logger.info(`Warmup cache OK: ${id} (${type})`);
      } catch (e) {
        this.#logger.warn(`Warmup cache FAIL: ${id} - ${e?.message || e}`);
      }
    }
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

    // Guardar referencias para hot-reload y configurar handler
    this.#ipRoutingService = ipRouting;
    this.#tvRepoRefs = { whitelistRepo, defaultRepo, m3uRepo, m3uBackupRepo };
    this.#tvRepository = dynamicRepo;
    this.#tvHandler = new TvHandler(this.#tvRepository, this.#config, this.#logger);
    this.#logger.info('TvHandler configurado con DynamicTvRepository');

    this.#setupCatalogHandler();
    this.#setupMetaHandler();

    // Configurar hot-reload de CSVs (locales o remotos)
    try {
      await this.#setupTvHotReload({ csvDefaultPath, csvWhitelistPath });
    } catch (e) {
      this.#logger.warn(`No se pudo configurar hot-reload para TV CSV: ${e?.message || e}`);
    }
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

    // =============================
    // Endpoints dinámicos de assets
    // =============================
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

    const resolveDir = (envPathFallback) => {
      // Si la ruta de entorno existe, usarla; si es relativa, resolver desde cwd
      try {
        const p = (envPathFallback || '').trim();
        if (!p) return null;
        return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      } catch (_) {
        return null;
      }
    };

    // Directorios de assets (preferimos las rutas de entorno definidas por start.sh)
    const LOGOS_DIR = resolveDir(process.env.LOGO_OUTPUT_DIR) || path.join(process.cwd(), STATIC_DIR, 'logos');
    const BACKGROUND_DIR = resolveDir(process.env.BACKGROUND_OUTPUT_DIR) || path.join(process.cwd(), STATIC_DIR, 'background');
    const POSTER_DIR = resolveDir(process.env.POSTER_OUTPUT_DIR) || path.join(process.cwd(), STATIC_DIR, 'poster');

    const getDirByType = (type) => {
      switch (String(type).toLowerCase()) {
        case 'logos': return LOGOS_DIR;
        case 'background':
        case 'backgrounds': return BACKGROUND_DIR;
        case 'poster':
        case 'posters': return POSTER_DIR;
        default: return null;
      }
    };

    const buildUrl = (type, filename) => {
      // Presentamos las URLs bajo el montaje estático
      const base = STATIC_MOUNT_PATH.endsWith('/') ? STATIC_MOUNT_PATH.slice(0, -1) : STATIC_MOUNT_PATH;
      const sub = type === 'logos' ? 'logos' : (type.startsWith('background') ? 'background' : 'poster');
      return `${base}/${sub}/${encodeURIComponent(filename)}`;
    };

    const listFiles = async (dir, { extFilter, page = 1, pageSize = 100 }) => {
      // Devolver listado con metadatos básicos; sin hardcodear cantidades
      if (!dir) return { total: 0, items: [] };
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        let files = entries.filter(e => e.isFile());
        if (extFilter) {
          const allowed = Array.isArray(extFilter) ? extFilter : [extFilter];
          const allowedSet = new Set(allowed.map(x => String(x).toLowerCase()));
          files = files.filter(e => allowedSet.has(path.extname(e.name).toLowerCase()));
        } else {
          files = files.filter(e => IMAGE_EXTS.has(path.extname(e.name).toLowerCase()));
        }
        const total = files.length;
        // Paginación
        const start = Math.max(0, (Number(page) - 1) * Number(pageSize));
        const end = Math.min(total, start + Number(pageSize));
        const slice = files.slice(start, end);
        const items = await Promise.all(slice.map(async (e) => {
          const fullPath = path.join(dir, e.name);
          let stat;
          try { stat = await fs.promises.stat(fullPath); } catch (_) { stat = null; }
          return {
            name: e.name,
            size: stat?.size ?? null,
            mtime: stat?.mtime?.toISOString?.() ?? null,
            ext: path.extname(e.name).toLowerCase()
          };
        }));
        return { total, items };
      } catch (err) {
        this.#logger.warn('No se pudo listar archivos', { dir, error: err?.message });
        return { total: 0, items: [] };
      }
    };

    // GET /assets → devuelve listas para logos/background/poster
    app.get('/assets', async (req, res) => {
      try {
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 100);
        const ext = req.query.ext;
        const extFilter = ext ? String(ext).split(',').map(e => `.${e.trim().toLowerCase()}`) : null;
        const [logos, background, poster] = await Promise.all([
          listFiles(LOGOS_DIR, { extFilter, page, pageSize }),
          listFiles(BACKGROUND_DIR, { extFilter, page, pageSize }),
          listFiles(POSTER_DIR, { extFilter, page, pageSize })
        ]);
        const withUrls = (type, list) => ({
          total: list.total,
          items: list.items.map(it => ({ ...it, url: buildUrl(type, it.name) }))
        });
        res.json({
          logos: withUrls('logos', logos),
          background: withUrls('background', background),
          poster: withUrls('poster', poster)
        });
      } catch (e) {
        this.#logger.error('Error en /assets', { error: e?.message });
        res.status(500).json({ error: 'No se pudieron listar los assets' });
      }
    });

    // GET /assets/:type → lista solo un tipo
    app.get('/assets/:type', async (req, res) => {
      try {
        const type = String(req.params.type || '').toLowerCase();
        const dir = getDirByType(type);
        if (!dir) return res.status(404).json({ error: 'Tipo de asset no reconocido' });
        const page = Number(req.query.page || 1);
        const pageSize = Number(req.query.pageSize || 100);
        const ext = req.query.ext;
        const extFilter = ext ? String(ext).split(',').map(e => `.${e.trim().toLowerCase()}`) : null;
        const list = await listFiles(dir, { extFilter, page, pageSize });
        res.json({
          type,
          total: list.total,
          items: list.items.map(it => ({ ...it, url: buildUrl(type, it.name) }))
        });
      } catch (e) {
        this.#logger.error('Error en /assets/:type', { error: e?.message });
        res.status(500).json({ error: 'No se pudieron listar los assets' });
      }
    });

    // Endpoint de descarga protegida por token para CSVs de datos
    const DOWNLOAD_TOKEN = (process.env.DOWNLOAD_TOKEN || '').trim();
    const REQUIRE_IP = String(process.env.DOWNLOAD_REQUIRE_IP_WHITELIST || '').trim().toLowerCase() === 'true';
    // Whitelist específica para descargas (independiente de WHITELIST_IPS)
    const DOWNLOAD_WHITELIST = (process.env.DOWNLOAD_WHITELIST_IPS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ipRoutingDownloads = new IpRoutingService(DOWNLOAD_WHITELIST, this.#config.ipRouting.cacheTtlSeconds, this.#logger);
    const getTokenFromReq = (req) => {
      const q = (req.query?.token || '').toString().trim();
      if (q) return q;
      const auth = (req.headers['authorization'] || '').toString();
      const m = auth.match(/^Bearer\s+(.+)$/i);
      return m ? m[1].trim() : '';
    };
    const requireAuth = (req, res, next) => {
      try {
        const tok = getTokenFromReq(req);
        const ip = RequestContext.getIp();
        // Evaluar whitelist de IP si está habilitada
        if (REQUIRE_IP) {
          const allowed = ipRoutingDownloads.isWhitelisted(ip);
          if (!allowed) {
            return res.status(403).json({ error: 'IP no autorizada para descargas' });
          }
        }
        // Evaluar token si está configurado
        if (DOWNLOAD_TOKEN) {
          if (!tok || tok !== DOWNLOAD_TOKEN) {
            return res.status(401).json({ error: 'Token inválido o ausente' });
          }
        } else {
          // Si no hay token y tampoco se exige IP whitelist, bloquear por seguridad
          if (!REQUIRE_IP) {
            this.#logger.warn('Descargas deshabilitadas: ni token ni whitelist IP están configurados');
            return res.status(403).json({ error: 'Descargas deshabilitadas: configurar DOWNLOAD_TOKEN o habilitar DOWNLOAD_REQUIRE_IP_WHITELIST' });
          }
        }
        next();
      } catch (e) {
        return res.status(400).json({ error: 'Error validando token' });
      }
    };

    const fileNameFromRoute = (route) => {
      if (!route || typeof route !== 'string') return '';
      const r = route.trim();
      const parts = r.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    };
    const buildDownloadMap = () => {
      const cfg = this.#config?.repository || {};
      const map = new Map();
      const tvRoute = (process.env.DOWNLOAD_ROUTE_TV || '').trim();
      const tvPremiumRoute = (process.env.DOWNLOAD_ROUTE_TV_PREMIUM || '').trim();
      const magnetsRoute = (process.env.DOWNLOAD_ROUTE_MAGNETS || '').trim();
      const torrentioRoute = (process.env.DOWNLOAD_ROUTE_TORRENTIO || '').trim();
      const englishRoute = (process.env.DOWNLOAD_ROUTE_ENGLISH || '').trim();
      const animeRoute = (process.env.DOWNLOAD_ROUTE_ANIME || '').trim();

      if (tvRoute && cfg.tvCsvDefaultPath) map.set(fileNameFromRoute(tvRoute), cfg.tvCsvDefaultPath);
      if (tvPremiumRoute && cfg.tvCsvWhitelistPath) map.set(fileNameFromRoute(tvPremiumRoute), cfg.tvCsvWhitelistPath);

      const magnetsKey = magnetsRoute ? fileNameFromRoute(magnetsRoute) : '';
      const torrentioKey = torrentioRoute ? fileNameFromRoute(torrentioRoute) : '';
      const englishKey = englishRoute ? fileNameFromRoute(englishRoute) : '';
      const animeKey = animeRoute ? fileNameFromRoute(animeRoute) : '';

      if (magnetsKey && cfg.primaryCsvPath) map.set(magnetsKey, cfg.primaryCsvPath);
      if (torrentioKey && cfg.secondaryCsvPath) map.set(torrentioKey, cfg.secondaryCsvPath);
      if (animeKey && cfg.animeCsvPath) map.set(animeKey, cfg.animeCsvPath);
      if (englishKey) {
        const englishPath = this.#config?.repository?.englishCsvPath || (cfg.secondaryCsvPath ? path.join(path.dirname(cfg.secondaryCsvPath), englishKey) : null);
        if (englishPath) map.set(englishKey, englishPath);
      }
      return map;
    };

    // Helper para servir descarga por nombre concreto reutilizando la misma lógica
    const serveDownloadByName = async (name, req, res) => {
      const allowed = buildDownloadMap();
      const target = allowed.get(name);
      if (!target) {
        return res.status(404).json({ error: 'Recurso no disponible para descarga' });
      }
      // Enviar como attachment
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Detectar si es URL remota
      const isHttp = /^https?:\/\//i.test(target);
      if (isHttp) {
        try {
          const response = await axios.get(target, { responseType: 'stream' });
          res.setHeader('Content-Type', response.headers['content-type'] || 'text/csv; charset=utf-8');
          response.data.pipe(res);
        } catch (err) {
          this.#logger.error('Error descargando CSV remoto', { target, error: err?.message });
          return res.status(502).json({ error: 'No se pudo descargar el recurso remoto' });
        }
        return;
      }
      // Ruta local
      try {
        const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
        this.#logger.info(`CSV download target: ${absoluteTarget} (${name})`);
        if (!existsSync(absoluteTarget)) {
          return res.status(404).json({ error: 'Archivo no encontrado en servidor' });
        }
        res.type('text/csv');
        const stream = fs.createReadStream(absoluteTarget);
        stream.on('error', (err) => {
          this.#logger.error('Error leyendo archivo local', { target: absoluteTarget, error: err?.message });
          if (!res.headersSent) res.status(500).json({ error: 'Error interno enviando archivo' });
        });
        stream.pipe(res);
      } catch (e) {
        this.#logger.error('Error procesando descarga local', { target, error: e?.message });
        res.status(500).json({ error: 'Error interno' });
      }
    };

    app.get('/download/:name', requireAuth, async (req, res) => {
      const name = (req.params?.name || '').toString();
      await serveDownloadByName(name, req, res);
    });

    // Rutas alias configurables por entorno
    const normalizeRoute = (val, fallback) => {
      if (!val || typeof val !== 'string') return fallback;
      let r = val.trim();
      if (!r.startsWith('/')) r = '/' + r;
      return r;
    };

    const routeConfig = {
      tv: normalizeRoute(process.env.DOWNLOAD_ROUTE_TV, ''),
      tvPremium: normalizeRoute(process.env.DOWNLOAD_ROUTE_TV_PREMIUM, ''),
      magnets: normalizeRoute(process.env.DOWNLOAD_ROUTE_MAGNETS, ''),
      torrentio: normalizeRoute(process.env.DOWNLOAD_ROUTE_TORRENTIO, ''),
      english: normalizeRoute(process.env.DOWNLOAD_ROUTE_ENGLISH, ''),
      anime: normalizeRoute(process.env.DOWNLOAD_ROUTE_ANIME, ''),
    };

    if (process.env.DOWNLOAD_ROUTE_TV && process.env.DOWNLOAD_ROUTE_TV.trim()) {
      const k = fileNameFromRoute(routeConfig.tv);
      app.get(routeConfig.tv, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }
    if (process.env.DOWNLOAD_ROUTE_TV_PREMIUM && process.env.DOWNLOAD_ROUTE_TV_PREMIUM.trim()) {
      const k = fileNameFromRoute(routeConfig.tvPremium);
      app.get(routeConfig.tvPremium, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }
    if (process.env.DOWNLOAD_ROUTE_MAGNETS && process.env.DOWNLOAD_ROUTE_MAGNETS.trim()) {
      const k = fileNameFromRoute(routeConfig.magnets);
      app.get(routeConfig.magnets, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }
    if (process.env.DOWNLOAD_ROUTE_TORRENTIO && process.env.DOWNLOAD_ROUTE_TORRENTIO.trim()) {
      const k = fileNameFromRoute(routeConfig.torrentio);
      app.get(routeConfig.torrentio, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }
    if (process.env.DOWNLOAD_ROUTE_ENGLISH && process.env.DOWNLOAD_ROUTE_ENGLISH.trim()) {
      const k = fileNameFromRoute(routeConfig.english);
      app.get(routeConfig.english, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }
    if (process.env.DOWNLOAD_ROUTE_ANIME && process.env.DOWNLOAD_ROUTE_ANIME.trim()) {
      const k = fileNameFromRoute(routeConfig.anime);
      app.get(routeConfig.anime, requireAuth, async (req, res) => serveDownloadByName(k, req, res));
    }

    // =============================
    // Publicación de M3U8 dinámica
    // =============================
    // Directorio base configurable para m3u8 locales
    const M3U8_DIR = resolveDir(process.env.M3U8_DIR) || path.join(process.cwd(), 'data', 'm3u8');
    // Servir archivos m3u8 y cualquier recurso asociado (p.ej., .ts, .key) bajo token/IP
    // Nota: express.static previene traversal y maneja nombres dinámicos automáticamente
    app.use('/download/m3u8', requireAuth, express.static(M3U8_DIR, { index: false, fallthrough: true }));

    // Listado opcional: GET /download/m3u8/list?subdir=...&page=1&pageSize=100&ext=m3u8,ts
    app.get('/download/m3u8/list', requireAuth, async (req, res) => {
      try {
        const subdir = (req.query?.subdir || '').toString().trim();
        const page = Number(req.query?.page || 1);
        const pageSize = Number(req.query?.pageSize || 100);
        const ext = req.query?.ext ? String(req.query.ext).split(',').map(e => `.${e.trim().toLowerCase()}`) : null;
        // Construir ruta segura dentro de M3U8_DIR
        const base = M3U8_DIR;
        const targetDir = subdir ? path.join(base, subdir) : base;
        const normalized = path.normalize(targetDir);
        // Evitar salir del directorio base
        if (!normalized.startsWith(path.normalize(base))) {
          return res.status(400).json({ error: 'Subdirectorio inválido' });
        }
        const list = await listFiles(normalized, { extFilter: ext, page, pageSize });
        const items = list.items.map(it => ({
          ...it,
          url: `${req.baseUrl}/download/m3u8/${encodeURIComponent(subdir ? subdir + '/' + it.name : it.name)}`
        }));
        res.json({ total: list.total, items });
      } catch (e) {
        this.#logger.error('Error en /download/m3u8/list', { error: e?.message });
        res.status(500).json({ error: 'No se pudieron listar los m3u8' });
      }
    });

    // Fallback explícito para servir un archivo por ruta relativa si no lo captura static
    app.get('/download/m3u8/*', requireAuth, async (req, res) => {
      try {
        const rel = req.params[0]; // todo lo que sigue a /download/m3u8/
        const fullPath = path.join(M3U8_DIR, rel);
        const normalized = path.normalize(fullPath);
        // Validar que el archivo esté dentro del directorio permitido
        if (!normalized.startsWith(path.normalize(M3U8_DIR))) {
          return res.status(400).json({ error: 'Ruta inválida' });
        }
        if (!existsSync(normalized)) {
          return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.sendFile(normalized, (err) => {
          if (err) {
            this.#logger.error('Error enviando m3u8', { path: normalized, error: err?.message });
            if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
          }
        });
      } catch (e) {
        this.#logger.error('Error en /download/m3u8/*', { error: e?.message });
        res.status(500).json({ error: 'Error interno' });
      }
    });

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
   * Configura hot-reload para rutas CSV de TV.
   * - Para rutas locales: fs.watch con debounce.
   * - Para URLs remotas: intervalo configurable que fuerza recarga.
   * También actualiza dinámicamente el repositorio y el TvHandler.
   * @private
   * @param {{ csvDefaultPath?: string, csvWhitelistPath?: string }} param0
   */
  async #setupTvHotReload({ csvDefaultPath, csvWhitelistPath } = {}) {
    const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+/i.test(v);
    const debounceTimers = new Map(); // label -> timeoutId
    this.#tvCsvWatchers = this.#tvCsvWatchers || new Map();
    this.#tvRefreshIntervalId = this.#tvRefreshIntervalId || {};

    const scheduleDebounced = (label, fn, delayMs = 750) => {
      const prev = debounceTimers.get(label);
      if (prev) clearTimeout(prev);
      const id = setTimeout(async () => {
        try {
          await fn();
        } catch (e) {
          this.#logger.warn(`[Hot-Reload] Falló recarga (${label}): ${e?.message || e}`);
        }
      }, delayMs);
      debounceTimers.set(label, id);
    };

    const rebuildDynamicAndHandler = (updatedRefs) => {
      // Mezclar refs actualizadas
      this.#tvRepoRefs = { ...this.#tvRepoRefs, ...updatedRefs };
      const dynamicRepo = new DynamicTvRepository({
        whitelistRepo: this.#tvRepoRefs.whitelistRepo,
        defaultRepo: this.#tvRepoRefs.defaultRepo,
        m3uRepo: this.#tvRepoRefs.m3uRepo,
        m3uBackupRepo: this.#tvRepoRefs.m3uBackupRepo,
        assignmentCacheTtlSeconds: 120
      }, this.#ipRoutingService, this.#logger);
      this.#tvRepository = dynamicRepo;
      this.#tvHandler = new TvHandler(this.#tvRepository, this.#config, this.#logger);
      this.#logger.info('[Hot-Reload] TvHandler reconstruido con repositorios actualizados');
    };

    const buildCsvRepo = async (pathLike, label) => {
      if (isUrl(pathLike)) {
        const repo = new RemoteCsvTvRepository(pathLike.trim(), this.#logger);
        await repo.init();
        this.#logger.info(`[Hot-Reload] CSV remoto (${label}) recargado`);
        return repo;
      }
      if (!pathLike || !existsSync(pathLike)) {
        this.#logger.warn(`[Hot-Reload] Ruta CSV (${label}) no existe: ${pathLike}`);
        return null;
      }
      const repo = new CsvTvRepository(pathLike, this.#logger);
      await repo.init();
      this.#logger.info(`[Hot-Reload] CSV local (${label}) recargado`);
      return repo;
    };

    // Configurar watcher/interval para default CSV
    if (csvDefaultPath) {
      if (isUrl(csvDefaultPath)) {
        const seconds = Math.max(15, Number(process.env.TV_CSV_REFRESH_SECONDS || 60));
        this.#tvRefreshIntervalId.default = setInterval(async () => {
          scheduleDebounced('default', async () => {
            const repo = await buildCsvRepo(csvDefaultPath, 'default');
            if (repo) rebuildDynamicAndHandler({ defaultRepo: repo });
            try { await populateTvGenreOptionsFromCsv(); } catch (_) {}
          });
        }, seconds * 1000);
        this.#logger.info(`[Hot-Reload] Intervalo de refresco CSV default (remoto) cada ${seconds}s`);
      } else if (existsSync(csvDefaultPath)) {
        try {
          const watcher = fs.watch(csvDefaultPath, { persistent: false }, (eventType) => {
            if (eventType === 'change' || eventType === 'rename') {
              scheduleDebounced('default', async () => {
                const repo = await buildCsvRepo(csvDefaultPath, 'default');
                if (repo) rebuildDynamicAndHandler({ defaultRepo: repo });
                try { await populateTvGenreOptionsFromCsv(); } catch (_) {}
              });
            }
          });
          this.#tvCsvWatchers.set('default', watcher);
          this.#logger.info('[Hot-Reload] fs.watch configurado para CSV default');
        } catch (e) {
          this.#logger.warn(`[Hot-Reload] No se pudo configurar fs.watch para default: ${e?.message || e}`);
        }
      }
    }

    // Configurar watcher/interval para whitelist CSV
    if (csvWhitelistPath) {
      if (isUrl(csvWhitelistPath)) {
        const seconds = Math.max(15, Number(process.env.TV_CSV_REFRESH_SECONDS || 60));
        this.#tvRefreshIntervalId.whitelist = setInterval(async () => {
          scheduleDebounced('whitelist', async () => {
            const repo = await buildCsvRepo(csvWhitelistPath, 'whitelist');
            if (repo) rebuildDynamicAndHandler({ whitelistRepo: repo });
            try { await populateTvGenreOptionsFromCsv(); } catch (_) {}
          });
        }, seconds * 1000);
        this.#logger.info(`[Hot-Reload] Intervalo de refresco CSV whitelist (remoto) cada ${seconds}s`);
      } else if (existsSync(csvWhitelistPath)) {
        try {
          const watcher = fs.watch(csvWhitelistPath, { persistent: false }, (eventType) => {
            if (eventType === 'change' || eventType === 'rename') {
              scheduleDebounced('whitelist', async () => {
                const repo = await buildCsvRepo(csvWhitelistPath, 'whitelist');
                if (repo) rebuildDynamicAndHandler({ whitelistRepo: repo });
                try { await populateTvGenreOptionsFromCsv(); } catch (_) {}
              });
            }
          });
          this.#tvCsvWatchers.set('whitelist', watcher);
          this.#logger.info('[Hot-Reload] fs.watch configurado para CSV whitelist');
        } catch (e) {
          this.#logger.warn(`[Hot-Reload] No se pudo configurar fs.watch para whitelist: ${e?.message || e}`);
        }
      }
    }

    // Cleanup en señales de proceso
    const cleanup = () => {
      try {
        if (this.#tvRefreshIntervalId?.default) clearInterval(this.#tvRefreshIntervalId.default);
        if (this.#tvRefreshIntervalId?.whitelist) clearInterval(this.#tvRefreshIntervalId.whitelist);
      } catch (_) {}
      try {
        for (const [label, watcher] of (this.#tvCsvWatchers || new Map()).entries()) {
          try { watcher.close(); } catch (_) {}
          this.#logger.info(`[Hot-Reload] watcher '${label}' cerrado`);
        }
      } catch (_) {}
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
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