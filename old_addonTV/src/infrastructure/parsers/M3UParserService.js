/**
 * @fileoverview M3UParserService - Servicio para parsear archivos M3U/M3U8
 * Implementa el patrón Strategy para diferentes tipos de parsing
 * Refactorizado siguiendo principios SOLID con separación de responsabilidades
 */

import { Channel } from '../../domain/entities/Channel.js';
import { ValidationError, AddonError } from '../error/ErrorHandler.js';
import {
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
} from './M3UParserService_tools.js';

/**
 * Servicio para parsear archivos M3U/M3U8
 * Responsabilidad única: conversión de formato M3U a entidades Channel
 */
export class M3UParserService {
  /**
   * Configuración por defecto del parser
   */
  static DEFAULT_CONFIG = {
    strictMode: false,
    maxChannels: 20000,
    enableQualityDetection: true,
    enableLogoExtraction: true,
    defaultGenre: Channel.GENRES.GENERAL,
    defaultCountry: 'Internacional',
    defaultLanguage: 'es',
    defaultQuality: 'Auto'
  };
  /**
   * Constructor del servicio
   * @param {Object} config - Configuración del parser (opcional, se usa DEFAULT_CONFIG)
   */
  constructor(config = {}) {
    // El servicio es stateless, la configuración se pasa en cada llamada a parse()
    // Este constructor se mantiene por compatibilidad
  }

  /**
   * Parsea contenido M3U y retorna lista de canales
   * @param {string} content - Contenido del archivo M3U
   * @param {Object} options - Opciones de configuración
   * @returns {Promise<Object>} Resultado del parsing con canales y estadísticas
   * @throws {ParsingError} Si hay errores en el parsing
   * @throws {ValidationError} Si la validación falla
   */
  async parse(content, options = {}) {
    const config = { ...M3UParserService.DEFAULT_CONFIG, ...options };
    const startTime = Date.now();
    
    try {
      // Validar entrada usando herramientas auxiliares
      this._validateInput(content, config);
      
      // Preprocesar contenido
      const lines = ContentPreprocessor.normalizeLines(content);
      
      // Extraer entradas
      const rawEntries = EntryProcessor.extractRawEntries(lines, config.maxChannels);
      
      // Procesar entradas en paralelo
      const results = await this._processEntriesInParallel(rawEntries, config);
      
      // Generar estadísticas
      const stats = this._generateStats(results, startTime);
      
      return {
        channels: results.validChannels,
        stats,
        errors: results.errors
      };
      
    } catch (error) {
      throw this._handleParsingError(error);
    }
  }

  /**
   * Valida la entrada del parser
   * @private
   */
  _validateInput(content, config) {
    try {
      ContentPreprocessor.validateM3UFormat(content, config.strictMode);
    } catch (error) {
      throw new ValidationError(error.message);
    }
  }

  /**
   * Procesa entradas en paralelo
   * @private
   */
  async _processEntriesInParallel(rawEntries, config) {
    const batchSize = 100;
    const validChannels = [];
    const errors = [];
    
    for (let i = 0; i < rawEntries.length; i += batchSize) {
      const batch = rawEntries.slice(i, i + batchSize);
      const batchPromises = batch.map(entry => this._processEntry(entry, config));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          if (result.value.error) {
            errors.push(result.value.error);
          } else {
            validChannels.push(result.value);
          }
        } else if (result.status === 'rejected') {
          errors.push({
            line: batch[index].lineNumber,
            error: result.reason.message,
            category: ErrorCategorizer.categorize(result.reason.message)
          });
        }
      });
    }
    
    return { validChannels, errors };
  }

  /**
   * Procesa una entrada individual
   * @private
   */
  async _processEntry(entry, config) {
    try {
      const channelData = EntryProcessor.createChannelData(entry, config);
      if (!channelData) return null;
      
      const channel = new Channel(channelData);
      return channel;
      
    } catch (error) {
      const errorInfo = {
        line: entry.lineNumber,
        extinf: entry.extinf,
        url: entry.url,
        error: error.message,
        category: ErrorCategorizer.categorize(error.message)
      };
      
      if (config.strictMode) {
         throw new AddonError(`Error en línea ${entry.lineNumber}: ${error.message}`, 'PARSING_ERROR', 400);
       }
      
      return { error: errorInfo };
    }
  }

  /**
   * Genera estadísticas del parsing
   * @private
   */
  _generateStats(results, startTime) {
    return StatsCalculator.calculate({
      validChannels: results.validChannels,
      errors: results.errors,
      processingTime: Date.now() - startTime
    });
  }

  /**
   * Maneja errores de parsing
   * @private
   */
  _handleParsingError(error) {
     if (error instanceof AddonError || error instanceof ValidationError) {
       return error;
     }
     return new AddonError(`Error al parsear M3U: ${error.message}`, 'PARSING_ERROR', 500);
   }

  /**
   * Método de compatibilidad con la API anterior
   * @deprecated Usar parse() en su lugar
   */
  async parseM3U(content) {
    const result = await this.parse(content);
    return result.channels;
  }

  /**
   * Obtiene estadísticas del parsing
   * @param {string} content - Contenido M3U
   * @returns {Promise<Object>}
   */
  async getParseStats(content) {
    try {
      const result = await this.parse(content);
      return {
        ...result.stats,
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



export default M3UParserService;
