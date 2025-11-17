/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import './loadEnv.js';
import { join, dirname, isAbsolute } from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './constants.js';
import { envString, envInt, envBool, envDurationMs } from '../infrastructure/utils/env.js';


const isWindows = process.platform === 'win32';
const isContainer = (() => {
  if (process.env.CONTAINER_ENV === 'true') return true;
  if (process.env.CONTAINER_ENV === 'false') return false;
  try {
    if (fs.existsSync('/.dockerenv')) return true;
    const cg = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (/docker|containerd|kubepods/i.test(cg)) return true;
  } catch (_) {}
  return false;
})();

// Obtener directorio del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Función para resolver rutas según el entorno
function resolvePath(targetPath) {
  if (!targetPath) return targetPath;
  // Si ya es una ruta absoluta del sistema o una URL http/https, devolver tal cual
  if (isAbsolute(targetPath) || /^https?:\/\//i.test(targetPath)) {
    return targetPath;
  }
  if (isContainer) {
    return join('/app', targetPath);
  }
  return join(projectRoot, targetPath);
}

// Directorios base configurables para datos CSV (torrents y TV)
// Permiten cambiar el nombre y ubicación de las carpetas sin modificar el código.
const DATA_TORRENTS_DIR = envString('DATA_TORRENTS_DIR', 'data/torrents');
const DATA_TVS_DIR = envString('DATA_TVS_DIR', 'data/tvs');

