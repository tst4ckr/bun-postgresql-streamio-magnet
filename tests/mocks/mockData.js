/**
 * @fileoverview Datos de prueba reutilizables para testing
 * Siguiendo principios de DDD y Clean Architecture
 */

/**
 * Datos de prueba para streams
 */
export const MOCK_STREAMS = {
  valid: {
    name: 'Test Movie 2024 1080p BluRay x264-TEST',
    infoHash: 'a1b2c3d4e5f6789012345678901234567890abcd',
    fileIdx: 0,
    sources: ['test-tracker'],
    title: 'Test Movie 2024 1080p',
    size: 1073741824, // 1GB
    seeders: 100,
    quality: '1080p',
    type: 'movie',
    behaviorHints: {
      bingeGroup: 'test-movie-group',
      notWebReady: false
    }
  },
  
  series: {
    name: 'Test Series S01E01 1080p WEB-DL x264-TEST',
    infoHash: 'b2c3d4e5f6789012345678901234567890abcdef',
    fileIdx: 1,
    sources: ['test-series-tracker'],
    title: 'Test Series S01E01',
    size: 536870912, // 512MB
    seeders: 50,
    quality: '1080p',
    type: 'series',
    behaviorHints: {
      bingeGroup: 'test-series-s01',
      notWebReady: false
    }
  },
  
  lowQuality: {
    name: 'Test Movie 2024 480p DVDRip x264-TEST',
    infoHash: 'c3d4e5f6789012345678901234567890abcdef12',
    fileIdx: 0,
    sources: ['test-tracker'],
    title: 'Test Movie 2024 480p',
    size: 268435456, // 256MB
    seeders: 25,
    quality: '480p',
    type: 'movie'
  },
  
  noSeeders: {
    name: 'Test Movie 2024 1080p BluRay x264-DEAD',
    infoHash: 'd4e5f6789012345678901234567890abcdef1234',
    fileIdx: 0,
    sources: ['dead-tracker'],
    title: 'Test Movie 2024 1080p',
    size: 1073741824,
    seeders: 0,
    quality: '1080p',
    type: 'movie'
  }
};

/**
 * Datos de prueba para metadata
 */
export const MOCK_METADATA = {
  movie: {
    id: 'tt1234567',
    type: 'movie',
    name: 'Test Movie',
    year: 2024,
    genres: ['Action', 'Drama'],
    description: 'A test movie for unit testing',
    poster: 'https://example.com/poster.jpg',
    background: 'https://example.com/background.jpg',
    imdbRating: 8.5,
    runtime: '120 min',
    director: ['Test Director'],
    cast: ['Test Actor 1', 'Test Actor 2'],
    country: 'US',
    language: 'en'
  },
  
  series: {
    id: 'tt7654321',
    type: 'series',
    name: 'Test Series',
    year: 2023,
    genres: ['Drama', 'Thriller'],
    description: 'A test series for unit testing',
    poster: 'https://example.com/series-poster.jpg',
    background: 'https://example.com/series-background.jpg',
    imdbRating: 9.0,
    runtime: '45 min',
    director: ['Test Series Director'],
    cast: ['Test Series Actor 1', 'Test Series Actor 2'],
    country: 'US',
    language: 'en',
    videos: [
      {
        id: 'tt7654321:1:1',
        title: 'Episode 1',
        season: 1,
        episode: 1,
        overview: 'First episode of test series',
        released: '2023-01-01T00:00:00.000Z'
      }
    ]
  },
  
  anime: {
    id: 'kitsu:12345',
    type: 'series',
    name: 'Test Anime',
    year: 2024,
    genres: ['Animation', 'Action'],
    description: 'A test anime for unit testing',
    poster: 'https://example.com/anime-poster.jpg',
    background: 'https://example.com/anime-background.jpg',
    imdbRating: 8.8,
    runtime: '24 min',
    country: 'JP',
    language: 'ja'
  }
};

/**
 * Datos de prueba para errores
 */
export const MOCK_ERRORS = {
  validation: {
    name: 'ValidationError',
    message: 'Invalid input parameters',
    code: 'VALIDATION_ERROR',
    details: {
      field: 'imdbId',
      value: 'invalid-id',
      expected: 'Valid IMDB ID format'
    }
  },
  
  network: {
    name: 'NetworkError',
    message: 'Failed to fetch data from external API',
    code: 'NETWORK_ERROR',
    details: {
      url: 'https://api.example.com/data',
      status: 500,
      timeout: 5000
    }
  },
  
  timeout: {
    name: 'TimeoutError',
    message: 'Request timeout exceeded',
    code: 'TIMEOUT_ERROR',
    details: {
      timeout: 10000,
      operation: 'stream_fetch'
    }
  },
  
  notFound: {
    name: 'NotFoundError',
    message: 'Resource not found',
    code: 'NOT_FOUND',
    details: {
      resource: 'stream',
      id: 'tt9999999'
    }
  }
};

