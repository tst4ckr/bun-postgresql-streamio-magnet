/**
 * @fileoverview M3UParserService_tools - Herramientas auxiliares para el parser M3U
 * Funciones puras y utilidades reutilizables siguiendo principios SOLID
 */

import { Channel } from '../../domain/entities/Channel.js';
import { StreamQuality } from '../../domain/value-objects/StreamQuality.js';

/**
 * Utilidades de preprocesamiento de contenido
 */
export const ContentPreprocessor = {
  /**
   * Normaliza saltos de línea y filtra líneas vacías
   * @param {string} content - Contenido M3U crudo
   * @returns {string[]} Líneas normalizadas
   */
  normalizeLines(content) {
    return content
      .replace(/\r\n/g, '\n')  // Normalizar saltos de línea Windows
      .replace(/\r/g, '\n')    // Normalizar saltos de línea Mac
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  },

  /**
   * Valida que el contenido sea un M3U válido
   * @param {string} content - Contenido a validar
   * @param {boolean} strictMode - Modo estricto
   * @returns {boolean} True si es válido
   * @throws {Error} Si no es válido en modo estricto
   */
  validateM3UFormat(content, strictMode = false) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('El contenido M3U debe ser una cadena no vacía');
    }

    const firstLine = content.trim().split('\n')[0];
    const isValidFormat = firstLine.startsWith('#EXTM3U');
    
    if (!isValidFormat && strictMode) {
      throw new Error('El archivo no comienza con #EXTM3U');
    }
    
    return isValidFormat;
  }
};

/**
 * Utilidades de extracción de metadatos
 */
export const MetadataExtractor = {
  /**
   * Extrae metadatos de una línea EXTINF
   * @param {string} extinf - Línea EXTINF
   * @returns {Object} Metadatos extraídos
   */
  extractFromExtinf(extinf) {
    const metadata = {
      name: null,
      logo: null,
      group: null,
      tvgId: null,
      tvgName: null,
      tvgCountry: null,
      tvgLanguage: null
    };

    try {
      const extractAttribute = (pattern, handler) => {
        const match = extinf.match(pattern);
        if (match) handler(match[1]);
      };

      extractAttribute(/tvg-id="([^"]*)"/i, value => metadata.tvgId = value);
      extractAttribute(/tvg-name="([^"]*)"/i, value => metadata.tvgName = value);
      extractAttribute(/(?:tvg-logo|logo)="([^"]*)"/i, value => metadata.logo = value);
      extractAttribute(/tvg-country="([^"]*)"/i, value => metadata.tvgCountry = value);
      extractAttribute(/tvg-language="([^"]*)"/i, value => metadata.tvgLanguage = value);
      extractAttribute(/group-title="([^"]*)"/i, value => metadata.group = value);

      const nameMatch = extinf.match(/,(.+)$/);
      metadata.name = nameMatch ? nameMatch[1].trim() : metadata.tvgName || 'Canal Desconocido';

    } catch (error) {
      console.warn(`Error extrayendo metadatos: ${extinf}`);
      metadata.name = 'Canal Desconocido';
    }

    return metadata;
  }
};

/**
 * Validadores de URLs y recursos
 */
export const UrlValidator = {
  /**
   * Valida y normaliza URL de logo
   * @param {string} logoUrl - URL del logo
   * @param {boolean} enableValidation - Habilitar validación
   * @returns {string|null} URL válida o null
   */
  validateLogoUrl(logoUrl, enableValidation = true) {
    if (!enableValidation || !logoUrl) {
      return null;
    }

    try {
      // Validar que sea una URL válida
      new URL(logoUrl);
      
      // Verificar que sea una imagen
      const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
      const hasValidExtension = validExtensions.some(ext => 
        logoUrl.toLowerCase().includes(ext)
      );

      return hasValidExtension ? logoUrl : null;
    } catch {
      return null;
    }
  }
};

