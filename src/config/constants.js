/**
 * @fileoverview constants - Constantes centralizadas del sistema.
 * Centraliza todos los números mágicos y valores constantes para facilitar mantenimiento.
 */

/**
 * Constantes de tiempo en milisegundos
 */
export const TIME_CONSTANTS = {
  // Cache
  MANIFEST_CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 horas
  MANIFEST_CACHE_SHORT_EXPIRY: 5 * 60 * 1000, // 5 minutos
  
  // Timeouts
  DEFAULT_TIMEOUT: 30000, // 30 segundos
  TOR_RETRY_DELAY: 2000, // 2 segundos
  CASCADE_RETRY_DELAY: 1000, // 1 segundo
  
  // Rotación Tor
  TOR_ROTATION_INTERVAL: 10 * 60 * 1000, // 10 minutos
  TOR_SESSION_DELAY: 5000, // 5 segundos
};

/**
 * Constantes de red y conectividad
 */
export const NETWORK_CONSTANTS = {
  // Tor
  TOR_DEFAULT_HOST: '127.0.0.1',
  TOR_DEFAULT_PORT: 9050,
  TOR_CONTROL_DEFAULT_HOST: '127.0.0.1',
  TOR_CONTROL_DEFAULT_PORT: 9051,
  
  // Reintentos
  MAX_RETRIES: 3,
  TOR_CHECK_TIMEOUT: 3000, // 3 segundos
  
  // Puertos
  DEFAULT_SERVER_PORT: 7011,
  
  // Headers HTTP
  USER_AGENT: 'Stremio-Magnet-Search-Addon/1.0.0',
  FIREFOX_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0',
  
  // Timeouts específicos por proveedor
  PROVIDER_TIMEOUTS: {
    MAL: 60000,
    ANIDB: 30000,
  },
};

/**
 * Constantes de archivos y rutas
 */
export const FILE_CONSTANTS = {
  // Headers CSV
  CSV_HEADERS: 'content_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode,imdb_id,id_type\n',
  
  // Extensiones de archivo
  LOG_FILE_EXTENSION: '.log',
  CSV_FILE_EXTENSION: '.csv',
};

/**
 * Constantes de calidad de video
 */
export const QUALITY_CONSTANTS = {
  // Prioridades de calidad
  QUALITY_PRIORITIES: ['4K', '2160p', '1080p', '720p', '480p', '360p'],
  
  // Patrones de calidad
  QUALITY_PATTERNS: {
    '4K': /4K|2160p/i,
    '2160p': /2160p/i,
    '1080p': /1080p/i,
    '720p': /720p/i,
    '480p': /480p/i,
    '360p': /360p/i,
  },
  
  // Filtros de calidad por defecto
  DEFAULT_MOVIE_QUALITY_FILTER: 'scr,cam,unknown',
  DEFAULT_SERIES_QUALITY_FILTER: 'scr,cam,unknown',
  DEFAULT_ANIME_QUALITY_FILTER: 'unknown',
};

/**
 * Constantes de proveedores
 */
export const PROVIDER_CONSTANTS = {
  // Proveedores por tipo
  MOVIE_PROVIDERS: {
    SPANISH: 'mejortorrent,wolfmax4k,cinecalidad',
    COMBINED: 'mejortorrent,wolfmax4k,cinecalidad,yts,eztv,rarbg,1337x,thepiratebay',
  },
  
  SERIES_PROVIDERS: {
    SPANISH: 'mejortorrent,wolfmax4k,cinecalidad',
    COMBINED: 'mejortorrent,wolfmax4k,cinecalidad,eztv,rarbg,1337x,thepiratebay,horriblesubs,nyaasi',
  },
  
  ANIME_PROVIDERS: {
    DEFAULT: 'horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws',
    SPANISH: 'mejortorrent,wolfmax4k,cinecalidad',
    COMBINED: 'horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws,mejortorrent,wolfmax4k,cinecalidad',
    PREFERRED_FANSUBS: 'horriblesubs,subsplease,erai-raws',
  },
};

/**
 * Constantes de límites y pesos
 */
