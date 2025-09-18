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
        types: ['movie', 'series', 'anime'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:'],
        // Aprovechar configuración de cascada para catálogos
        cascadeEnabled: true
      },
      {
        name: 'meta',
        types: ['movie', 'series', 'anime'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:'],
        // Usar metadatos específicos por tipo
        typeSpecific: {
          movie: { providers: ['tmdb', 'imdb'] },
          series: { providers: ['tmdb', 'tvdb'] },
          anime: { providers: ['mal', 'kitsu', 'anilist', 'anidb'] }
        }
      },
      {
        name: 'stream',
        types: ['movie', 'series', 'anime'],
        idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:'],
        // Aprovechar configuración de torrentio por tipo
        typeSpecific: {
          movie: { 
            providers: process.env.TORRENTIO_MOVIE_PROVIDERS || CONSTANTS.PROVIDER.MOVIE_PROVIDERS.SPANISH,
            qualityFilter: process.env.TORRENTIO_MOVIE_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_MOVIE_QUALITY_FILTER
          },
          series: { 
            providers: process.env.TORRENTIO_SERIES_PROVIDERS || CONSTANTS.PROVIDER.SERIES_PROVIDERS.SPANISH,
            qualityFilter: process.env.TORRENTIO_SERIES_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_SERIES_QUALITY_FILTER
          },
          anime: { 
            providers: process.env.TORRENTIO_ANIME_PROVIDERS || CONSTANTS.PROVIDER.ANIME_PROVIDERS.DEFAULT,
            qualityFilter: process.env.TORRENTIO_ANIME_QUALITY_FILTER || CONSTANTS.QUALITY.DEFAULT_ANIME_QUALITY_FILTER,
            enableSubtitles: process.env.TORRENTIO_ANIME_SUBTITLES === 'true' || true
          }
        }
      }
    ],
    types: ['movie', 'series', 'anime'],
    catalogs: [
      {
        type: 'movie',
        id: 'torrent_search_movies',
        name: 'Torrent Search Movies',
        extra: [{ name: 'search', isRequired: false }]
      },
      {
        type: 'series',
        id: 'torrent_search_series',
        name: 'Torrent Search Series',
        extra: [{ name: 'search', isRequired: false }]
      },
      {
        type: 'anime',
        id: 'torrent_search_anime',
        name: 'Torrent Search Anime',
        extra: [{ name: 'search', isRequired: false }]
      }
    ],
    idPrefixes: ['tt', 'kitsu:', 'mal:', 'anilist:', 'anidb:']
  },
  server: {
    port: process.env.PORT || CONSTANTS.NETWORK.DEFAULT_SERVER_PORT,
  },
  cache: {
    streamCacheMaxAge: process.env.CACHE_STREAM_MAX_AGE || CONSTANTS.CACHE.STREAM_MAX_AGE,
    streamStaleRevalidate: process.env.CACHE_STREAM_STALE_REVALIDATE || CONSTANTS.CACHE.STREAM_STALE_REVALIDATE,
    streamStaleError: process.env.CACHE_STREAM_STALE_ERROR || CONSTANTS.CACHE.STREAM_STALE_ERROR,
    // Cache específico para anime (más tiempo debido a menor frecuencia de cambios)
    animeCacheMaxAge: process.env.CACHE_ANIME_MAX_AGE || CONSTANTS.CACHE.ANIME_MAX_AGE,
    // Cache para metadatos
    metadataCacheMaxAge: process.env.CACHE_METADATA_MAX_AGE || CONSTANTS.CACHE.METADATA_MAX_AGE
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
    timeout: parseInt(process.env.CSV_TIMEOUT) || CONSTANTS.TIME.DEFAULT_TIMEOUT
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

  // Optimizar catálogos con configuración avanzada
  const optimizedCatalogs = config.addon.catalogs.map(catalog => ({
    ...catalog,
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false },
      { name: 'genre', isRequired: false, options: ['action', 'comedy', 'drama', 'horror', 'sci-fi', 'anime'] }
    ]
  }));

  // Generar manifest optimizado aprovechando configuración existente
  const manifest = {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    logo: config.addon.logo,
    background: config.addon.background,
    resources: config.addon.resources,
    types: uniqueTypes,
    catalogs: optimizedCatalogs,
    idPrefixes: uniqueIdPrefixes,
    behaviorHints: {
      configurable: process.env.ADDON_CONFIGURABLE === 'true' || false,
      configurationRequired: false,
      adult: process.env.ADDON_ADULT_CONTENT === 'true' || false,
      p2p: true,
      // Aprovechar configuración de cache existente
      cacheMaxAge: config.cache.streamCacheMaxAge,
      // Indicar soporte para búsqueda avanzada
      searchable: true,
      // Aprovechar sistema de cascada
      cascadeSearch: config.cascadeSearch.enabled
    },
    // Metadatos adicionales aprovechando configuración existente
    contactEmail: process.env.ADDON_CONTACT_EMAIL || undefined,
    // Configuración de rendimiento basada en configuración existente
    performance: {
      torEnabled: config.tor.enabled,
      cascadeSearchEnabled: config.cascadeSearch.enabled,
      maxRetries: config.cascadeSearch.maxRetries,
      timeout: config.cascadeSearch.timeout,
      cacheStrategy: {
        streams: config.cache.streamCacheMaxAge,
        metadata: config.cache.metadataCacheMaxAge,
        anime: config.cache.animeCacheMaxAge
      }
    },
    // Configuración de proveedores por tipo
    providerConfig: {
      movie: {
        providers: config.torrentio.movie.providers,
        qualityFilter: config.torrentio.movie.qualityFilter,
        language: config.torrentio.movie.priorityLanguage
      },
      series: {
        providers: config.torrentio.series.providers,
        qualityFilter: config.torrentio.series.qualityFilter,
        language: config.torrentio.series.priorityLanguage
      },
      anime: {
        providers: config.torrentio.anime.providers,
        qualityFilter: config.torrentio.anime.qualityFilter,
        language: config.torrentio.anime.priorityLanguage,
        subtitles: config.torrentio.anime.enableSubtitles,
        fansubs: config.torrentio.anime.preferredFansubs
      }
    }
  };

  // Actualizar cache
  manifestCache = manifest;
  manifestCacheTimestamp = now;

  return manifest;
}

export const addonConfig = Object.freeze(config);
export const manifest = Object.freeze(generateManifest());