/**
 * Normalizadores de géneros y categorías
 */
export const GenreNormalizer = {
  /**
   * Mapa de géneros para normalización
   */
  GENRE_MAP: {
    'news': Channel.GENRES.NOTICIAS,
    'noticias': Channel.GENRES.NOTICIAS,
    'sports': Channel.GENRES.DEPORTES,
    'deportes': Channel.GENRES.DEPORTES,
    'entertainment': Channel.GENRES.ENTRETENIMIENTO,
    'entretenimiento': Channel.GENRES.ENTRETENIMIENTO,
    'kids': Channel.GENRES.INFANTIL,
    'infantil': Channel.GENRES.INFANTIL,
    'movies': Channel.GENRES.PELICULAS,
    'películas': Channel.GENRES.PELICULAS,
    'peliculas': Channel.GENRES.PELICULAS,
    'series': Channel.GENRES.SERIES,
    'music': Channel.GENRES.MUSICA,
    'música': Channel.GENRES.MUSICA,
    'musica': Channel.GENRES.MUSICA,
    'documentary': Channel.GENRES.DOCUMENTALES,
    'documentales': Channel.GENRES.DOCUMENTALES,
    'culture': Channel.GENRES.CULTURA,
    'cultura': Channel.GENRES.CULTURA
  },

  /**
   * Normaliza el género del canal
   * @param {string} group - Grupo/género del canal
   * @param {string} defaultGenre - Género por defecto
   * @returns {string} Género normalizado
   */
  normalize(group, defaultGenre = Channel.GENRES.GENERAL) {
    if (!group) return defaultGenre;

    const normalizedGroup = group.toLowerCase().trim();
    
    return this.GENRE_MAP[normalizedGroup] || 
           Object.entries(this.GENRE_MAP).find(([key]) => 
             normalizedGroup.includes(key) || key.includes(normalizedGroup)
           )?.[1] || 
           (Object.values(Channel.GENRES).includes(group) ? group : defaultGenre);
  }
};

/**
 * Normalizadores de países
 */
export const CountryNormalizer = {
  /**
   * Mapa de códigos de país
   */
  COUNTRY_MAP: {
    'mx': 'México',
    'es': 'España',
    'ar': 'Argentina',
    'co': 'Colombia',
    'cl': 'Chile',
    'pe': 'Perú',
    'us': 'Estados Unidos',
    'uk': 'Reino Unido'
  },

  /**
   * Patrones para detectar países por nombre de canal
   */
  COUNTRY_PATTERNS: {
    'México': /mexico|mx|azteca|televisa|imagen/i,
    'España': /españa|spain|es|antena|tve|cuatro/i,
    'Argentina': /argentina|ar|telefe|canal.*13|tn/i,
    'Colombia': /colombia|co|caracol|rcn/i,
    'Chile': /chile|cl|mega|canal.*13.*cl/i,
    'Perú': /peru|pe|america.*tv|panamericana/i
  },

  /**
   * Normaliza el código de país
   * @param {string} country - País a normalizar
   * @returns {string} País normalizado
   */
  normalizeCode(country) {
    const normalized = country.toLowerCase().trim();
    return this.COUNTRY_MAP[normalized] || country;
  },

  /**
   * Extrae país basado en metadatos y nombre del canal
   * @param {Object} metadata - Metadatos del canal
   * @param {string} defaultCountry - País por defecto
   * @returns {string} País detectado
   */
  extractFromMetadata(metadata, defaultCountry = 'Internacional') {
    if (metadata.tvgCountry) {
      return this.normalizeCode(metadata.tvgCountry);
    }

    const channelName = metadata.name?.toLowerCase() || '';
    
    return Object.entries(this.COUNTRY_PATTERNS).find(([, pattern]) => 
      pattern.test(channelName)
    )?.[0] || defaultCountry;
  }
};

/**
 * Normalizadores de idiomas
 */
