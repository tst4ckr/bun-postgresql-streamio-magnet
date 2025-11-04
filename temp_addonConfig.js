  repository: {
    primaryCsvPath: process.env.PRIMARY_CSV_PATH || resolvePath('data/torrents/magnets.csv'),
    secondaryCsvPath: process.env.SECONDARY_CSV_PATH || resolvePath('data/torrents/torrentio.csv'),
    animeCsvPath: process.env.ANIME_CSV_PATH || resolvePath('data/torrents/anime.csv'),
    torrentioApiUrl: process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun/',
    timeout: parseInt(process.env.CSV_TIMEOUT) || CONSTANTS.TIME.DEFAULT_TIMEOUT,
    // Configuración específica para TV M3U
    m3uUrl: process.env.M3U_URL ? resolvePath(process.env.M3U_URL) : null,
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
