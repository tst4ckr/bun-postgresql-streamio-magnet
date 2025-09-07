/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Detectar si estamos en un contenedor
const isContainer = process.env.NODE_ENV === 'production' && process.env.CONTAINER_ENV === 'true';

// Obtener directorio del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Función para resolver rutas según el entorno
function resolvePath(relativePath) {
  if (isContainer) {
    // En contenedor, usar rutas relativas desde /app
    return join('/app', relativePath);
  }
  // En desarrollo local, usar rutas relativas desde el proyecto
  return join(projectRoot, relativePath);
}

const config = {
  addon: {
    id: process.env.ADDON_ID || 'org.stremio.torrent.search',
    version: process.env.ADDON_VERSION || '1.3.0',
    name: process.env.ADDON_NAME || 'Torrent Search Pro',
    description: process.env.ADDON_DESCRIPTION || 'Advanced torrent search addon with cascading search system for movies, series and anime. Features unified metadata management, detailed logging, and specialized anime support with multiple ID formats.',
    logo: process.env.ADDON_LOGO || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9IjEyOCIgeT0iMTQwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNzIiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5UUzwvdGV4dD4KPC9zdmc+',
    background: process.env.ADDON_BACKGROUND || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9Ijk2MCIgeT0iNTgwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iODAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Ub3JyZW50IFNlYXJjaDwvdGV4dD4KPC9zdmc+',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series', 'anime'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:']
      }
    ],
    types: ['movie', 'series', 'anime'],
    catalogs: [],
    idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:']
  },
  server: {
    port: process.env.PORT || 7000,
  },
  cache: {
    streamCacheMaxAge: process.env.CACHE_STREAM_MAX_AGE || 3600, // 1 hora
    streamStaleRevalidate: process.env.CACHE_STREAM_STALE_REVALIDATE || 3600,
    streamStaleError: process.env.CACHE_STREAM_STALE_ERROR || 86400, // 1 día
    // Cache específico para anime (más largo debido a menor frecuencia de cambios)
    animeCacheMaxAge: process.env.CACHE_ANIME_MAX_AGE || 7200, // 2 horas
    // Cache para metadatos
    metadataCacheMaxAge: process.env.CACHE_METADATA_MAX_AGE || 86400, // 1 día
  },
  logging: {
    // Optimización para producción: usar 'warn' por defecto en producción, 'info' en desarrollo
    logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
    enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true' || (process.env.NODE_ENV !== 'production'),
    logFormat: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'simple' : 'detailed'),
    logToFile: process.env.LOG_TO_FILE === 'true' || false,
    logFilePath: process.env.LOG_FILE_PATH || resolvePath('logs/addon.log'),
    // Configuración específica para producción
    production: {
      disableSourceTracking: true,
      minimalOutput: true,
      errorOnly: process.env.PRODUCTION_ERROR_ONLY === 'true' || false
    }
  },
  repository: {
    primaryCsvPath: process.env.PRIMARY_CSV_PATH || resolvePath('data/magnets.csv'),
    secondaryCsvPath: process.env.SECONDARY_CSV_PATH || resolvePath('data/torrentio.csv'),
    animeCsvPath: process.env.ANIME_CSV_PATH || resolvePath('data/anime.csv'),
    torrentioApiUrl: process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun/',
    timeout: parseInt(process.env.CSV_TIMEOUT) || 30000
  },
  tor: {
    enabled: process.env.TOR_ENABLED === 'true' || false, // Por defecto false, se activa explícitamente con TOR_ENABLED=true
    host: process.env.TOR_HOST || '127.0.0.1',
    port: parseInt(process.env.TOR_PORT) || 9050
  },
  torrentio: {
    movie: {
      providers: process.env.TORRENTIO_MOVIE_PROVIDERS || 'mejortorrent,wolfmax4k,cinecalidad',
      sort: process.env.TORRENTIO_MOVIE_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_MOVIE_QUALITY_FILTER || 'scr,cam,unknown',
      limit: parseInt(process.env.TORRENTIO_MOVIE_LIMIT) || 10,
      priorityLanguage: process.env.TORRENTIO_MOVIE_LANGUAGE || 'spanish'
    },
    series: {
      providers: process.env.TORRENTIO_SERIES_PROVIDERS || 'horriblesubs,nyaasi,tokyotosho,anidex,mejortorrent,wolfmax4k,cinecalidad',
      sort: process.env.TORRENTIO_SERIES_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_SERIES_QUALITY_FILTER || 'scr,cam,unknown',
      limit: parseInt(process.env.TORRENTIO_SERIES_LIMIT) || 10,
      priorityLanguage: process.env.TORRENTIO_SERIES_LANGUAGE || 'spanish'
    },
    anime: {
      providers: process.env.TORRENTIO_ANIME_PROVIDERS || 'horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws',
      sort: process.env.TORRENTIO_ANIME_SORT || 'seeders',
      qualityFilter: process.env.TORRENTIO_ANIME_QUALITY_FILTER || 'unknown',
      limit: parseInt(process.env.TORRENTIO_ANIME_LIMIT) || 15, // Más resultados para anime
      priorityLanguage: process.env.TORRENTIO_ANIME_LANGUAGE || 'japanese',
      // Configuración específica para anime
      enableSubtitles: process.env.TORRENTIO_ANIME_SUBTITLES === 'true' || true,
      preferredFansubs: process.env.TORRENTIO_ANIME_FANSUBS || 'horriblesubs,subsplease,erai-raws',
      qualityPriority: process.env.TORRENTIO_ANIME_QUALITY_PRIORITY || '1080p,720p,480p',
      enableBatch: process.env.TORRENTIO_ANIME_BATCH === 'true' || false
    }
  },
  // Configuración específica para metadatos
  metadata: {
    // Configuración para películas
    movie: {
      requiredFields: ['title', 'year', 'imdbId'],
      optionalFields: ['genre', 'director', 'cast', 'plot', 'poster', 'rating'],
      cacheExpiry: 86400000 // 1 día en ms
    },
    // Configuración para series
    series: {
      requiredFields: ['title', 'year', 'imdbId'],
      optionalFields: ['genre', 'creator', 'cast', 'plot', 'poster', 'rating', 'seasons', 'episodes'],
      cacheExpiry: 86400000 // 1 día en ms
    },
    // Configuración específica para anime
    anime: {
      requiredFields: ['title', 'year'],
      optionalFields: ['genre', 'studio', 'director', 'cast', 'plot', 'poster', 'rating', 'episodes', 'status', 'source'],
      cacheExpiry: 604800000, // 1 semana en ms (anime cambia menos frecuentemente)
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
        primary: process.env.ANIME_METADATA_PRIMARY || 'kitsu',
        secondary: process.env.ANIME_METADATA_SECONDARY || 'mal,anilist',
        fallback: process.env.ANIME_METADATA_FALLBACK || 'anidb'
      }
    }
  },
  // Configuración del sistema de búsqueda en cascada
  cascadeSearch: {
    enabled: process.env.CASCADE_SEARCH_ENABLED === 'true' || true,
    maxRetries: parseInt(process.env.CASCADE_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.CASCADE_RETRY_DELAY) || 1000, // ms
    timeout: parseInt(process.env.CASCADE_TIMEOUT) || 30000, // ms
    // Prioridades por tipo de contenido
    priorities: {
      movie: ['torrentio', 'primary', 'anime'], // Para películas, priorizar torrentio
      series: ['torrentio', 'primary', 'anime'], // Para series, priorizar torrentio
      anime: ['anime', 'torrentio', 'primary'] // Para anime, priorizar repositorio de anime
    },
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
const MANIFEST_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutos

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

  // Generar manifest fresco
  const manifest = {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    logo: config.addon.logo,
    background: config.addon.background,
    resources: config.addon.resources,
    types: config.addon.types,
    catalogs: config.addon.catalogs,
    idPrefixes: config.addon.idPrefixes,
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
      adult: false,
      p2p: true
    }
  };

  // Actualizar cache
  manifestCache = manifest;
  manifestCacheTimestamp = now;

  return manifest;
}

/**
 * Limpia el cache del manifest (útil para testing o actualizaciones).
 */
function clearManifestCache() {
  manifestCache = null;
  manifestCacheTimestamp = null;
}

export const addonConfig = Object.freeze(config);
export const manifest = Object.freeze(generateManifest());
export { clearManifestCache };