const config = {
  addon: {
    id: process.env.ADDON_ID || 'org.stremio.torrent.search',
    version: process.env.ADDON_VERSION || '1.3.0',
    name: process.env.ADDON_NAME || 'VeoVeo Search Pro',
    description: process.env.ADDON_DESCRIPTION || 'Advanced search addon for movies, series and live TV channels (M3U) with CSV/M3U sources. Features unified metadata management and detailed logging.',
    logo: process.env.ADDON_LOGO || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9IjEyOCIgeT0iMTQwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNzIiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5UUzwvdGV4dD4KPC9zdmc+',
    background: process.env.ADDON_BACKGROUND || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9Ijk2MCIgeT0iNTgwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iODAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Ub3JyZW50IFNlYXJjaDwvdGV4dD4KPC9zdmc+',
    resources: [
      {
        name: 'catalog',
        // Incluir 'channel' para compatibilidad con clientes que usan este tipo
        types: ['movie', 'series', 'tv', 'channel'],
        idPrefixes: ['tt', 'tv_']
      },
      {
        name: 'meta',
        types: ['movie', 'series', 'tv', 'channel'],
        idPrefixes: ['tt', 'tv_']
      },
      {
        name: 'stream',
        types: ['movie', 'series', 'tv', 'channel'],
        idPrefixes: ['tt', 'tv_']
      }
    ],
    // Exponer también 'channel' en la lista global de tipos del manifest
    types: ['movie', 'series', 'tv', 'channel'],
    catalogs: [
      {
        type: 'movie',
        id: 'movie_catalog',
        name: 'Movies'
      },
      {
        type: 'series',
        id: 'series_catalog',
        name: 'Series'
      },
      {
        type: 'tv',
        id: 'tv_catalog',
        name: 'Popular',
        // Lista de géneros visibles para selección en el cliente Stremio
        genres: [
          // Preferidos primero
          'TV Premium',
          'TV Local',
          'Deportes',
          'Infantil',
          'Música',
          // Restantes
          'General',
          'Noticias',
          'Películas',
          'Series',
          'Documentales',
          'Estilo de Vida'
        ],
        extra: [
          { name: 'search', isRequired: false },
          { name: 'genre', isRequired: false },
          { name: 'skip', isRequired: false },
          { name: 'limit', isRequired: false }
        ]
      }
    ],
    idPrefixes: ['tt', 'tv_']
  },
  server: {
    port: envInt('PORT', CONSTANTS.NETWORK.DEFAULT_SERVER_PORT),
  },
  cache: {
    streamCacheMaxAge: envInt('CACHE_STREAM_MAX_AGE', CONSTANTS.CACHE.STREAM_MAX_AGE),
    streamStaleRevalidate: envInt('CACHE_STREAM_STALE_REVALIDATE', CONSTANTS.CACHE.STREAM_STALE_REVALIDATE),
    streamStaleError: envInt('CACHE_STREAM_STALE_ERROR', CONSTANTS.CACHE.STREAM_STALE_ERROR),
    // Cache específico para anime (más tiempo debido a menor frecuencia de cambios)
    animeCacheMaxAge: envInt('CACHE_ANIME_MAX_AGE', CONSTANTS.CACHE.ANIME_MAX_AGE),
    // Cache para metadatos
    metadataCacheMaxAge: envInt('CACHE_METADATA_MAX_AGE', CONSTANTS.CACHE.METADATA_MAX_AGE),
    // Cache específico para TV M3U (streams en vivo requieren cache más corto)
    tvCacheMaxAge: envInt('CACHE_TV_MAX_AGE', CONSTANTS.CACHE.TV_CACHE_MAX_AGE),
    tvCatalogMaxAge: envInt('CACHE_TV_CATALOG_MAX_AGE', CONSTANTS.CACHE.TV_CATALOG_MAX_AGE),
    tvStreamStaleRevalidate: envInt('CACHE_TV_STREAM_STALE_REVALIDATE', CONSTANTS.CACHE.TV_STREAM_STALE_REVALIDATE),
    tvStreamStaleError: envInt('CACHE_TV_STREAM_STALE_ERROR', CONSTANTS.CACHE.TV_STREAM_STALE_ERROR)
  },
  logging: {
    // Optimización para producción: usar 'warn' por defecto en producción, 'info' en desarrollo
    logLevel: envString('LOG_LEVEL', (process.env.NODE_ENV === 'production' ? 'warn' : 'info')),
    enableDetailedLogging: envBool('ENABLE_DETAILED_LOGGING', (process.env.NODE_ENV !== 'production')),
    logFormat: envString('LOG_FORMAT', (process.env.NODE_ENV === 'production' ? 'simple' : 'detailed')),
    logToFile: envBool('LOG_TO_FILE', false),
    logFilePath: process.env.LOG_FILE_PATH || resolvePath('logs/addon.log'),
    // Configuración específica para producción
    production: {
      disableSourceTracking: true,
      minimalOutput: true,
      errorOnly: envBool('PRODUCTION_ERROR_ONLY', false)
    }
  },
  repository: {
    // Rutas base configurables para CSV de torrents
    primaryCsvPath: (() => {
      const raw = process.env.PRIMARY_CSV_PATH;
      return resolvePath(raw) || resolvePath(join(DATA_TORRENTS_DIR, 'magnets.csv'));
    })(),
    secondaryCsvPath: (() => {
      const raw = process.env.SECONDARY_CSV_PATH;
      return resolvePath(raw) || resolvePath(join(DATA_TORRENTS_DIR, 'spanish.csv'));
    })(),
    animeCsvPath: (() => {
      const raw = process.env.ANIME_CSV_PATH;
      return resolvePath(raw) || resolvePath(join(DATA_TORRENTS_DIR, 'anime.csv'));
    })(),
    // CSV por defecto para clientes no autorizados
    tvCsvDefaultPath: (() => {
      const raw = process.env.TV_CSV_PATH_DEFAULT;
      return resolvePath(raw) || resolvePath(join(DATA_TVS_DIR, 'tv.csv'));
    })(),
    // CSV para clientes autorizados según whitelist (opcional)
    tvCsvWhitelistPath: (() => {
      const raw = process.env.TV_CSV_PATH_WHITELIST;
      return resolvePath(raw) || null;
    })(),
    torrentioApiUrl: envString('TORRENTIO_API_URL', 'https://torrentio.strem.fun/'),
    timeout: envInt('CSV_TIMEOUT', CONSTANTS.TIME.DEFAULT_TIMEOUT),
    // Configuración específica para TV M3U
    m3uUrl: envString('M3U_URL', null),
    // URL de respaldo para M3U (opcional)
    m3uUrlBackup: envString('M3U_URL_BACKUP', null),
    m3uCacheTimeout: envDurationMs('M3U_CACHE_TIMEOUT', CONSTANTS.CACHE.TV_M3U_CACHE_TIMEOUT),
    maxTvChannels: envInt('MAX_TV_CHANNELS', CONSTANTS.LIMIT.MAX_TV_CHANNELS)
  },
  // Configuración de ruteo por IP
  ipRouting: {
    // Lista de IPs autorizadas (coma-separadas). Ej: "1.2.3.4,5.6.7.8"
    whitelist: (process.env.WHITELIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
    // TTL del caché de verificación de IP (segundos)
    cacheTtlSeconds: envInt('IP_CACHE_TTL_SECONDS', 300)
  },
  tor: {
    enabled: envBool('TOR_ENABLED', false), // Por defecto false, se activa explícitamente con TOR_ENABLED=true
    host: process.env.TOR_HOST || CONSTANTS.NETWORK.TOR_DEFAULT_HOST,
    port: envInt('TOR_PORT', CONSTANTS.NETWORK.TOR_DEFAULT_PORT)
  },
  torrentio: {
    movie: {
      providers: process.env.TORRENTIO_MOVIE_PROVIDERS || CONSTANTS.PROVIDER.MOVIE_PROVIDERS.SPANISH,
      sort: process.env.TORRENTIO_MOVIE_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_MOVIE_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_MOVIE_QUALITY_FILTER,
      limit: parseInt(process.env.TORRENTIO_MOVIE_LIMIT) || CONSTANTS.LIMIT.DEFAULT_MOVIE_LIMIT,
      priorityLanguage: process.env.TORRENTIO_MOVIE_LANGUAGE || CONSTANTS.LANGUAGE.DEFAULT_MOVIE_LANGUAGE,
      // Configuraciones por idioma para búsqueda en cascada
      languageConfigs: {
        spanish: {
          providers: process.env.TORRENTIO_MOVIE_PROVIDERS_ES || CONSTANTS.PROVIDER.MOVIE_PROVIDERS.SPANISH,
          priorityLanguage: 'spanish'
        },
        combined: {
          providers: process.env.TORRENTIO_MOVIE_PROVIDERS_COMBINED || CONSTANTS.PROVIDER.MOVIE_PROVIDERS.COMBINED,
          priorityLanguage: 'spanish'
        }
      }
    },
    series: {
      providers: process.env.TORRENTIO_SERIES_PROVIDERS || 'horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad',
      sort: process.env.TORRENTIO_SERIES_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_SERIES_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_SERIES_QUALITY_FILTER,
      limit: parseInt(process.env.TORRENTIO_SERIES_LIMIT) || CONSTANTS.LIMIT.DEFAULT_SERIES_LIMIT,
      priorityLanguage: process.env.TORRENTIO_SERIES_LANGUAGE || CONSTANTS.LANGUAGE.DEFAULT_SERIES_LANGUAGE,
      // Configuraciones por idioma para búsqueda en cascada
      languageConfigs: {
        spanish: {
          providers: process.env.TORRENTIO_SERIES_PROVIDERS_ES || CONSTANTS.PROVIDER.SERIES_PROVIDERS.SPANISH,
          priorityLanguage: 'spanish'
        },
        combined: {
          providers: process.env.TORRENTIO_SERIES_PROVIDERS_COMBINED || CONSTANTS.PROVIDER.SERIES_PROVIDERS.COMBINED,
          priorityLanguage: 'spanish'
        }
      }
    },
    anime: {
      providers: process.env.TORRENTIO_ANIME_PROVIDERS || CONSTANTS.PROVIDER.ANIME_PROVIDERS.DEFAULT,
      sort: process.env.TORRENTIO_ANIME_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_ANIME_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_ANIME_QUALITY_FILTER,
      limit: parseInt(process.env.TORRENTIO_ANIME_LIMIT) || CONSTANTS.LIMIT.DEFAULT_ANIME_LIMIT,
      priorityLanguage: process.env.TORRENTIO_ANIME_LANGUAGE || CONSTANTS.LANGUAGE.DEFAULT_ANIME_LANGUAGE,
      // Configuraciones específicas para anime
      enableSubtitles: envBool('TORRENTIO_ANIME_SUBTITLES', true),
      preferredFansubs: process.env.TORRENTIO_ANIME_FANSUBS || CONSTANTS.PROVIDER.ANIME_PROVIDERS.PREFERRED_FANSUBS,
      qualityPriority: process.env.TORRENTIO_ANIME_QUALITY_PRIORITY || '1080p,720p,480p',
      enableBatch: process.env.TORRENTIO_ANIME_BATCH === 'true' || false,
      // Configuraciones por idioma para búsqueda en cascada
      languageConfigs: {
        spanish: {
          providers: process.env.TORRENTIO_ANIME_PROVIDERS_ES || CONSTANTS.PROVIDER.ANIME_PROVIDERS.SPANISH,
          priorityLanguage: 'spanish'
        },
        combined: {
          providers: process.env.TORRENTIO_ANIME_PROVIDERS_COMBINED || CONSTANTS.PROVIDER.ANIME_PROVIDERS.COMBINED,
          priorityLanguage: 'japanese'
        }
      }
    }
  },
  // Configuración para selección de magnets
  magnetSelection: {
    // Estrategia de selección: 'seeders', 'quality', 'balanced'
    strategy: process.env.MAGNET_SELECTION_STRATEGY || 'seeders',
    // Pesos para estrategia 'balanced'
    balancedWeights: {
      seeders: parseInt(process.env.MAGNET_SEEDERS_WEIGHT) || CONSTANTS.LIMIT.BALANCED_WEIGHTS.SEEDERS,
      quality: parseInt(process.env.MAGNET_QUALITY_WEIGHT) || CONSTANTS.LIMIT.BALANCED_WEIGHTS.QUALITY
    },
    // Filtros de calidad
    minSeeders: envInt('MAGNET_MIN_SEEDERS', CONSTANTS.LIMIT.MIN_SEEDERS),
    // Calidades preferidas en orden de prioridad (array)
    qualityPriority: (process.env.MAGNET_QUALITY_PRIORITY || CONSTANTS.QUALITY.QUALITY_PRIORITIES.join(',')).split(','),
    // Habilitar logging detallado de selección
    enableSelectionLogging: envBool('MAGNET_SELECTION_LOGGING', false)
  },
  // Configuración específica para metadatos
  metadata: {
    // Configuración para películas
    movie: {
      requiredFields: CONSTANTS.METADATA.REQUIRED_FIELDS.movie,
      optionalFields: CONSTANTS.METADATA.OPTIONAL_FIELDS.movie,
      cacheExpiry: CONSTANTS.CACHE.MOVIE_METADATA_EXPIRY
    },
    // Metadatos para series
    series: {
      requiredFields: CONSTANTS.METADATA.REQUIRED_FIELDS.series,
      optionalFields: CONSTANTS.METADATA.OPTIONAL_FIELDS.series,
      cacheExpiry: CONSTANTS.CACHE.SERIES_METADATA_EXPIRY
    },
    // Metadatos para anime
    anime: {
      requiredFields: CONSTANTS.METADATA.REQUIRED_FIELDS.anime,
      optionalFields: CONSTANTS.METADATA.OPTIONAL_FIELDS.anime,
      cacheExpiry: CONSTANTS.CACHE.ANIME_METADATA_EXPIRY,
      // Campos específicos de anime
      animeSpecificFields: {
        malId: 'MyAnimeList ID',
        kitsuId: 'Kitsu ID',
        anilistId: 'AniList ID',
        anidbId: 'AniDB ID',
        studio: 'Animation Studio',
        source: 'Source Material (manga, novel, etc.)',
        status: 'Airing Status',
        season: 'Anime Season',
        episodeCount: 'Total Episodes',
        duration: 'Episode Duration',
        fansub: 'Fansub Group',
        language: 'Audio Language',
        subtitles: 'Subtitle Languages'
      },
      // Proveedores de metadatos para anime
      metadataProviders: {
        primary: process.env.ANIME_METADATA_PRIMARY || CONSTANTS.METADATA.ANIME_METADATA_PROVIDERS.PRIMARY,
        secondary: process.env.ANIME_METADATA_SECONDARY || CONSTANTS.METADATA.ANIME_METADATA_PROVIDERS.SECONDARY,
        fallback: process.env.ANIME_METADATA_FALLBACK || CONSTANTS.METADATA.ANIME_METADATA_PROVIDERS.FALLBACK
      }
    },
    // Configuración específica para TV M3U
    tv: {
      requiredFields: CONSTANTS.METADATA.REQUIRED_FIELDS.tv,
      optionalFields: CONSTANTS.METADATA.OPTIONAL_FIELDS.tv,
      cacheExpiry: CONSTANTS.CACHE.TV_CATALOG_MAX_AGE,
      defaultGroup: CONSTANTS.METADATA.TV_METADATA.DEFAULT_GROUP,
      defaultLogo: CONSTANTS.METADATA.TV_METADATA.DEFAULT_LOGO,
      runtime: CONSTANTS.METADATA.TV_METADATA.RUNTIME,
      defaultVideoId: CONSTANTS.METADATA.TV_METADATA.DEFAULT_VIDEO_ID
    }
  },
  // Configuración del sistema de búsqueda en cascada
  cascadeSearch: {
    enabled: envBool('CASCADE_SEARCH_ENABLED', true),
    maxRetries: envInt('CASCADE_MAX_RETRIES', CONSTANTS.CASCADE.MAX_RETRIES),
    retryDelay: envInt('CASCADE_RETRY_DELAY', CONSTANTS.CASCADE.RETRY_DELAY),
    timeout: envInt('CASCADE_TIMEOUT', CONSTANTS.CASCADE.TIMEOUT),
    // Prioridades por tipo de contenido
    priorities: CONSTANTS.CASCADE.SEARCH_PRIORITIES,
    // Configuración de logging para cascada
    logging: {
      logSearchStart: true,
      logSourceResults: true,
      logPrioritization: true,
      logFinalResults: true
    }
  }
};

// Cache para el manifest generado
let manifestCache = null;
let manifestCacheTimestamp = null;
const MANIFEST_CACHE_EXPIRY = CONSTANTS.TIME.MANIFEST_CACHE_SHORT_EXPIRY;

/**
 * Genera el manifiesto del addon a partir de la configuración con cache.
 * @returns {Object} Manifiesto de Stremio optimizado.
 */
function generateManifest() {
  // Verificar cache
  const now = Date.now();
  if (manifestCache && manifestCacheTimestamp && (now - manifestCacheTimestamp) < MANIFEST_CACHE_EXPIRY) {
    return manifestCache;
  }

  // Extraer tipos e idPrefixes únicos de resources para evitar duplicación
  const uniqueTypes = [...new Set(config.addon.resources.flatMap(r => r.types))];
  const uniqueIdPrefixes = [...new Set(config.addon.resources.flatMap(r => r.idPrefixes))];

  // Stremio genera dinámicamente catálogos para movies, series y anime
  // Solo se procesan catálogos personalizados (ej: TV)
  const optimizedCatalogs = config.addon.catalogs;

  // Generar manifest estándar de Stremio (solo campos oficiales)
  const cleanResources = config.addon.resources.map(resource => ({
    name: resource.name,
    types: resource.types,
    idPrefixes: resource.idPrefixes
    // Campos internos como typeSpecific, cascadeEnabled se mantienen privados
  }));

  const manifest = {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    logo: config.addon.logo,
    background: config.addon.background,
    resources: cleanResources,
    types: uniqueTypes,
    catalogs: optimizedCatalogs,
    idPrefixes: uniqueIdPrefixes,
    behaviorHints: {
      configurable: process.env.ADDON_CONFIGURABLE === 'true' || false,
      configurationRequired: false,
      adult: process.env.ADDON_ADULT_CONTENT === 'true' || false,
      p2p: true
      // Campos internos como cacheMaxAge, cascadeSearch se mantienen privados
    }
    // Datos internos como performance, providerConfig, typeSpecific se mantienen privados
  };

  // Actualizar cache
  manifestCache = manifest;
  manifestCacheTimestamp = now;

  return manifest;
}

export const addonConfig = Object.freeze(config);

/**
 * Normaliza una lista cruda de géneros en un array único y ordenado.
 * @param {string[]} rawList
 * @returns {string[]}
 */
function normalizeGenresList(rawList = []) {
  const map = {
    'tv premium': 'TV Premium',
    'premium': 'TV Premium',
    'tv local': 'TV Local',
    'news': 'Noticias',
    'sport': 'Deportes',
    'sports': 'Deportes',
    'kids': 'Infantil',
    'musica': 'Música',
    'music': 'Música',
    'documentales': 'Documentales',
    'documentary': 'Documentales',
    'lifestyle': 'Estilo de Vida'
  };
  const normalized = rawList
    .filter(Boolean)
    .flatMap(s => String(s).split(',').map(p => p.trim()).filter(Boolean))
    .map(p => map[p.toLowerCase()] || p);
  // Eliminar duplicados preservando orden
  return Array.from(new Set(normalized));
}

/**
 * Lee el CSV de TV y obtiene los géneros disponibles de forma dinámica.
 * @param {string} tvCsvPath
 * @returns {Promise<string[]>} géneros únicos y normalizados
 */
export async function computeAvailableGenresFromCsv(tvCsvPath) {
  if (!tvCsvPath) return [];

  const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

  // Leer desde URL remota
  if (isUrl(tvCsvPath)) {
    try {
      const response = await axios.get(tvCsvPath.trim(), { responseType: 'stream' });
      return new Promise((resolve, reject) => {
        const rawGenres = [];
        response.data
          .pipe(csv())
          .on('data', (data) => {
            const g = data.genre || data['group-title'] || '';
            if (g) rawGenres.push(g);
          })
          .on('end', () => {
            resolve(normalizeGenresList(rawGenres));
          })
          .on('error', (err) => reject(err));
      });
    } catch (err) {
      console.warn('[addonConfig] No se pudo leer géneros desde URL remota CSV:', err?.message || err);
      return [];
    }
  }

  // Leer desde archivo local
  if (!fs.existsSync(tvCsvPath)) return [];
  return new Promise((resolve, reject) => {
    const rawGenres = [];
    try {
      fs.createReadStream(tvCsvPath)
        .pipe(csv())
        .on('data', (data) => {
          const g = data.genre || data['group-title'] || '';
          if (g) rawGenres.push(g);
        })
        .on('end', () => {
          const genres = normalizeGenresList(rawGenres);
          resolve(genres);
        })
        .on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Inyecta las opciones de género dinámicas en el catálogo de TV del manifest config.
 * Debe llamarse antes de generar el manifest.
 * @param {string[]} genres
 */
export function setTvCatalogGenreOptions(genres = []) {
  try {
    const tvCatalog = config.addon.catalogs?.find(c => c.type === 'tv' && c.id === 'tv_catalog');
    if (!tvCatalog) return;

    // Actualizar la propiedad auxiliar 'genres' (no estándar, útil para referencia)
    tvCatalog.genres = genres.length ? genres : tvCatalog.genres;

    // Lista de prioridad solicitada por el usuario: primeros en el selector
    const PRIORITY_TOP = ['TV Premium', 'TV Local', 'Deportes', 'Infantil', 'Música'];

    // Reordenar respetando aparición original y moviendo prioridad al inicio
    const reorderGenresWithPriority = (list, priority) => {
      const norm = (s) => String(s).trim().toLowerCase();
      const set = new Set();
      const byNorm = new Map(list.map(g => [norm(g), g]));
      const result = [];
      // Anteponer prioridades si existen en la lista
      for (const p of priority) {
        const key = norm(p);
        if (byNorm.has(key) && !set.has(key)) {
          result.push(byNorm.get(key));
          set.add(key);
        }
      }
      // Añadir el resto manteniendo orden original
      for (const g of list) {
        const key = norm(g);
        if (!set.has(key)) {
          result.push(g);
          set.add(key);
        }
      }
      return result;
    };

    // Asegurar que extra incluya 'genre' con 'options'
    if (!Array.isArray(tvCatalog.extra)) tvCatalog.extra = [];
    let genreExtra = tvCatalog.extra.find(e => e.name === 'genre');
    if (!genreExtra) {
      genreExtra = { name: 'genre', isRequired: false };
      tvCatalog.extra.push(genreExtra);
    }
    // Establecer opciones dinámicas
    if (genres && genres.length) {
      // Reordenar con prioridad
      genreExtra.options = reorderGenresWithPriority(genres, PRIORITY_TOP);
      // Limitar a selección única (Stremio suele enviar un único string)
      genreExtra.optionsLimit = 1;
    }
  } catch (error) {
    // En caso de error, dejar el manifest tal cual
    console.warn('[addonConfig] No se pudieron establecer opciones de género dinámicas:', error?.message || error);
  }
}

/**
 * Carga dinámicamente los géneros desde TV CSV y actualiza el config para el manifest.
 * Debe ejecutarse antes de crear el addonBuilder.
 * @returns {Promise<void>}
 */
export async function populateTvGenreOptionsFromCsv() {
  try {
    const defaultPath = config.repository?.tvCsvDefaultPath;
    const whitelistPath = config.repository?.tvCsvWhitelistPath;
    let genres = await computeAvailableGenresFromCsv(defaultPath);
    // Si el default no existe o no genera géneros, intentar con el whitelist
    if ((!genres || genres.length === 0) && whitelistPath) {
      const wlGenres = await computeAvailableGenresFromCsv(whitelistPath);
      if (wlGenres && wlGenres.length) {
        console.info('[addonConfig] Usando géneros desde TV_CSV_PATH_WHITELIST');
        genres = wlGenres;
      }
    }
    setTvCatalogGenreOptions(genres);
    // invalidar cache de manifest para reflejar cambios
    manifestCache = null;
    manifestCacheTimestamp = null;
  } catch (error) {
    console.warn('[addonConfig] Error computando géneros desde CSV:', error?.message || error);
  }
}

/**
 * Devuelve el manifest generado (con cache). Debe llamarse después de ajustar opciones dinámicas.
 */
export function getManifest() {
  return Object.freeze(generateManifest());
}