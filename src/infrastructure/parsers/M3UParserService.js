/**
 * @fileoverview M3UParserService - Parser para archivos M3U/M3U8
 * Implementa parsing robusto con manejo de errores y validación
 */

import { Channel } from '../../domain/entities/Channel.js';
import { StreamQuality } from '../../domain/value-objects/StreamQuality.js';

/**
 * Servicio para parsear archivos M3U/M3U8
 * Responsabilidad única: conversión de formato M3U a entidades Channel
 */
export class M3UParserService {
  /**
   * @private
   */
  #config;

  /**
   * @param {Object} config - Configuración del parser
   */
  constructor(config = {}) {
    this.#config = {
      strictMode: config.strictMode ?? false,
      skipInvalidEntries: config.skipInvalidEntries ?? true,
      defaultGenre: config.defaultGenre ?? Channel.GENRES.GENERAL,
      defaultCountry: config.defaultCountry ?? 'Internacional',
      defaultLanguage: config.defaultLanguage ?? 'es',
      enableQualityDetection: config.enableQualityDetection ?? true,
      enableLogoExtraction: config.enableLogoExtraction ?? true,
      maxChannelsPerFile: config.maxChannelsPerFile ?? 10000,
      ...config
    };
  }

  /**
   * Parsea contenido M3U y retorna lista de canales
   * @param {string} content - Contenido del archivo M3U
   * @returns {Promise<Channel[]>}
   * @throws {M3UParseError}
   */
  async parseM3U(content) {
    try {
      this.#validateInput(content);
      
      const lines = this.#preprocessContent(content);
      const rawEntries = this.#extractRawEntries(lines);
      const channels = await this.#processEntries(rawEntries);
      
      return this.#validateAndFilterChannels(channels);
      
    } catch (error) {
      if (error instanceof M3UParseError) {
        throw error;
      }
      throw new M3UParseError(`Error al parsear M3U: ${error.message}`, error);
    }
  }

  /**
   * Valida el contenido de entrada
   * @private
   * @param {string} content 
   * @throws {M3UParseError}
   */
  #validateInput(content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new M3UParseError('El contenido M3U debe ser una cadena no vacía');
    }

    const firstLine = content.trim().split('\n')[0];
    if (!firstLine.startsWith('#EXTM3U')) {
      if (this.#config.strictMode) {
        throw new M3UParseError('El archivo no comienza con #EXTM3U');
      }
      console.warn('Advertencia: El archivo no comienza con #EXTM3U, continuando...');
    }
  }

  /**
   * Preprocesa el contenido para normalizar líneas
   * @private
   * @param {string} content 
   * @returns {string[]}
   */
  #preprocessContent(content) {
    return content
      .replace(/\r\n/g, '\n')  // Normalizar saltos de línea Windows
      .replace(/\r/g, '\n')    // Normalizar saltos de línea Mac
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Extrae entradas crudas del M3U
   * @private
   * @param {string[]} lines 
   * @returns {Array<Object>}
   */
  #extractRawEntries(lines) {
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
        if (entries.length >= this.#config.maxChannelsPerFile) {
          console.warn(`Límite máximo de canales alcanzado: ${this.#config.maxChannelsPerFile}`);
          break;
        }
      }
    }

    return entries;
  }

  /**
   * Procesa las entradas crudas y las convierte a canales
   * @private
   * @param {Array<Object>} rawEntries 
   * @returns {Promise<Channel[]>}
   */
  async #processEntries(rawEntries) {
    const channels = [];
    const processedIds = new Set();

    for (const entry of rawEntries) {
      try {
        const channelData = await this.#parseEntry(entry);
        
        if (channelData) {
          // Evitar duplicados por ID
          if (processedIds.has(channelData.id)) {
            console.warn(`Canal duplicado ignorado: ${channelData.id}`);
            continue;
          }

          const channel = Channel.fromM3U(channelData);
          channels.push(channel);
          processedIds.add(channelData.id);
        }
      } catch (error) {
        if (this.#config.skipInvalidEntries) {
          console.warn(`Entrada inválida en línea ${entry.lineNumber}: ${error.message}`);
          continue;
        } else {
          throw new M3UParseError(
            `Error en línea ${entry.lineNumber}: ${error.message}`,
            error
          );
        }
      }
    }

    return channels;
  }

  /**
   * Parsea una entrada individual
   * @private
   * @param {Object} entry 
   * @returns {Promise<Object|null>}
   */
  async #parseEntry(entry) {
    const metadata = this.#extractMetadata(entry.extinf);
    
    if (!metadata.name || !entry.url) {
      if (this.#config.strictMode) {
        throw new Error('Nombre y URL son requeridos');
      }
      return null;
    }

    // Generar ID único
    const id = Channel.generateId(metadata.name, Channel.TYPES.TV);

    // Detectar calidad desde la URL
    const quality = this.#config.enableQualityDetection 
      ? StreamQuality.fromUrl(entry.url)
      : StreamQuality.fromString(this.#config.defaultQuality || 'Auto');

    return {
      id,
      name: metadata.name,
      logo: metadata.logo,
      url: entry.url,
      group: this.#normalizeGenre(metadata.group),
      country: this.#extractCountry(metadata),
      language: this.#extractLanguage(metadata),
      quality: quality.value,
      tvgId: metadata.tvgId,
      originalData: {
        extinf: entry.extinf,
        metadata
      }
    };
  }

  /**
   * Extrae metadatos de la línea EXTINF
   * @private
   * @param {string} extinf 
   * @returns {Object}
   */
  #extractMetadata(extinf) {
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
      extractAttribute(/(?:tvg-logo|logo)="([^"]*)"/i, value => metadata.logo = this.#validateLogoUrl(value));
      extractAttribute(/tvg-country="([^"]*)"/i, value => metadata.tvgCountry = value);
      extractAttribute(/tvg-language="([^"]*)"/i, value => metadata.tvgLanguage = value);
      extractAttribute(/group-title="([^"]*)"/i, value => metadata.group = value);

      const nameMatch = extinf.match(/,(.+)$/);
      metadata.name = nameMatch ? nameMatch[1].trim() : metadata.tvgName || 'Canal Desconocido';

    } catch (error) {
      console.warn(`Error extrayendo metadatos de: ${extinf}`);
      metadata.name = 'Canal Desconocido';
    }

    return metadata;
  }

  /**
   * Valida y normaliza URL de logo
   * @private
   * @param {string} logoUrl 
   * @returns {string|null}
   */
  #validateLogoUrl(logoUrl) {
    if (!this.#config.enableLogoExtraction || !logoUrl) {
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

  /**
   * Normaliza el género del canal
   * @private
   * @param {string} group 
   * @returns {string}
   */
  #normalizeGenre(group) {
    if (!group) return this.#config.defaultGenre;

    const genreMap = {
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
    };

    const normalizedGroup = group.toLowerCase().trim();
    
    return genreMap[normalizedGroup] || 
           Object.entries(genreMap).find(([key]) => 
             normalizedGroup.includes(key) || key.includes(normalizedGroup)
           )?.[1] || 
           (Object.values(Channel.GENRES).includes(group) ? group : this.#config.defaultGenre);
  }

  /**
   * Extrae el país del canal
   * @private
   * @param {Object} metadata 
   * @returns {string}
   */
  #extractCountry(metadata) {
    if (metadata.tvgCountry) {
      return this.#normalizeCountry(metadata.tvgCountry);
    }

    const countryPatterns = {
      'México': /mexico|mx|azteca|televisa|imagen/i,
      'España': /españa|spain|es|antena|tve|cuatro/i,
      'Argentina': /argentina|ar|telefe|canal.*13|tn/i,
      'Colombia': /colombia|co|caracol|rcn/i,
      'Chile': /chile|cl|mega|canal.*13.*cl/i,
      'Perú': /peru|pe|america.*tv|panamericana/i
    };

    const channelName = metadata.name?.toLowerCase() || '';
    
    return Object.entries(countryPatterns).find(([, pattern]) => 
      pattern.test(channelName)
    )?.[0] || this.#config.defaultCountry;
  }

  /**
   * Normaliza el nombre del país
   * @private
   * @param {string} country 
   * @returns {string}
   */
  #normalizeCountry(country) {
    const countryMap = {
      'mx': 'México',
      'es': 'España',
      'ar': 'Argentina',
      'co': 'Colombia',
      'cl': 'Chile',
      'pe': 'Perú',
      'us': 'Estados Unidos',
      'uk': 'Reino Unido'
    };

    const normalized = country.toLowerCase().trim();
    return countryMap[normalized] || country;
  }

  /**
   * Extrae el idioma del canal
   * @private
   * @param {Object} metadata 
   * @returns {string}
   */
  #extractLanguage(metadata) {
    if (metadata.tvgLanguage) {
      return this.#normalizeLanguage(metadata.tvgLanguage);
    }

    // Mapear país a idioma por defecto
    const countryLanguageMap = {
      'México': 'es',
      'España': 'es',
      'Argentina': 'es',
      'Colombia': 'es',
      'Chile': 'es',
      'Perú': 'es',
      'Estados Unidos': 'en',
      'Reino Unido': 'en'
    };

    const country = this.#extractCountry(metadata);
    return countryLanguageMap[country] || this.#config.defaultLanguage;
  }

  /**
   * Normaliza el código de idioma
   * @private
   * @param {string} language 
   * @returns {string}
   */
  #normalizeLanguage(language) {
    const languageMap = {
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
    };

    const normalized = language.toLowerCase().trim();
    return languageMap[normalized] || (normalized.length === 2 ? normalized : this.#config.defaultLanguage);
  }

  /**
   * Valida y filtra la lista final de canales
   * @private
   * @param {Channel[]} channels 
   * @returns {Channel[]}
   */
  #validateAndFilterChannels(channels) {
    const validChannels = channels.filter(channel => {
      try {
        // Verificar que el canal sea válido
        if (!channel.isValidStream()) {
          console.warn(`Canal con stream inválido ignorado: ${channel.name}`);
          return false;
        }

        return true;
      } catch (error) {
        console.warn(`Canal inválido ignorado: ${error.message}`);
        return false;
      }
    });

    console.log(`M3U parseado: ${validChannels.length} canales válidos de ${channels.length} totales`);
    
    return validChannels;
  }

  /**
   * Obtiene estadísticas del parsing
   * @param {string} content - Contenido M3U
   * @returns {Promise<Object>}
   */
  async getParseStats(content) {
    try {
      const lines = this.#preprocessContent(content);
      const rawEntries = this.#extractRawEntries(lines);
      const channels = await this.#processEntries(rawEntries);
      const validChannels = this.#validateAndFilterChannels(channels);

      // Estadísticas por género
      const genreStats = {};
      validChannels.forEach(channel => {
        genreStats[channel.genre] = (genreStats[channel.genre] || 0) + 1;
      });

      // Estadísticas por país
      const countryStats = {};
      validChannels.forEach(channel => {
        countryStats[channel.country] = (countryStats[channel.country] || 0) + 1;
      });

      return {
        totalLines: lines.length,
        totalEntries: rawEntries.length,
        validChannels: validChannels.length,
        invalidChannels: channels.length - validChannels.length,
        genreStats,
        countryStats,
        parseSuccess: true
      };
    } catch (error) {
      return {
        parseSuccess: false,
        error: error.message
      };
    }
  }
}

/**
 * Error específico del parser M3U
 */
export class M3UParseError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'M3UParseError';
    this.cause = cause;
    this.timestamp = new Date();
  }
}

export default M3UParserService;
