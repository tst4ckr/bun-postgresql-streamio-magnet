import {
  createPatterns,
  matchesPatterns,
  extractChannelText,
  checkReligiousContent,
  containsAdultContent,
  containsPoliticalContent,
  countRemovedByCategory,
  calculateFilterStats,
  getDefaultReligiousPatterns,
  getDefaultAdultPatterns,
  getDefaultPoliticalPatterns,
  validateFilterConfig,
  hasActiveFilters,
  createFilterConfiguration
} from './ContentFilterService_tools.js';

/**
 * @fileoverview Servicio para filtrar contenido de canales de TV
 * Refactorizado siguiendo principios SOLID y separación de responsabilidades
 * 
 * @description
 * Responsabilidades principales:
 * - Gestión de configuración de filtros (Single Responsibility)
 * - Orquestación del proceso de filtrado (Open/Closed)
 * - Coordinación entre filtros específicos (Dependency Inversion)
 * - Generación de estadísticas de filtrado
 * 
 * Las funciones auxiliares y herramientas están separadas en ContentFilterService_tools.js
 * siguiendo el principio de separación de responsabilidades.
 * 
 * @author Sistema de Filtrado de Contenido
 * @version 2.0.0
 * @since 1.0.0
 */
/**
 * @typedef {Object} FilterConfig
 * @property {boolean} [filterReligiousContent=false] - Filtrar contenido religioso
 * @property {boolean} [filterAdultContent=false] - Filtrar contenido adulto
 * @property {boolean} [filterPoliticalContent=false] - Filtrar contenido político
 * @property {string[]} [religiousKeywords=[]] - Palabras clave religiosas personalizadas
 * @property {string[]} [adultKeywords=[]] - Palabras clave adultas personalizadas
 * @property {string[]} [politicalKeywords=[]] - Palabras clave políticas personalizadas
 */

/**
 * @typedef {Object} Channel
 * @property {string} [id] - Identificador único del canal
 * @property {string} [name] - Nombre del canal
 * @property {string} [title] - Título del canal
 * @property {string} [description] - Descripción del canal
 * @property {string} [category] - Categoría del canal
 * @property {string} [group] - Grupo del canal
 * @property {string[]} [genres] - Géneros del canal
 * @property {string} [url] - URL del canal
 * @property {string} [stream] - URL de stream del canal
 */

/**
 * @typedef {Object} FilterStats
 * @property {number} total - Total de canales originales
 * @property {number} filtered - Canales después del filtrado
 * @property {number} removed - Canales removidos
 * @property {Object} removedByCategory - Canales removidos por categoría
 * @property {number} removedByCategory.religious - Canales religiosos removidos
 * @property {number} removedByCategory.adult - Canales adultos removidos
 * @property {number} removedByCategory.political - Canales políticos removidos
 * @property {FilterConfig} filterConfig - Configuración de filtros utilizada
 */

class ContentFilterService {
  /** @type {FilterConfig} */
  #filterConfig;
  
  /** @type {RegExp[]} */
  #religiousPatterns = [];
  
  /** @type {RegExp[]} */
  #adultPatterns = [];
  
  /** @type {RegExp[]} */
  #politicalPatterns = [];

  /**
   * Crea una nueva instancia del servicio de filtrado de contenido
   * @param {FilterConfig} filterConfig - Configuración de filtros desde TVAddonConfig
   * @throws {Error} Si la configuración es inválida
   */
  constructor(filterConfig) {
    try {
      this.#filterConfig = validateFilterConfig(filterConfig);
      this.#initializeFilters();
    } catch (error) {
      throw new Error(`Error al inicializar ContentFilterService: ${error.message}`);
    }
  }

