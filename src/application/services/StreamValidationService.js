/**
 * @fileoverview StreamValidationService - Servicio especializado en validación de streams.
 * Implementa Clean Architecture con Single Responsibility Principle.
 * 
 * Responsabilidades:
 * - Validación de argumentos de entrada
 * - Verificación de tipos soportados
 * - Detección de tipos de ID
 * - Extracción de season/episode
 * 
 * @author VeoVeo Development Team
 * @version 1.3.0
 */

import { createError, ERROR_TYPES, safeExecute } from '../../infrastructure/errors/ErrorHandler.js';

/**
 * Servicio de validación para streams de Stremio.
 * Maneja toda la lógica de validación de entrada y detección de tipos.
 */
export class StreamValidationService {
  #validationService;
  #idDetectorService;
  #logger;

  /**
   * @param {Object} validationService - Servicio de validación dinámica
   * @param {Object} idDetectorService - Servicio de detección de IDs
   * @param {Object} logger - Sistema de logging
   */
  constructor(validationService, idDetectorService, logger = console) {
    this.#validationService = validationService;
    this.#idDetectorService = idDetectorService;
    this.#logger = logger;
  }

  /**
   * Valida los argumentos de una petición de stream.
   * @param {Object} args - Argumentos de la petición
   * @param {string} args.type - Tipo de contenido
   * @param {string} args.id - ID del contenido
   * @returns {Promise<Object>} Resultado de validación con detalles
   * @throws {Error} Si la validación falla
   */
  async validateStreamRequest(args) {
    // Validación de entrada con early returns
    if (!args || typeof args !== 'object') {
      throw createError(
        'Argumentos de stream requeridos y deben ser objeto',
        ERROR_TYPES.VALIDATION,
        { args }
      );
    }

    if (!args.type || typeof args.type !== 'string') {
      throw createError(
        'Tipo de contenido requerido y debe ser string',
        ERROR_TYPES.VALIDATION,
        { type: args.type }
      );
    }

    if (!this.isSupportedType(args.type)) {
      throw createError(
        'Tipo de contenido debe ser movie, series, anime o tv',
        ERROR_TYPES.VALIDATION,
        { type: args.type, supportedTypes: ['movie', 'series', 'anime', 'tv'] }
      );
    }
    
    if (!args.id || typeof args.id !== 'string') {
      throw createError(
        'ID de contenido requerido y debe ser string',
        ERROR_TYPES.VALIDATION,
        { id: args.id }
      );
    }

    if (args.id.trim().length === 0) {
      throw createError(
        'ID de contenido no puede estar vacío',
        ERROR_TYPES.VALIDATION,
        { id: args.id }
      );
    }

    // Usar validación dinámica para verificar el ID
    const validationResult = await safeExecute(
      () => this.#validationService.validateId(
        args.id, 
        'stream_request'
      ),
      { 
        operation: 'validation.validateId',
        contentId: args.id,
        type: args.type
      }
    );
    
    if (validationResult.error) {
      throw createError(
        `Error en validación de stream request para ${args.id}`,
        ERROR_TYPES.VALIDATION,
        { 
          contentId: args.id,
          contentType: args.type,
          originalError: validationResult.error
        }
      );
    }
    
    if (!validationResult.isValid) {
      const errorMsg = validationResult.details?.error || 'ID de contenido inválido';
      this.#logger.warn(`Validación falló para ID ${args.id}: ${errorMsg}`);
      throw createError(
        `ID de contenido inválido: ${errorMsg}`,
        ERROR_TYPES.VALIDATION,
        { 
          contentId: args.id,
          validationDetails: validationResult.details
        }
      );
    }

    this.#logger.debug(`Validación exitosa para ID ${args.id}:`, {
      type: validationResult.details?.detection?.type,
      confidence: validationResult.details?.detection?.confidence
    });
    
    return validationResult;
  }

  /**
   * Verifica si el tipo es soportado.
   * @param {string} type - Tipo de contenido
   * @returns {boolean} True si es soportado
   */
  isSupportedType(type) {
    return ['movie', 'series', 'anime', 'tv'].includes(type);
  }

  /**
   * Detecta el tipo de ID de contenido usando el servicio especializado.
   * @param {string} contentId - ID del contenido
   * @returns {Object} Resultado de detección con tipo y metadatos
   */
  detectContentIdType(contentId) {
    if (!contentId) {
      return { type: 'unknown', isValid: false, error: 'ID vacío' };
    }
    
    try {
      const detection = this.#idDetectorService.detectIdType(contentId);
      this.#logger.debug(`ID detectado: ${contentId} -> ${detection.type} (válido: ${detection.isValid})`);
      return detection;
    } catch (error) {
      this.#logger.error(`Error detectando tipo de ID para ${contentId}: ${error.message}`);
      return { type: 'unknown', isValid: false, error: error.message };
    }
  }

  /**
   * Extrae season y episode del contentId si están presentes.
   * @param {string} contentId - ID de contenido (ej: kitsu:6448:11, tt1234567:1:5)
   * @returns {Object} Objeto con season y episode extraídos
   */
  extractSeasonEpisode(contentId) {
    if (!contentId || typeof contentId !== 'string') {
      return { season: undefined, episode: undefined };
    }
    
    // Dividir por ':' para extraer partes
    const parts = contentId.split(':');
    
    // Solo extraer season/episode si hay más de 2 partes Y las últimas dos son números
    // Esto evita interpretar IDs como 'kitsu:6448' como season:episode
    if (parts.length > 2) {
      const seasonPart = parts[parts.length - 2]; // Penúltima parte
      const episodePart = parts[parts.length - 1]; // Última parte
      
      // Validar que ambas sean números válidos para confirmar que son season/episode
      const seasonIsNumber = /^\d+$/.test(seasonPart);
      const episodeIsNumber = /^\d+$/.test(episodePart);
      
      if (seasonIsNumber && episodeIsNumber) {
        // Verificar que no sea un ID base (como kitsu:6448)
        // Si solo hay 2 partes numéricas, probablemente es un ID, no season/episode
        if (parts.length === 2) {
          return { season: undefined, episode: undefined };
        }
        
        const season = parseInt(seasonPart, 10);
        const episode = parseInt(episodePart, 10);
        
        return { season, episode };
      }
    }
    
    return { season: undefined, episode: undefined };
  }
}

export default StreamValidationService;