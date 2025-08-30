import Kitsu from 'kitsu';
import { addonConfig } from '../../config/addonConfig.js';
import { kitsuMappingFallback } from './KitsuMappingFallback.js';

/**
 * Servicio para integración con la API de Kitsu
 * Proporciona mapeo de IDs y metadatos de anime
 */
export class KitsuApiService {
  constructor() {
    this.api = new Kitsu({
      baseURL: 'https://kitsu.io/api/edge'
    });
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 horas
  }

  /**
   * Obtiene metadatos de anime por ID de Kitsu
   * @param {string} kitsuId - ID de Kitsu (formato: kitsu:12345)
   * @returns {Promise<Object|null>} Metadatos del anime o null si no se encuentra
   */
  async getAnimeMetadata(kitsuId) {
    try {
      const numericId = this.#extractNumericId(kitsuId);
      if (!numericId) return null;

      const cacheKey = `anime_${numericId}`;
      const cached = this.#getCachedData(cacheKey);
      if (cached) return cached;

      const response = await this.api.get(`anime/${numericId}`, {
        params: {
          include: 'mappings,categories'
        }
      });

      if (!response?.data) return null;

      const metadata = this.#processAnimeMetadata(response.data);
      this.#setCachedData(cacheKey, metadata);
      
      return metadata;
    } catch (error) {
      console.warn(`Error obteniendo metadatos de Kitsu para ${kitsuId}:`, error.message);
      return null;
    }
  }