export const LanguageNormalizer = {
  /**
   * Mapa de idiomas
   */
  LANGUAGE_MAP: {
    'spanish': 'es',
    'español': 'es',
    'english': 'en',
    'inglés': 'en',
    'french': 'fr',
    'francés': 'fr',
    'german': 'de',
    'alemán': 'de',
    'italian': 'it',
    'italiano': 'it',
    'portuguese': 'pt',
    'portugués': 'pt'
  },

  /**
   * Mapa de país a idioma por defecto
   */
  COUNTRY_LANGUAGE_MAP: {
    'México': 'es',
    'España': 'es',
    'Argentina': 'es',
    'Colombia': 'es',
    'Chile': 'es',
    'Perú': 'es',
    'Estados Unidos': 'en',
    'Reino Unido': 'en'
  },

  /**
   * Normaliza el código de idioma
   * @param {string} language - Idioma a normalizar
   * @param {string} defaultLanguage - Idioma por defecto
   * @returns {string} Código de idioma normalizado
   */
  normalize(language, defaultLanguage = 'es') {
    const normalized = language.toLowerCase().trim();
    return this.LANGUAGE_MAP[normalized] || 
           (normalized.length === 2 ? normalized : defaultLanguage);
  },

  /**
   * Extrae idioma basado en metadatos y país
   * @param {Object} metadata - Metadatos del canal
   * @param {string} country - País del canal
   * @param {string} defaultLanguage - Idioma por defecto
   * @returns {string} Código de idioma
   */
  extractFromMetadata(metadata, country, defaultLanguage = 'es') {
    if (metadata.tvgLanguage) {
      return this.normalize(metadata.tvgLanguage, defaultLanguage);
    }

    return this.COUNTRY_LANGUAGE_MAP[country] || defaultLanguage;
  }
};

/**
 * Utilidades de calidad de stream
 */
export const QualityDetector = {
  /**
   * Detecta calidad desde URL
   * @param {string} url - URL del stream
   * @param {boolean} enableDetection - Habilitar detección
   * @param {string} defaultQuality - Calidad por defecto
   * @returns {StreamQuality} Calidad detectada
   */
  detectFromUrl(url, enableDetection = true, defaultQuality = 'Auto') {
    return enableDetection 
      ? StreamQuality.fromUrl(url)
      : StreamQuality.fromString(defaultQuality);
  }
};

/**
 * Utilidades de estadísticas y categorización de errores
 */
export const ErrorCategorizer = {
  /**
   * Categoriza el tipo de error
   * @param {string} errorMessage - Mensaje de error
   * @returns {string} Categoría del error
   */
  categorize(errorMessage) {
    if (errorMessage.includes('formato correcto')) {
      return 'Formato de ID incorrecto';
    }
    if (errorMessage.includes('URL del stream')) {
      return 'URL de stream inválida';
    }
    if (errorMessage.includes('requerido')) {
      return 'Campos requeridos faltantes';
    }
    return 'Otros errores';
  }
};

/**
 * Utilidades de procesamiento de entradas M3U
 */