export const LIMIT_CONSTANTS = {
  // Límites de resultados
  DEFAULT_MOVIE_LIMIT: 10,
  DEFAULT_SERIES_LIMIT: 10,
  DEFAULT_ANIME_LIMIT: 15,
  
  // Pesos para selección balanceada
  BALANCED_WEIGHTS: {
    SEEDERS: 70,
    QUALITY: 30,
  },
  
  // Mínimos
  MIN_SEEDERS: 1,
  
  // Stack de comandos
  MAX_COMMAND_STACK: 10,
  
  // Límites de búsqueda
  MAX_SEARCH_RESULTS: 100,
  DEFAULT_SEARCH_LIMIT: 20,
  MIN_SEARCH_QUERY_LENGTH: 2,
  MAX_SEARCH_QUERY_LENGTH: 100,

  // Límites de paginación
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,

  // Límites de streams
  MAX_STREAMS_PER_ITEM: 50,
  DEFAULT_STREAMS_LIMIT: 20,

  // Límites de metadatos
  MAX_METADATA_SIZE: 1024 * 1024, // 1MB
  MAX_POSTER_SIZE: 512 * 1024, // 512KB

  // Límites específicos para TV M3U
  MAX_TV_CHANNELS: 1000,
  DEFAULT_TV_CATALOG_SIZE: 100,
  MAX_M3U_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  TV_CHANNEL_NAME_MAX_LENGTH: 100,
  TV_GROUP_NAME_MAX_LENGTH: 50,
};

/**
 * Constantes de idiomas
 */
export const LANGUAGE_CONSTANTS = {
  // Idiomas soportados
  SUPPORTED_LANGUAGES: ['spanish', 'english', 'japanese'],
  
  // Configuraciones por defecto
  DEFAULT_MOVIE_LANGUAGE: 'spanish',
  DEFAULT_SERIES_LANGUAGE: 'spanish',
  DEFAULT_ANIME_LANGUAGE: 'japanese',
};

/**
 * Constantes de tipos de contenido
 */
export const CONTENT_TYPE_CONSTANTS = {
  // Tipos de contenido soportados
  // Tipos soportados por el addon. Se añade 'channel' para compatibilidad con clientes
  // que utilizan este tipo para TV en vivo.
  SUPPORTED_TYPES: ['movie', 'series', 'tv', 'channel'],

  // Mapeo de tipos de contenido
  TYPE_MAPPING: {
    movie: 'movie',
    series: 'series',
    tv: 'tv',
  },

  // Configuración por tipo de contenido
  TYPE_CONFIG: {
    movie: {
      hasSeasons: false,
      hasEpisodes: false,
      defaultGenre: 'Unknown',
    },
    series: {
      hasSeasons: true,
      hasEpisodes: true,
      defaultGenre: 'Unknown',
    },
    anime: {
      hasSeasons: true,
      hasEpisodes: true,
      defaultGenre: 'Animation',
    },
    tv: {
      hasSeasons: false,
      hasEpisodes: false,
      defaultGenre: 'Live TV',
      isLive: true,
    },
  },
};

/**
 * Constantes de cache
 */
export const CACHE_CONSTANTS = {
  // Cache de streams
  STREAM_MAX_AGE: 3600, // 1 hora
  STREAM_STALE_REVALIDATE: 3600, // 1 hora
  STREAM_STALE_ERROR: 86400, // 1 día
  ANIME_MAX_AGE: 7200, // 2 horas
  METADATA_MAX_AGE: 86400, // 1 día

  // Cache de metadatos
  MOVIE_METADATA_EXPIRY: 86400000, // 1 día
  SERIES_METADATA_EXPIRY: 86400000, // 1 día
  ANIME_METADATA_EXPIRY: 604800000, // 1 semana
  UNIFIED_ID_CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 horas

  // Cache específico para TV M3U - Aumentado para evitar caídas en streams en vivo
  TV_CACHE_MAX_AGE: 3600, // 1 hora (streams en vivo) - aumentado de 5 minutos para mayor estabilidad
  TV_CATALOG_MAX_AGE: 1800, // 30 minutos (catálogo de canales)
  TV_M3U_CACHE_TIMEOUT: 300000, // 5 minutos para cache M3U
  TV_STREAM_STALE_REVALIDATE: 1800, // 30 minutos - aumentado para permitir revalidación más flexible
  TV_STREAM_STALE_ERROR: 7200, // 2 horas - aumentado para servir contenido obsoleto más tiempo en caso de error

  // Límites de cache
  MAX_CACHE_SIZE: 1000,
  CACHE_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hora
};

/**
 * Constantes de logging
 */
export const LOGGING_CONSTANTS = {
  // Niveles de log
  LOG_LEVELS: ['error', 'warn', 'info', 'debug'],
  
  // Formatos
  LOG_FORMATS: ['simple', 'detailed', 'json'],
  
  // Configuraciones por defecto
  DEFAULT_LOG_LEVEL: 'info',
  PRODUCTION_LOG_LEVEL: 'warn',
  DEFAULT_LOG_FORMAT: 'detailed',
  PRODUCTION_LOG_FORMAT: 'simple',
};

/**
 * Constantes de búsqueda en cascada
 */