/**
 * Datos de prueba para configuración
 */
export const MOCK_CONFIG = {
  default: {
    server: {
      port: 7000,
      host: '0.0.0.0',
      timeout: 30000
    },
    cache: {
      stream: { ttl: 3600, maxSize: 1000 },
      anime: { ttl: 7200, maxSize: 500 },
      metadata: { ttl: 86400, maxSize: 2000 }
    },
    logging: {
      level: 'info',
      format: 'json'
    },
    torrentio: {
      movies: {
        providers: 'yts,eztv,rarbg',
        sort: 'qualitysize',
        qualityFilter: '480p,720p,1080p'
      }
    }
  },
  
  test: {
    server: {
      port: 7001,
      host: '127.0.0.1'
    },
    cache: {
      stream: { ttl: 300, maxSize: 100 }
    },
    logging: {
      level: 'error'
    }
  }
};

/**
 * Datos de prueba para requests HTTP
 */
export const MOCK_REQUESTS = {
  stream: {
    valid: {
      type: 'movie',
      id: 'tt1234567'
    },
    
    series: {
      type: 'series',
      id: 'tt7654321:1:1'
    },
    
    invalid: {
      type: 'invalid',
      id: 'invalid-id'
    }
  },
  
  catalog: {
    movies: {
      type: 'movie',
      id: 'top',
      extra: {
        skip: 0,
        genre: 'Action'
      }
    },
    
    series: {
      type: 'series', 
      id: 'top',
      extra: {
        skip: 0,
        genre: 'Drama'
      }
    }
  }
};

/**
 * Datos de prueba para respuestas de APIs externas
 */
export const MOCK_API_RESPONSES = {
  torrentio: {
    success: {
      streams: [
        MOCK_STREAMS.valid,
        MOCK_STREAMS.series
      ]
    },
    
    empty: {
      streams: []
    },
    
    error: {
      error: 'Internal server error',
      code: 500
    }
  },
  
  imdb: {
    movie: MOCK_METADATA.movie,
    series: MOCK_METADATA.series,
    notFound: {
      error: 'Title not found',
      code: 404
    }
  }
};

/**
 * Utilidades para generar datos de prueba dinámicos
 */
export const MockDataGenerator = {
  /**
   * Genera un stream de prueba con parámetros personalizados
   * @param {Object} overrides - Propiedades a sobrescribir
   * @returns {Object} Stream de prueba
   */
  createStream(overrides = {}) {
    return {
      ...MOCK_STREAMS.valid,
      ...overrides,
      infoHash: overrides.infoHash || this.generateInfoHash()
    };
  },
  
  /**
   * Genera metadata de prueba con parámetros personalizados
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @param {Object} overrides - Propiedades a sobrescribir
   * @returns {Object} Metadata de prueba
   */
  createMetadata(type = 'movie', overrides = {}) {
    const base = MOCK_METADATA[type] || MOCK_METADATA.movie;
    return {
      ...base,
      ...overrides,
      id: overrides.id || this.generateId(type)
    };
  },
  
  /**
   * Genera un error de prueba con parámetros personalizados
   * @param {string} type - Tipo de error
   * @param {Object} overrides - Propiedades a sobrescribir
   * @returns {Error} Error de prueba
   */
  createError(type = 'validation', overrides = {}) {
    const base = MOCK_ERRORS[type] || MOCK_ERRORS.validation;
    const error = new Error(overrides.message || base.message);
    error.name = overrides.name || base.name;
    error.code = overrides.code || base.code;
    error.details = { ...base.details, ...overrides.details };
    return error;
  },
  
  /**
   * Genera un hash de torrent aleatorio
   * @returns {string} Hash de 40 caracteres
   */
  generateInfoHash() {
    return Array.from({ length: 40 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  },
  
  /**
   * Genera un ID aleatorio según el tipo
   * @param {string} type - Tipo de contenido
   * @returns {string} ID generado
   */
  generateId(type = 'movie') {
    switch (type) {
      case 'movie':
      case 'series':
        return `tt${Math.floor(Math.random() * 9000000) + 1000000}`;
      case 'anime':
        return `kitsu:${Math.floor(Math.random() * 90000) + 10000}`;
      default:
        return `test:${Math.floor(Math.random() * 90000) + 10000}`;
    }
  }
};