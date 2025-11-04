/**
 * StreamHandler - Refactorizado para usar servicios especializados
 * 
 * Este handler ha sido refactorizado para separar responsabilidades en servicios especializados:
 * - StreamValidationService: Validación de entrada y detección de tipos
 * - StreamProcessingService: Procesamiento de magnets y creación de streams
 * - StreamCacheService: Gestión de caché y respuestas
 * - StreamMetricsService: Métricas, logging y monitoreo
 * 
 * @author VeoVeo Team
 * @version 2.0.0 - Refactorizado con arquitectura de servicios
 */

import { createError, ERROR_TYPES } from '../../infrastructure/errors/ErrorHandler.js';

/**
 * Handler principal para peticiones de streams de Stremio.
 * Orquesta el flujo de trabajo usando servicios especializados.
 */
export class StreamHandler {
  #streamValidationService;
  #streamProcessingService;
  #streamCacheService;
  #streamMetricsService;
  #logger;
  #config;

  /**
   * Constructor con inyección de dependencias de servicios especializados.
   * @param {StreamValidationService} streamValidationService - Servicio de validación
   * @param {StreamProcessingService} streamProcessingService - Servicio de procesamiento
   * @param {StreamCacheService} streamCacheService - Servicio de caché
   * @param {StreamMetricsService} streamMetricsService - Servicio de métricas
   * @param {Object} logger - Logger para registro de eventos
   * @param {Object} config - Configuración del sistema
   */
  constructor(
    streamValidationService,
    streamProcessingService,
    streamCacheService,
    streamMetricsService,
    logger = console,
    config = {}
  ) {
    this.#streamValidationService = streamValidationService;
    this.#streamProcessingService = streamProcessingService;
    this.#streamCacheService = streamCacheService;
    this.#streamMetricsService = streamMetricsService;
    this.#logger = logger;
    this.#config = config;
  }

  /**
   * Crea el handler de addon para Stremio.
   * @returns {Function} Handler de addon configurado.
   */
  createAddonHandler() {
    return async (args) => {
      try {
        this.#logger.debug(`Stream request recibida: ${JSON.stringify(args)}`);
        
        const result = await this.#handleStreamRequest(args);
        
        this.#logger.debug(`Stream response: ${result.streams?.length || 0} streams encontrados`);
        return result;
        
      } catch (error) {
        this.#logger.error(`Error en createAddonHandler: ${error.message}`);
        return this.#streamCacheService.createErrorResponse(error, args?.type);
      }
    };
  }

  /**
   * Maneja la petición de stream orquestando los servicios especializados.
   * @private
   * @param {Object} args - Argumentos de la petición (type, id)
   * @returns {Promise<Object>} Respuesta de streams
   */
  async #handleStreamRequest(args) {
    const startTime = Date.now();
    
    try {
      // 1. Iniciar métricas
      await this.#streamMetricsService.logStreamRequestStart(args);
      
      // 2. Validar petición
      const validation = await this.#streamValidationService.validateStreamRequest(args);
      if (!validation.isValid) {
        await this.#streamMetricsService.logValidationError(validation.error);
        throw createError(validation.error, ERROR_TYPES.VALIDATION);
      }

      const { type, id: contentId } = args;
      
      // 3. Detectar tipo de ID
      const idDetection = await this.#streamValidationService.detectContentIdType(contentId);
      await this.#streamMetricsService.logIdDetection(contentId, idDetection);
      
      // 4. Obtener magnets
      const magnets = await this.#streamProcessingService.getMagnets(contentId, type);
      await this.#streamMetricsService.logMagnetSearch(contentId, magnets.length);
      
      if (!magnets || magnets.length === 0) {
        await this.#streamMetricsService.logStreamRequestSuccess(args, 0, Date.now() - startTime);
        return this.#streamCacheService.createEmptyResponse(type);
      }

      // 5. Crear streams desde magnets
      const streams = await this.#streamProcessingService.createStreamsFromMagnets(magnets, type);
      
      if (streams.length === 0) {
        await this.#streamMetricsService.logStreamRequestSuccess(args, 0, Date.now() - startTime);
        return this.#streamCacheService.createEmptyResponse(type);
      }

      // 6. Crear respuesta con caché
      const response = await this.#streamCacheService.createStreamResponse(streams, { type, idDetection });
      
      // 7. Log de éxito
      const duration = Date.now() - startTime;
      await this.#streamMetricsService.logStreamRequestSuccess(args, streams.length, duration);
      
      this.#logger.info(`Encontrados ${streams.length} streams para ${type}/${contentId} en ${duration}ms`);
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.#streamMetricsService.logStreamRequestError(args, error, duration);
      
      this.#logger.error(`Error procesando stream request para ${args?.type}/${args?.id}: ${error.message}`);
      return this.#streamCacheService.createErrorResponse(error, args?.type);
    }
  }
}

export default StreamHandler;