export const EntryProcessor = {
  /**
   * Extrae entradas crudas del contenido M3U
   * @param {string[]} lines - Líneas del archivo M3U
   * @param {number} maxChannels - Máximo número de canales
   * @returns {Array<Object>} Entradas extraídas
   */
  extractRawEntries(lines, maxChannels = 20000) {
    const entries = [];
    let currentEntry = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXTINF:')) {
        // Nueva entrada
        currentEntry = {
          extinf: line,
          url: null,
          lineNumber: i + 1
        };
      } else if (line.startsWith('#EXT')) {
        // Otras directivas M3U - ignorar por ahora
        continue;
      } else if (line.startsWith('#')) {
        // Comentarios - ignorar
        continue;
      } else if (currentEntry && !currentEntry.url) {
        // URL del stream
        currentEntry.url = line;
        entries.push(currentEntry);
        currentEntry = null;

        // Verificar límite máximo
        if (entries.length >= maxChannels) {
          console.warn(`Límite de canales alcanzado: ${maxChannels}`);
          break;
        }
      }
    }

    return entries;
  },

  /**
   * Crea datos de canal desde una entrada procesada
   * @param {Object} entry - Entrada cruda
   * @param {Object} config - Configuración del parser
   * @returns {Object|null} Datos del canal o null si es inválido
   */
  createChannelData(entry, config) {
    const metadata = MetadataExtractor.extractFromExtinf(entry.extinf);
    
    if (!metadata.name || !entry.url) {
      if (config.strictMode) {
        throw new Error('Nombre y URL son requeridos');
      }
      return null;
    }

    // Generar ID único
    const id = Channel.generateId(metadata.name, Channel.TYPES.TV);

    // Detectar calidad desde la URL
    const quality = QualityDetector.detectFromUrl(
      entry.url, 
      config.enableQualityDetection, 
      config.defaultQuality
    );

    // Procesar logo
    const logo = UrlValidator.validateLogoUrl(
      metadata.logo, 
      config.enableLogoExtraction
    );

    // Extraer país
    const country = CountryNormalizer.extractFromMetadata(
      metadata, 
      config.defaultCountry
    );

    // Extraer idioma
    const language = LanguageNormalizer.extractFromMetadata(
      metadata, 
      country, 
      config.defaultLanguage
    );

    return {
      id,
      name: metadata.name,
      logo,
      streamUrl: entry.url,
      group: GenreNormalizer.normalize(metadata.group, config.defaultGenre),
      country,
      language,
      quality: quality.value,
      tvgId: metadata.tvgId,
      originalData: {
        extinf: entry.extinf,
        metadata
      }
    };
  }
};

/**
 * Utilidades de estadísticas
 */
export const StatsCalculator = {
  /**
   * Calcula estadísticas por género
   * @param {Channel[]} channels - Lista de canales
   * @returns {Object} Estadísticas por género
   */
  calculateGenreStats(channels) {
    const genreStats = {};
    channels.forEach(channel => {
      genreStats[channel.genre] = (genreStats[channel.genre] || 0) + 1;
    });
    return genreStats;
  },

  /**
   * Calcula estadísticas por país
   * @param {Channel[]} channels - Lista de canales
   * @returns {Object} Estadísticas por país
   */
  calculateCountryStats(channels) {
    const countryStats = {};
    channels.forEach(channel => {
      countryStats[channel.country] = (countryStats[channel.country] || 0) + 1;
    });
    return countryStats;
  },

  /**
   * Calcula estadísticas completas del parsing
   * @param {Object} data - Datos del parsing
   * @returns {Object} Estadísticas completas
   */
  calculate(data) {
    const { validChannels, errors, processingTime } = data;
    
    return {
      totalChannels: validChannels.length,
      totalErrors: errors.length,
      processingTime,
      genreStats: this.calculateGenreStats(validChannels),
      countryStats: this.calculateCountryStats(validChannels),
      errorStats: this.calculateErrorStats(errors),
      successRate: validChannels.length / (validChannels.length + errors.length) * 100
    };
  },

  /**
   * Calcula estadísticas de errores
   * @param {Array} errors - Lista de errores
   * @returns {Object} Estadísticas de errores por categoría
   */
  calculateErrorStats(errors) {
    const errorStats = {};
    errors.forEach(error => {
      const category = error.category || 'Otros errores';
      errorStats[category] = (errorStats[category] || 0) + 1;
    });
    return errorStats;
  }
};

export default {
  ContentPreprocessor,
  MetadataExtractor,
  UrlValidator,
  GenreNormalizer,
  CountryNormalizer,
  LanguageNormalizer,
  QualityDetector,
  ErrorCategorizer,
  EntryProcessor,
  StatsCalculator
};