  /**
   * Busca anime por título
   * @param {string} title - Título del anime
   * @returns {Promise<Array>} Lista de resultados de búsqueda
   */
  async searchAnimeByTitle(title) {
    try {
      const cacheKey = `search_${title.toLowerCase()}`;
      const cached = this.#getCachedData(cacheKey);
      if (cached) return cached;

      const response = await this.api.get('anime', {
        params: {
          filter: {
            text: title
          },
          page: {
            limit: 10
          },
          include: 'mappings'
        }
      });

      if (!response?.data) return [];

      const results = response.data.map(anime => this.#processAnimeMetadata(anime));
      this.#setCachedData(cacheKey, results);
      
      return results;
    } catch (error) {
      console.warn(`Error buscando anime por título "${title}":`, error.message);
      return [];
    }
  }

  /**
   * Obtiene mapeo de ID externo (IMDb, MAL, AniList, AniDB) a Kitsu ID
   * @param {string} externalId - ID externo (ej: tt1234567, 12345, etc.)
   * @param {string} externalSite - Sitio externo (imdb, myanimelist, anilist, anidb)
   * @returns {Promise<string|null>} Kitsu ID o null si no se encuentra
   */
  async getKitsuIdFromExternal(externalId, externalSite = 'imdb') {
    try {
      const cacheKey = `mapping_${externalSite}_${externalId}`;
      const cached = this.#getCachedData(cacheKey);
      if (cached) return cached;

      // Normalizar ID según el tipo de servicio
      let normalizedId = externalId;
      if (externalSite === 'imdb') {
        normalizedId = externalId.replace('tt', ''); // Remover prefijo tt para IMDb
      }

      const response = await this.api.get('mappings', {
        params: {
          filter: {
            externalSite,
            externalId: normalizedId
          },
          include: 'item'
        }
      });

      if (!response?.data?.length) return null;

      const mapping = response.data[0];
      const kitsuId = mapping.item?.data?.id;
      
      if (kitsuId) {
        const formattedId = `kitsu:${kitsuId}`;
        this.#setCachedData(cacheKey, formattedId);
        return formattedId;
      }

      return null;
    } catch (error) {
      console.warn(`Error obteniendo mapeo de ${externalSite} ${externalId}:`, error.message);
      return null;
    }
  }

  /**
   * Obtiene ID de IMDb desde Kitsu ID
   * @param {string} kitsuId - ID de Kitsu (formato: kitsu:12345)
   * @returns {Promise<string|null>} IMDb ID o null si no se encuentra
   */
  async getImdbIdFromKitsu(kitsuId) {
    try {
      const numericId = this.#extractNumericId(kitsuId);
      if (!numericId) {
        console.warn(`ID de Kitsu inválido: ${kitsuId}`);
        return null;
      }

      const cacheKey = `imdb_${numericId}`;
      const cached = this.#getCachedData(cacheKey);
      if (cached) {
        console.info(`Mapeo IMDb encontrado en cache para ${kitsuId}: ${cached}`);
        return cached;
      }

      console.info(`Consultando API de Kitsu para mapeo IMDb de ${kitsuId} (ID numérico: ${numericId})`);
      const response = await this.api.get(`anime/${numericId}/mappings`, {
        params: {
          filter: {
            externalSite: 'imdb'
          }
        }
      });

      console.info(`Respuesta de API Kitsu para ${kitsuId}:`, {
        hasData: !!response?.data,
        dataLength: response?.data?.length || 0,
        data: response?.data
      });

      if (!response?.data?.length) {
        console.warn(`No se encontraron mapeos IMDb para ${kitsuId} en la API de Kitsu`);
        
        // Intentar mapeo manual de respaldo
        const fallbackImdbId = kitsuMappingFallback.getImdbIdFromKitsu(numericId);
        if (fallbackImdbId) {
          console.info(`✅ Usando mapeo manual de respaldo: ${kitsuId} → ${fallbackImdbId}`);
          this.#setCachedData(cacheKey, fallbackImdbId);
          return fallbackImdbId;
        }
        
        return null;
      }

      const mapping = response.data[0];
      const imdbId = mapping.externalId ? `tt${mapping.externalId}` : null;
      
      if (imdbId) {
        console.info(`Mapeo exitoso: ${kitsuId} → ${imdbId}`);
        this.#setCachedData(cacheKey, imdbId);
      } else {
        console.warn(`Mapeo encontrado pero sin externalId válido para ${kitsuId}:`, mapping);
      }

      return imdbId;
    } catch (error) {
      console.error(`Error obteniendo IMDb ID para ${kitsuId}:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      return null;
    }
  }

  /**
   * Valida si un ID tiene formato de Kitsu
   * @param {string} id - ID a validar
   * @returns {boolean} True si es formato Kitsu válido
   */
  isKitsuId(id) {
    return typeof id === 'string' && id.startsWith('kitsu:') && /^kitsu:\d+$/.test(id);
  }

  /**
   * Extrae el ID numérico de un Kitsu ID
   * @param {string} kitsuId - ID de Kitsu (formato: kitsu:12345)
   * @returns {string|null} ID numérico o null si formato inválido
   * @private
   */
  #extractNumericId(kitsuId) {
    if (!this.isKitsuId(kitsuId)) return null;
    return kitsuId.replace('kitsu:', '');
  }

  /**
   * Procesa metadatos de anime desde respuesta de API
   * @param {Object} animeData - Datos de anime desde API
   * @returns {Object} Metadatos procesados
   * @private
   */
  #processAnimeMetadata(animeData) {
    const { id, attributes = {}, mappings = {} } = animeData;
    
    return {
      kitsuId: `kitsu:${id}`,
      title: attributes.canonicalTitle || attributes.titles?.en || 'Título desconocido',
      alternativeTitles: {
        en: attributes.titles?.en,
        ja: attributes.titles?.ja_jp,
        romaji: attributes.titles?.en_jp
      },
      synopsis: attributes.synopsis,
      episodeCount: attributes.episodeCount,
      episodeLength: attributes.episodeLength,
      status: attributes.status,
      startDate: attributes.startDate,
      endDate: attributes.endDate,
      ageRating: attributes.ageRating,
      subtype: attributes.subtype, // TV, OVA, ONA, Movie, etc.
      posterImage: attributes.posterImage?.large || attributes.posterImage?.medium,
      coverImage: attributes.coverImage?.large || attributes.coverImage?.original,
      averageRating: attributes.averageRating,
      mappings: this.#extractMappings(mappings)
    };
  }

  /**
   * Extrae mapeos de IDs externos
   * @param {Object} mappings - Datos de mapeos desde API
   * @returns {Object} Mapeos organizados por sitio
   * @private
   */
  #extractMappings(mappings) {
    const result = {};
    
    if (mappings?.data && Array.isArray(mappings.data)) {
      mappings.data.forEach(mapping => {
        const { externalSite, externalId } = mapping.attributes || {};
        if (externalSite && externalId) {
          result[externalSite] = externalSite === 'imdb' ? `tt${externalId}` : externalId;
        }
      });
    }
    
    return result;
  }

  /**
   * Obtiene datos del cache
   * @param {string} key - Clave del cache
   * @returns {*} Datos cacheados o null si expiró
   * @private
   */
  #getCachedData(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Guarda datos en cache
   * @param {string} key - Clave del cache
   * @param {*} data - Datos a cachear
   * @private
   */
  #setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Limpia el cache expirado
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Instancia singleton
export const kitsuApiService = new KitsuApiService();