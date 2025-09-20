/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 */

import { BitelUidService } from './BitelUidService.js';
import {
  calculateProgressiveTimeout,
  isValidStreamStatus,
  isValidM3U8ContentType,
  isRetryableError,
  calculateBackoffTime,
  createStreamValidationHeaders,
  performHeadRequest,
  performPartialGetRequest,
  createStreamValidationResult,
  createErrorResult,
  createDelay,
  calculateConcurrencyLimit,
  createChannelWorker,
  createValidationReport
} from './StreamHealthService_tools.js';

export class StreamHealthService {
  #config;
  #logger;
  #bitelUidService;

  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#bitelUidService = new BitelUidService(config, logger);
  }

  /**
   * Verifica un stream por URL usando HEAD y fallback GET parcial con retry
   * Validación específica para streams m3u8: HTTP 200 y content-type correcto
   * @param {string} url
   * @param {string} channelId - ID del canal para procesamiento de BITEL
   * @param {number} retryCount - Número de reintentos (interno)
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string}>}
   */
  async checkStream(url, channelId = null, retryCount = 0) {
    // Procesar URL con BitelUidService si es necesario
    const processedUrl = channelId ? this.#bitelUidService.processStreamUrl(url, channelId) : url;
    
    // Configuración de validación
    const baseTimeout = this.#config.validation.streamValidationTimeout || 45;
    const timeoutMs = calculateProgressiveTimeout(baseTimeout, retryCount);
    const maxRetries = this.#config.validation.maxValidationRetries || 3;
    const headers = createStreamValidationHeaders();

    try {
      // Intento HEAD primero con validación estricta
      const head = await performHeadRequest(processedUrl, timeoutMs, headers);
      
      if (isValidStreamStatus(head.status)) {
        const contentType = head.headers['content-type'];
        const isValidContent = isValidM3U8ContentType(contentType);
        const reason = isValidContent ? undefined : `INVALID_CONTENT_TYPE: ${contentType}`;
        
        return createStreamValidationResult(
          isValidContent, 
          head.status, 
          contentType, 
          processedUrl, 
          retryCount + 1, 
          reason
        );
      }

      // Fallback GET de un pequeño rango con validación estricta
      const get = await performPartialGetRequest(processedUrl, timeoutMs, headers);
      
      if (isValidStreamStatus(get.status)) {
        const contentType = get.headers['content-type'];
        const isValidContent = isValidM3U8ContentType(contentType);
        const reason = isValidContent ? undefined : `INVALID_CONTENT_TYPE: ${contentType}`;
        
        return createStreamValidationResult(
          isValidContent, 
          get.status, 
          contentType, 
          processedUrl, 
          retryCount + 1, 
          reason
        );
      } else {
        return createErrorResult(
          `HTTP_NOT_200: ${get.status}`, 
          processedUrl, 
          retryCount + 1
        );
      }
    } catch (error) {
      // Implementar retry con backoff exponencial optimizado para alta latencia
      if (retryCount < maxRetries && isRetryableError(error)) {
        const backoffMs = calculateBackoffTime(retryCount);
        this.#logger.debug(`Reintentando validación de ${channelId || 'stream'} en ${backoffMs}ms (intento ${retryCount + 1}/${maxRetries + 1})`);
        
        await createDelay(backoffMs);
        return this.checkStream(url, channelId, retryCount + 1);
      }
      
      return createErrorResult(
        error.code || error.message, 
        processedUrl, 
        retryCount + 1, 
        true
      );
    }
  }

  /**
   * Verifica un canal
   * @param {import('../../domain/entities/Channel.js').Channel} channel
   * @returns {Promise<{id:string,name:string,ok:boolean,meta?:object}>}
   */
  async checkChannel(channel) {
    try {
      const result = await this.checkStream(channel.streamUrl, channel.id);
      return {
        id: channel.id,
        name: channel.name,
        ok: result.ok,
        meta: result
      };
    } catch (error) {
      // Manejo explícito de errores para evitar promesas rechazadas no manejadas
      this.#logger.warn(`Error validando canal ${channel.id}: ${error.message}`);
      return {
        id: channel.id,
        name: channel.name,
        ok: false,
        meta: { 
          reason: error.message,
          error: true,
          finalError: true
        }
      };
    }
  }

  /**
   * Verifica múltiples canales con límite de concurrencia y reporte de progreso
   * Optimizado para alta latencia con concurrencia adaptativa
   * @param {Array} channels - Array de objetos con {id, url}
   * @param {Function} onProgress - Callback para reporte de progreso
   * @returns {Promise<Array>} Array de resultados de validación
   */
  async checkChannels(channels, onProgress = null) {
    if (!Array.isArray(channels) || channels.length === 0) {
      return [];
    }

    // Configuración de concurrencia adaptativa
    const baseConcurrency = this.#config.validation.concurrency || 5;
    const concurrency = calculateConcurrencyLimit(baseConcurrency, channels.length);
    
    this.#logger.info(`Iniciando validación de ${channels.length} canales con concurrencia ${concurrency}`);
    
    const results = [];
    let completed = 0;
    
    // Worker para procesar canales con manejo de errores robusto
    const worker = createChannelWorker(
      this.checkChannel.bind(this),
      this.#logger,
      () => ++completed,
      channels.length,
      onProgress
    );

    // Procesar en lotes con concurrencia limitada
    for (let i = 0; i < channels.length; i += concurrency) {
      const batch = channels.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(worker));
      results.push(...batchResults);
    }

    this.#logger.info(`Validación completada: ${results.filter(r => r.ok).length}/${channels.length} válidos`);
    return results;
  }

  /**
   * Valida todos los canales en lotes con configuración optimizada para alta latencia
   * @param {Array} channels - Array de canales a validar
   * @param {Object} options - Opciones de configuración
   * @param {number} options.batchSize - Tamaño del lote (default: 50)
   * @param {number} options.concurrency - Concurrencia por lote (default: 5)
   * @param {number} options.pauseBetweenBatches - Pausa entre lotes en ms (default: 2000)
   * @param {Function} options.onProgress - Callback de progreso
   * @returns {Promise<Object>} Resultado de la validación
   */
  async validateAllChannelsBatched(channels, options = {}) {
    const {
      batchSize = 50,
      concurrency = 5,
      pauseBetweenBatches = 2000,
      onProgress = null
    } = options;

    if (!Array.isArray(channels) || channels.length === 0) {
      return createValidationReport([], 0, 0);
    }

    this.#logger.info(`Iniciando validación por lotes: ${channels.length} canales, lotes de ${batchSize}, concurrencia ${concurrency}`);
    
    const allResults = [];
    let totalOk = 0;
    let totalFail = 0;
    const totalBatches = Math.ceil(channels.length / batchSize);

    for (let i = 0; i < channels.length; i += batchSize) {
      const currentBatch = i / batchSize + 1;
      const batch = channels.slice(i, i + batchSize);
      
      this.#logger.info(`Procesando lote ${currentBatch}/${totalBatches}: ${batch.length} canales`);
      
      try {
        const batchResults = await this.checkChannels(batch, (progress) => {
          if (onProgress) {
            onProgress({
              currentBatch,
              totalBatches,
              batchProgress: progress,
              totalProcessed: allResults.length + progress.completed,
              totalChannels: channels.length,
              totalOk,
              totalFail,
              percentage: Math.round(((allResults.length + progress.completed) / channels.length) * 100)
            });
          }
        });
        
        allResults.push(...batchResults);
        const batchOk = batchResults.filter(r => r.ok).length;
        const batchFail = batchResults.length - batchOk;
        totalOk += batchOk;
        totalFail += batchFail;
        
        this.#logger.info(`Lote ${currentBatch} completado: ${batchOk}/${batch.length} válidos`);
        
        // Pausa entre lotes para evitar sobrecarga del sistema
        if (currentBatch < totalBatches && pauseBetweenBatches > 0) {
          this.#logger.debug(`Pausa de ${pauseBetweenBatches}ms antes del siguiente lote`);
          await createDelay(pauseBetweenBatches);
        }
        
      } catch (error) {
        this.#logger.error(`Error en lote ${currentBatch}: ${error.message}`);
        
        // Marcar todos los canales del lote como fallidos
        const failedBatchResults = batch.map(channel => ({
          id: channel.id,
          name: channel.name,
          ok: false,
          reason: `Batch error: ${error.message}`,
          batchError: true
        }));
        
        allResults.push(...failedBatchResults);
        totalFail += batch.length;
      }
    }

    const finalResult = createValidationReport(allResults, totalOk, totalFail, totalBatches);
    this.#logger.info(`Validación por lotes completada: ${totalOk}/${allResults.length} válidos (${finalResult.successRate}%)`);
    
    return finalResult;
  }
}
export default StreamHealthService;