export const CASCADE_CONSTANTS = {
  // Prioridades por tipo
  SEARCH_PRIORITIES: {
    movie: ['torrentio', 'primary'],
    series: ['torrentio', 'primary'],
    tv: ['primary'],
  },
  
  // Configuración por defecto
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
  TIMEOUT: 30000, // ms
};

/**
 * Constantes de metadatos
 */
export const METADATA_CONSTANTS = {
  // Campos requeridos por tipo de contenido
  REQUIRED_FIELDS: {
    movie: ['title', 'year', 'imdbId'],
    series: ['title', 'year', 'imdbId'],
    anime: ['title', 'year'],
    tv: ['name', 'streamUrl'],
  },

  // Campos opcionales por tipo de contenido
  OPTIONAL_FIELDS: {
    movie: ['genre', 'director', 'cast', 'plot', 'poster', 'rating'],
    series: ['genre', 'creator', 'cast', 'plot', 'poster', 'rating', 'seasons', 'episodes'],
    anime: ['genre', 'studio', 'director', 'cast', 'plot', 'poster', 'rating', 'episodes', 'status', 'source'],
    tv: ['logo', 'group', 'tvgId', 'tvgName'],
  },

  // Proveedores de metadatos para anime
  ANIME_METADATA_PROVIDERS: {
    PRIMARY: 'kitsu',
    SECONDARY: 'mal,anilist',
    FALLBACK: 'anidb',
  },

  // Configuración específica para TV M3U
  TV_METADATA: {
    DEFAULT_GROUP: 'General',
    DEFAULT_LOGO: 'https://via.placeholder.com/256x256/1a1a1a/ffffff?text=TV',
    RUNTIME: 'Live TV',
    DEFAULT_VIDEO_ID: 'live',
  },
};

/**
 * Constantes de patrones regex
 */
export const REGEX_PATTERNS = {
  // Patrones de ID
  IMDB_ID: /^tt\d+$/,
  TMDB_ID: /^tmdb:\d+$/,
  TVDB_ID: /^tvdb:\d+$/,
  KITSU_ID: /^kitsu:\d+$/,
  MAL_ID: /^mal:\d+$/,
  ANILIST_ID: /^anilist:\d+$/,
  ANIDB_ID: /^anidb:\d+$/,
  
  // Patrones de extracción
  SEEDERS_PEERS: /👤\s*(\d+)\s*\/\s*(\d+)/,
  SIZE_PATTERN: /💾\s*([\d.,]+)\s*(GB|MB|TB)/i,
  QUALITY_PATTERN: /(4K|2160p|1080p|720p|480p|360p)/i,
  
  // Patrones de limpieza
  CLEAN_NAME: /[\[\](){}]/g,
  EXTRA_SPACES: /\s+/g,
};

/**
 * Constantes de conversión
 */
export const CONVERSION_CONSTANTS = {
  // Conversiones de tamaño
  SIZE_MULTIPLIERS: {
    TB: 1024,
    GB: 1,
    MB: 1 / 1024,
    KB: 1 / (1024 * 1024),
  },
  
  // Factores de conversión
  BYTES_TO_GB: 1024 * 1024 * 1024,
  BYTES_TO_MB: 1024 * 1024,
  MB_TO_GB: 1024,
  
  // Precisión decimal
  SIZE_DECIMAL_PLACES: 2,
  
  // Ratios de cálculo
  PEERS_TO_SEEDERS_RATIO: 0.3,
  
  // Niveles de confianza
  PERFECT_CONFIDENCE: 1.0,
};

/**
 * Constantes de URLs y endpoints
 */
export const URL_CONSTANTS = {
  // URLs base
  DEFAULT_TORRENTIO_URL: 'https://torrentio.strem.fun/',
  
  // Endpoints
  MANIFEST_ENDPOINT: 'manifest.json',
  STREAM_ENDPOINT: 'stream',
};

/**
 * Exportación de todas las constantes como objeto congelado
 */
export const CONSTANTS = Object.freeze({
  TIME: TIME_CONSTANTS,
  NETWORK: NETWORK_CONSTANTS,
  FILE: FILE_CONSTANTS,
  QUALITY: QUALITY_CONSTANTS,
  PROVIDER: PROVIDER_CONSTANTS,
  LIMIT: LIMIT_CONSTANTS,
  LANGUAGE: LANGUAGE_CONSTANTS,
  CACHE: CACHE_CONSTANTS,
  LOGGING: LOGGING_CONSTANTS,
  CASCADE: CASCADE_CONSTANTS,
  METADATA: METADATA_CONSTANTS,
  CONTENT_TYPE: CONTENT_TYPE_CONSTANTS,
  REGEX: REGEX_PATTERNS,
  CONVERSION: CONVERSION_CONSTANTS,
  URL: URL_CONSTANTS,
});

export default CONSTANTS;