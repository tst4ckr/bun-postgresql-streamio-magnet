/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './constants.js';

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
        name: 'catalog',
        types: ['movie', 'series', 'anime', 'tv', 'channel'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:', 'tv_']
      },
      {
        name: 'meta',
        types: ['movie', 'series', 'anime', 'tv', 'channel'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:', 'tv_']
      },
      {
        name: 'stream',
        types: ['movie', 'series', 'anime', 'tv', 'channel'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:', 'tv_']
      }
    ],
    types: ['movie', 'series', 'anime', 'tv', 'channel'],
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
        type: 'anime',
        id: 'anime_catalog',
        name: 'Anime'
      },
      {
        type: 'tv',
        id: 'tv_catalog',
        name: 'TV Channels',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'genre', isRequired: false },
          { name: 'skip', isRequired: false },
          { name: 'limit', isRequired: false }
        ]
      }
      ,
      {
        type: 'channel',
        id: 'tv_catalog',
        name: 'TV Channels',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'genre', isRequired: false },
          { name: 'skip', isRequired: false },
          { name: 'limit', isRequired: false }
        ]
      }
    ],
    idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:', 'tv:', 'tv_']
  },
  server: {
    port: process.env.PORT || CONSTANTS.NETWORK.DEFAULT_SERVER_PORT,
  },
  cache: {
    streamCacheMaxAge: parseInt(process.env.CACHE_STREAM_MAX_AGE) || CONSTANTS.CACHE.STREAM_MAX_AGE,
    streamStaleRevalidate: parseInt(process.env.CACHE_STREAM_STALE_REVALIDATE) || CONSTANTS.CACHE.STREAM_STALE_REVALIDATE,
    streamStaleError: parseInt(process.env.CACHE_STREAM_STALE_ERROR) || CONSTANTS.CACHE.STREAM_STALE_ERROR,
    // Cache específico para anime (más tiempo debido a menor frecuencia de cambios)
    animeCacheMaxAge: parseInt(process.env.CACHE_ANIME_MAX_AGE) || CONSTANTS.CACHE.ANIME_MAX_AGE,
    // Cache para metadatos
    metadataCacheMaxAge: parseInt(process.env.CACHE_METADATA_MAX_AGE) || CONSTANTS.CACHE.METADATA_MAX_AGE,
    // Cache específico para TV M3U (streams en vivo requieren cache más corto)
    tvCacheMaxAge: parseInt(process.env.CACHE_TV_MAX_AGE) || CONSTANTS.CACHE.TV_CACHE_MAX_AGE,
    tvCatalogMaxAge: parseInt(process.env.CACHE_TV_CATALOG_MAX_AGE) || CONSTANTS.CACHE.TV_CATALOG_MAX_AGE,
    tvStreamStaleRevalidate: parseInt(process.env.CACHE_TV_STREAM_STALE_REVALIDATE) || CONSTANTS.CACHE.TV_STREAM_STALE_REVALIDATE,
    tvStreamStaleError: parseInt(process.env.CACHE_TV_STREAM_STALE_ERROR) || CONSTANTS.CACHE.TV_STREAM_STALE_ERROR
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
    primaryCsvPath: process.env.PRIMARY_CSV_PATH || resolvePath('data/torrents/magnets.csv'),
    secondaryCsvPath: process.env.SECONDARY_CSV_PATH || resolvePath('data/torrents/torrentio.csv'),
    animeCsvPath: process.env.ANIME_CSV_PATH || resolvePath('data/torrents/anime.csv'),
    torrentioApiUrl: process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun/',
    timeout: parseInt(process.env.CSV_TIMEOUT) || CONSTANTS.TIME.DEFAULT_TIMEOUT,
    // Configuración específica para TV M3U
    m3uUrl: process.env.M3U_URL || null,
    m3uCacheTimeout: parseInt(process.env.M3U_CACHE_TIMEOUT) || CONSTANTS.CACHE.TV_M3U_CACHE_TIMEOUT,
    maxTvChannels: parseInt(process.env.MAX_TV_CHANNELS) || CONSTANTS.LIMIT.MAX_TV_CHANNELS
  },
  tor: {
    enabled: process.env.TOR_ENABLED === 'true' || false, // Por defecto false, se activa explícitamente con TOR_ENABLED=true
    host: process.env.TOR_HOST || CONSTANTS.NETWORK.TOR_DEFAULT_HOST,
    port: parseInt(process.env.TOR_PORT) || CONSTANTS.NETWORK.TOR_DEFAULT_PORT
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
      enableSubtitles: process.env.TORRENTIO_ANIME_SUBTITLES === 'true' || true,
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
    minSeeders: parseInt(process.env.MAGNET_MIN_SEEDERS) || CONSTANTS.LIMIT.MIN_SEEDERS,
    // Calidades preferidas en orden de prioridad (array)
    qualityPriority: (process.env.MAGNET_QUALITY_PRIORITY || CONSTANTS.QUALITY.QUALITY_PRIORITIES.join(',')).split(','),
    // Habilitar logging detallado de selección
    enableSelectionLogging: process.env.MAGNET_SELECTION_LOGGING === 'true' || false
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
    enabled: process.env.CASCADE_SEARCH_ENABLED === 'true' || true,
    maxRetries: parseInt(process.env.CASCADE_MAX_RETRIES) || CONSTANTS.CASCADE.MAX_RETRIES,
    retryDelay: parseInt(process.env.CASCADE_RETRY_DELAY) || CONSTANTS.CASCADE.RETRY_DELAY,
    timeout: parseInt(process.env.CASCADE_TIMEOUT) || CONSTANTS.CASCADE.TIMEOUT,
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
export const manifest = Object.freeze(generateManifest());