  /**
   * Inicializa los patrones de filtrado
   * @private
   */
  #initializeFilters() {
    try {
      // Combinar patrones predefinidos con los configurados
      const defaultReligious = getDefaultReligiousPatterns();
      const customReligious = createPatterns(this.#filterConfig.religiousKeywords);
      this.#religiousPatterns = [...defaultReligious, ...customReligious];
      
      const defaultAdult = getDefaultAdultPatterns();
      const customAdult = createPatterns(this.#filterConfig.adultKeywords);
      this.#adultPatterns = [...defaultAdult, ...customAdult];
      
      const defaultPolitical = getDefaultPoliticalPatterns();
      const customPolitical = createPatterns(this.#filterConfig.politicalKeywords);
      this.#politicalPatterns = [...defaultPolitical, ...customPolitical];
    } catch (error) {
      throw new Error(`Error al inicializar patrones de filtrado: ${error.message}`);
    }
  }



  /**
   * Filtra un array de canales según los filtros configurados
   * Aplica el principio de responsabilidad única: solo orquesta el filtrado
   * @param {Channel[]} channels - Array de canales a filtrar
   * @returns {Channel[]} Array de canales filtrados
   * @throws {Error} Si los canales no son un array válido o ocurre un error durante el filtrado
   * @example
   * const service = new ContentFilterService({ filterReligiousContent: true });
   * const filtered = service.filterChannels(channels);
   */
  filterChannels(channels) {
    if (!Array.isArray(channels)) {
      throw new Error('Los canales deben ser un array válido');
    }

    try {
      return channels.filter(channel => this.#shouldKeepChannel(channel));
    } catch (error) {
      throw new Error(`Error al filtrar canales: ${error.message}`);
    }
  }

  /**
   * Determina si un canal debe mantenerse según los filtros
   * Implementa el patrón Strategy para diferentes tipos de filtros
   * @private
   * @param {Channel} channel - Canal a evaluar
   * @returns {boolean} true si el canal debe mantenerse, false si debe ser filtrado
   * @throws {Error} Si ocurre un error durante la evaluación (se registra y retorna true por seguridad)
   */
  #shouldKeepChannel(channel) {
    if (!channel) return false;

    try {
      // Obtener texto combinado del canal para análisis
      const channelText = extractChannelText(channel);
      
      // Verificar contenido religioso con lógica mejorada
      if (this.#filterConfig.filterReligiousContent) {
        const religiousResult = checkReligiousContent(channel, channelText, this.#religiousPatterns);
        if (religiousResult.isReligious) {
          return false;
        }
      }

      if (this.#filterConfig.filterAdultContent && containsAdultContent(channel, channelText, this.#adultPatterns)) {
        return false;
      }

      if (this.#filterConfig.filterPoliticalContent && containsPoliticalContent(channel, channelText, this.#politicalPatterns)) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`Error al evaluar canal ${channel?.name || 'desconocido'}:`, error.message);
      return true; // En caso de error, mantener el canal por seguridad
    }
  }







  /**
   * Obtiene estadísticas detalladas de filtrado
   * Delega el cálculo a funciones auxiliares siguiendo el principio de responsabilidad única
   * @param {Channel[]} originalChannels - Canales originales antes del filtrado
   * @param {Channel[]} filteredChannels - Canales después del filtrado
   * @returns {FilterStats} Estadísticas detalladas de filtrado
   * @throws {Error} Si los parámetros no son arrays válidos o ocurre un error en el cálculo
   * @example
   * const stats = service.getFilterStats(originalChannels, filteredChannels);
   * console.log(`Removidos: ${stats.removed} de ${stats.total}`);
   */
  getFilterStats(originalChannels, filteredChannels) {
    if (!Array.isArray(originalChannels) || !Array.isArray(filteredChannels)) {
      throw new Error('Los parámetros deben ser arrays válidos');
    }

    try {
      // Calcular estadísticas por categoría
      const patterns = {
        religious: this.#religiousPatterns,
        adult: this.#adultPatterns,
        political: this.#politicalPatterns
      };
      
      const removedByCategory = countRemovedByCategory(
        originalChannels, 
        filteredChannels, 
        patterns
      );
      
      const filtersActive = {
        religious: this.#filterConfig.filterReligiousContent,
        adult: this.#filterConfig.filterAdultContent,
        political: this.#filterConfig.filterPoliticalContent
      };

      return calculateFilterStats(
        originalChannels.length,
        filteredChannels.length,
        removedByCategory,
        filtersActive
      );
    } catch (error) {
      throw new Error(`Error al calcular estadísticas: ${error.message}`);
    }
  }



  /**
   * Verifica si hay filtros activos
   * Implementa el principio de consulta sin efectos secundarios
   * @returns {boolean} true si al menos un filtro está activo, false en caso contrario
   * @example
   * if (service.hasActiveFilters()) {
   *   console.log('Filtros activos detectados');
   * }
   */
  hasActiveFilters() {
    return hasActiveFilters(this.#filterConfig);
  }

  /**
   * Obtiene la configuración actual de filtros
   * Retorna una representación inmutable de la configuración
   * @returns {FilterConfig} Configuración actual de filtros (copia inmutable)
   * @example
   * const config = service.getFilterConfiguration();
   * console.log('Filtro religioso:', config.filterReligiousContent);
   */
  getFilterConfiguration() {
    return createFilterConfiguration(this.#filterConfig);
  }
}

export default ContentFilterService;