/**
 * @fileoverview CatalogHandler - Manejador de catálogos para Stremio
 * Responsabilidad única: gestión de catálogos de canales desde tv.csv
 */

import { CSVChannelRepository } from '../../infrastructure/repositories/CSVChannelRepository.js';
import { TVAddonConfig } from '../../infrastructure/config/TVAddonConfig.js';
import { ErrorHandler } from '../../infrastructure/error/ErrorHandler.js';

/**
 * Manejador de catálogos para Stremio
 * Utiliza tv.csv como fuente de datos para generar catálogos organizados
 */
export class CatalogHandler {
  /**
   * @private
   */
  #csvRepository;
  #config;
  #logger;
  #errorHandler;

  /**
   * @param {CSVChannelRepository} csvRepository - Repositorio de canales CSV
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(csvRepository, config, logger = console) {
    this.#csvRepository = csvRepository;
    this.#config = config;
    this.#logger = logger;
    this.#errorHandler = new ErrorHandler(logger, config);
  }

  /**
   * Maneja solicitudes de catálogo desde Stremio
   * @param {Object} args - Argumentos de la solicitud
   * @param {string} args.type - Tipo de contenido (tv)
   * @param {string} args.id - ID del catálogo
   * @param {Object} args.extra - Parámetros adicionales (skip, genre, search)
   * @returns {Promise<Object>} Respuesta del catálogo
   */
  async handleCatalogRequest(args) {
    try {
      const { type, id, extra = {} } = args;
      
      // Validar tipo de contenido
      if (type !== 'tv') {
        return { metas: [] };
      }

      // Obtener todos los canales desde tv.csv
      const allChannels = await this.#csvRepository.getAllChannels();
      
      if (!allChannels || allChannels.length === 0) {
        this.#logger.warn('No hay canales en tv.csv');
        return { metas: [] };
      }

      // Filtrar canales según el catálogo solicitado
      let filteredChannels = this.#filterChannelsByCatalog(allChannels, id, extra);
      
      // Aplicar búsqueda si se proporciona
      if (extra.search) {
        filteredChannels = this.#searchChannels(filteredChannels, extra.search);
      }

      // Aplicar paginación
      const { channels: paginatedChannels, hasMore } = this.#paginateChannels(
        filteredChannels, 
        parseInt(extra.skip) || 0
      );

      // Convertir canales a formato meta de Stremio
      const metas = paginatedChannels.map(channel => channel.toMetaPreview());

      this.#logger.info(`Catálogo '${id}': ${metas.length} de ${filteredChannels.length}`);
      
      return {
        metas,
        ...(hasMore && { hasMore: true })
      };

    } catch (error) {
      this.#logger.error('Error de catálogo:', error);
      return this.#errorHandler.handleError(error, 'catalog');
    }
  }

  /**
   * Filtra canales según el catálogo solicitado
   * @private
   * @param {Array} channels - Lista de canales
   * @param {string} catalogId - ID del catálogo
   * @param {Object} extra - Parámetros adicionales
   * @returns {Array} Canales filtrados
   */
  #filterChannelsByCatalog(channels, catalogId, extra) {
    switch (catalogId) {
      case 'tv_all':
        return channels;
        
      case 'tv_peru':
        return channels.filter(channel => 
          channel.country && channel.country.toLowerCase().includes('peru')
        );
        
      case 'tv_hd':
        return channels.filter(channel => 
          channel.quality && channel.quality.toLowerCase().includes('hd')
        );
        
      case 'tv_news':
        return channels.filter(channel => 
          this.#isNewsChannel(channel)
        );
        
      case 'tv_sports':
        return channels.filter(channel => 
          this.#isSportsChannel(channel)
        );
        
      case 'tv_entertainment':
        return channels.filter(channel => 
          this.#isEntertainmentChannel(channel)
        );
        
      case 'tv_by_genre':
        if (extra.genre) {
          return channels.filter(channel => 
            channel.genre && channel.genre.toLowerCase().includes(extra.genre.toLowerCase())
          );
        }
        return channels;
        
      default:
        return channels;
    }
  }

  /**
   * Busca canales por nombre
   * @private
   * @param {Array} channels - Lista de canales
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Array} Canales que coinciden con la búsqueda
   */
  #searchChannels(channels, searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return channels;

    return channels.filter(channel => 
      channel.name.toLowerCase().includes(term) ||
      (channel.genre && channel.genre.toLowerCase().includes(term)) ||
      (channel.country && channel.country.toLowerCase().includes(term))
    );
  }

  /**
   * Aplica paginación a los canales
   * @private
   * @param {Array} channels - Lista de canales
   * @param {number} skip - Número de elementos a omitir
   * @returns {Object} Objeto con canales paginados y flag hasMore
   */
  #paginateChannels(channels, skip = 0) {
    const pageSize = 100; // Tamaño de página estándar para Stremio
    const startIndex = Math.max(0, skip);
    const endIndex = startIndex + pageSize;
    
    const paginatedChannels = channels.slice(startIndex, endIndex);
    const hasMore = endIndex < channels.length;
    
    return {
      channels: paginatedChannels,
      hasMore
    };
  }

  /**
   * Determina si un canal es de noticias
   * @private
   * @param {Channel} channel - Canal a evaluar
   * @returns {boolean}
   */
  #isNewsChannel(channel) {
    const newsKeywords = ['news', 'noticias', 'informativo', 'cnn', 'bbc', 'rpp'];
    const name = channel.name.toLowerCase();
    const genre = (channel.genre || '').toLowerCase();
    
    return newsKeywords.some(keyword => 
      name.includes(keyword) || genre.includes(keyword)
    );
  }

  /**
   * Determina si un canal es deportivo
   * @private
   * @param {Channel} channel - Canal a evaluar
   * @returns {boolean}
   */
  #isSportsChannel(channel) {
    const sportsKeywords = ['sport', 'deportes', 'espn', 'fox sports', 'gol', 'futbol', 'football'];
    const name = channel.name.toLowerCase();
    const genre = (channel.genre || '').toLowerCase();
    
    return sportsKeywords.some(keyword => 
      name.includes(keyword) || genre.includes(keyword)
    );
  }

  /**
   * Determina si un canal es de entretenimiento
   * @private
   * @param {Channel} channel - Canal a evaluar
   * @returns {boolean}
   */
  #isEntertainmentChannel(channel) {
    const entertainmentKeywords = ['entretenimiento', 'entertainment', 'variety', 'comedy', 'drama'];
    const name = channel.name.toLowerCase();
    const genre = (channel.genre || '').toLowerCase();
    
    return entertainmentKeywords.some(keyword => 
      name.includes(keyword) || genre.includes(keyword)
    ) && !this.#isNewsChannel(channel) && !this.#isSportsChannel(channel);
  }

  /**
   * Obtiene estadísticas del catálogo
   * @returns {Promise<Object>} Estadísticas de canales disponibles
   */
  async getCatalogStats() {
    try {
      const allChannels = await this.#csvRepository.getAllChannels();
      
      return {
        total: allChannels.length,
        byCountry: this.#groupByCountry(allChannels),
        byGenre: this.#groupByGenre(allChannels),
        byQuality: this.#groupByQuality(allChannels)
      };
    } catch (error) {
      this.#logger.error('Error de estadísticas:', error);
      return {
        total: 0,
        byCountry: {},
        byGenre: {},
        byQuality: {}
      };
    }
  }

  /**
   * Agrupa canales por país
   * @private
   * @param {Array} channels - Lista de canales
   * @returns {Object} Canales agrupados por país
   */
  #groupByCountry(channels) {
    return channels.reduce((acc, channel) => {
      const country = channel.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Agrupa canales por género
   * @private
   * @param {Array} channels - Lista de canales
   * @returns {Object} Canales agrupados por género
   */
  #groupByGenre(channels) {
    return channels.reduce((acc, channel) => {
      const genre = channel.genre || 'Unknown';
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Agrupa canales por calidad
   * @private
   * @param {Array} channels - Lista de canales
   * @returns {Object} Canales agrupados por calidad
   */
  #groupByQuality(channels) {
    return channels.reduce((acc, channel) => {
      const quality = channel.quality || 'Unknown';
      acc[quality] = (acc[quality] || 0) + 1;
      return acc;
    }, {});
  }
}

export default CatalogHandler;