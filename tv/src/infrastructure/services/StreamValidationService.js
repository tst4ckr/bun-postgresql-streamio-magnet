/**
 * @fileoverview StreamValidationService - Servicio para validación temprana de streams
 * Valida canales antes de la deduplicación para optimizar calidad y rendimiento
 */

import { HttpsToHttpConversionService } from './HttpsToHttpConversionService.js';
import { StreamHealthService } from './StreamHealthService.js';
import { convertToHttp } from './HttpsToHttpConversionService_tools.js';
import { getCachedResult, setCachedResult, updateStats, updateChannelValidationStatus, resetStats, getEmptyStats, getCacheInfo, clearCache } from './StreamValidationService_tools.js';

import ProcessFlowControlService from './ProcessFlowControlService.js';

/**
 * Servicio de validación temprana de streams
 * Responsabilidad: Validar funcionamiento de canales antes de deduplicación
 * 
 * Características:
 * - Validación concurrente con límites configurables
 * - Integración con conversión HTTPS→HTTP
 * - Timeouts optimizados para validación rápida
 * - Métricas detalladas de rendimiento
 * - Soporte para validación por lotes
 */
export class StreamValidationService {
  #config;
  #logger;
  #httpsToHttpService;
  #streamHealthService;
  #flowControlService;
  #validationCache = new Map(); // URL -> {result, timestamp}
  #stats = {
    totalProcessed: 0,
    validChannels: 0,
    invalidChannels: 0,
    httpsConverted: 0,
    httpWorking: 0,
    cacheHits: 0,
    processingTime: 0
  };

  /**
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   * @param {Object} dependencies - Dependencias inyectadas (opcional)
   */
  constructor(config, logger = console, dependencies = null) {
    this.#config = config;
    this.#logger = logger;
    
    // Si se proporcionan dependencias, usarlas; de lo contrario, crear instancias
    if (dependencies) {
      this.#streamHealthService = dependencies.streamHealthService;
      this.#httpsToHttpService = dependencies.httpsToHttpService;
      this.#flowControlService = dependencies.flowControlService;
    } else {
      // Fallback a instanciación directa (para compatibilidad)
      this.#streamHealthService = new StreamHealthService(config, logger);
      this.#httpsToHttpService = new HttpsToHttpConversionService(config, this.#streamHealthService, logger);
      
      // Inicializar servicio de control de flujo
      this.#flowControlService = new ProcessFlowControlService(logger, {
        memoryThreshold: config.MEMORY_USAGE_THRESHOLD || 70,
        cpuThreshold: 80,
        checkInterval: 2000,
        minConcurrency: 1,
        maxConcurrency: config.STREAM_VALIDATION_GENERAL_CONCURRENCY || 5
      });
    }
    
    // Escuchar eventos de throttling
    this.#flowControlService.on('throttlingStarted', (data) => {
      this.#logger.warn(`Validación: Throttling activado -> Concurrencia: ${data.newConcurrency}`);
    });
    
    this.#flowControlService.on('throttlingStopped', (data) => {
      this.#logger.info(`Validación: Throttling desactivado -> Concurrencia: ${data.newConcurrency}`);
    });
  }

  /**
   * Verifica si la validación temprana está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return this.#config.validation?.enableEarlyValidation === true;
  }

  /**
   * Obtiene configuración de validación temprana
   * @private
   * @returns {Object}
   */
  #getValidationConfig() {
    const validation = this.#config.validation || {};
    
    return {
      concurrency: validation.earlyValidationConcurrency || 15,
      timeout: validation.earlyValidationTimeout || 5000,
      batchSize: validation.earlyValidationBatchSize || 100,
      quickCheck: validation.validationQuickCheck !== false,
      skipHttpsIfHttpWorks: validation.validationSkipHttpsIfHttpWorks !== false,
      cacheTimeout: validation.validationCacheTimeout || 3600000, // 1 hora
      maxRetries: validation.validationMaxRetries || 1
    };
  }

  /**
   * Valida un canal individual
   * @param {import('../entities/Channel.js').Channel} channel - Canal a validar
   * @returns {Promise<{channel: Channel, isValid: boolean, source: string, meta: Object}>}
   */
  async validateChannel(channel) {
    const startTime = Date.now();
    const config = this.#getValidationConfig();
    
    try {
      // Verificar cache primero
      const cacheKey = channel.streamUrl;
      const cached = getCachedResult(this.#validationCache, cacheKey, config.cacheTimeout);
      if (cached) {
        this.#stats.cacheHits++;
        return {
          channel: cached.isValid ? channel.withValidationStatus(true) : channel.withValidationStatus(false),
          isValid: cached.isValid,
          source: channel.source || 'unknown',
          meta: { ...cached.meta, fromCache: true }
        };
      }

      // Validación rápida con HEAD request si está habilitada
      let validationResult;
      if (config.quickCheck) {
        validationResult = await this.#quickValidation(channel.streamUrl, config);
      } else {
        // Usar conversión HTTPS→HTTP completa
        const conversionResult = await this.#httpsToHttpService.processChannel(channel);
        validationResult = {
          isValid: conversionResult.httpWorks || conversionResult.originalWorks,
          channel: conversionResult.channel,
          converted: conversionResult.converted,
          meta: conversionResult.meta
        };
      }

      // Guardar en cache
      setCachedResult(this.#validationCache, cacheKey, validationResult);

      // Actualizar estadísticas
      updateStats(this.#stats, validationResult, Date.now() - startTime);

      // Crear canal con estado de validación actualizado
      const resultChannel = validationResult.isValid 
        ? (validationResult.channel || channel)
        : channel;
      
      // Actualizar estado de validación usando método disponible o creando nueva instancia
      const finalChannel = updateChannelValidationStatus(resultChannel, validationResult.isValid);

      return {
        channel: finalChannel,
        isValid: validationResult.isValid,
        source: channel.source || 'unknown',
        meta: validationResult.meta || {}
      };

    } catch (error) {
      // Verificar si es un error crítico que debe propagarse
      if (this.#isCriticalError(error)) {
        this.#logger.error(`❌ Error crítico validando ${channel.id}: ${error.message}`);
        throw error; // Propagar error crítico para fail-fast
      }
      
      // Errores no críticos: log y continuar
      this.#logger.warn(`⚠️  Error no crítico validando ${channel.id}: ${error.message}`);
      
      // Crear canal con estado de validación falso
      const failedChannel = updateChannelValidationStatus(channel, false);
      
      return {
        channel: failedChannel,
        isValid: false,
        source: channel.source || 'unknown',
        meta: { error: error.message, processingTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Validación rápida usando HEAD request
   * @private
   * @param {string} url - URL a validar
   * @param {Object} config - Configuración de validación
   * @returns {Promise<{isValid: boolean, channel?: Channel, converted?: boolean, meta: Object}>}
   */
  async #quickValidation(url, config) {
    const originalUrl = url;
    const httpUrl = convertToHttp(url);
    const converted = originalUrl !== httpUrl;

    try {
      // Si no se convirtió, validar URL original
      if (!converted) {
        const result = await this.#streamHealthService.checkStream(url, null, 0, {
          timeout: Math.ceil(config.timeout / 1000), // Convertir a segundos
          maxRetries: 0 // Sin reintentos
        });
        
        return {
          isValid: result.ok,
          converted: false,
          meta: { originalValidation: result, quickCheck: true }
        };
      }

      // Si se convirtió, probar HTTP primero (más rápido)
      const httpResult = await this.#streamHealthService.checkStream(httpUrl, null, 0, {
        timeout: Math.ceil(config.timeout / 1000), // Convertir a segundos
        maxRetries: 0 // Sin reintentos
      });

      if (httpResult.ok) {
        return {
          isValid: true,
          converted: true,
          meta: { 
            httpValidation: httpResult, 
            quickCheck: true,
            preferredUrl: httpUrl
          }
        };
      }

      // Si HTTP falló y está configurado para no probar HTTPS, fallar
      if (config.skipHttpsIfHttpWorks) {
        return {
          isValid: false,
          converted: true,
          meta: { 
            httpValidation: httpResult, 
            quickCheck: true,
            httpsSkipped: true
          }
        };
      }

      // Probar HTTPS original como fallback
      const httpsResult = await this.#streamHealthService.checkStream(originalUrl, null, 0, {
        timeout: Math.ceil(config.timeout / 1000), // Convertir a segundos
        maxRetries: 0 // Sin reintentos
      });

      return {
        isValid: httpsResult.ok,
        converted: false, // Usar original si HTTP no funciona
        meta: { 
          httpValidation: httpResult,
          httpsValidation: httpsResult,
          quickCheck: true
        }
      };

    } catch (error) {
      return {
        isValid: false,
        converted: false,
        meta: { error: error.message, quickCheck: true }
      };
    }
  }

  /**
   * Valida un lote de canales con concurrencia controlada
   * @param {Array<import('../entities/Channel.js').Channel>} channels - Canales a validar
   * @param {Object} options - Opciones de validación
   * @returns {Promise<{validChannels: Array, invalidChannels: Array, stats: Object}>}
   */
  async validateChannelsBatch(channels, options = {}) {
    if (!this.isEnabled()) {
      this.#logger.info('Validación temprana deshabilitada, retornando canales sin validar');
      return {
        validChannels: channels,
        invalidChannels: [],
        stats: getEmptyStats(channels.length)
      };
    }

    const config = this.#getValidationConfig();
    const {
      concurrency = config.concurrency,
      showProgress = true,
      batchSize = config.batchSize
    } = options;

    const startTime = Date.now();
    const total = channels.length;
    
    if (showProgress) {
      this.#logger.info(`Iniciando validación temprana de ${total} canales con ${concurrency} workers...`);
    }

    // Resetear estadísticas para este lote
    resetStats(this.#stats);

    // Procesar en lotes para optimizar memoria
    const results = [];
    let processed = 0;

    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      const batchResults = await this.#processBatch(batch, concurrency);
      
      results.push(...batchResults);
      processed += batch.length;

      if (showProgress && (processed % (batchSize * 2) === 0 || processed === total)) {
        const percentage = ((processed / total) * 100).toFixed(1);
        const validRate = this.#stats.totalProcessed > 0 
          ? ((this.#stats.validChannels / this.#stats.totalProcessed) * 100).toFixed(1)
          : '0.0';
        
        this.#logger.info(
          `Progreso validación: ${processed}/${total} (${percentage}%) - Válidos: ${this.#stats.validChannels} (${validRate}%)`
        );
      }

      // Pausa entre lotes para evitar sobrecarga
      if (i + batchSize < channels.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalTime = Date.now() - startTime;
    this.#stats.processingTime = totalTime;

    if (showProgress) {
      const validRate = total > 0 ? ((this.#stats.validChannels / total) * 100).toFixed(1) : '0.0';
      const avgTime = total > 0 ? (totalTime / total).toFixed(0) : '0';
      
      this.#logger.info(
        `Validación completada: ${this.#stats.validChannels}/${total} (${validRate}%) válidos en ${(totalTime/1000).toFixed(1)}s (${avgTime}ms/canal)`
      );
      
      if (this.#stats.cacheHits > 0) {
        const cacheRate = ((this.#stats.cacheHits / total) * 100).toFixed(1);
        this.#logger.info(`Cache hits: ${this.#stats.cacheHits} (${cacheRate}%)`);
      }
    }

    // Separar canales válidos e inválidos
    const validChannels = results.filter(result => result.isValid).map(result => result.channel);
    const invalidChannels = results.filter(result => !result.isValid).map(result => result.channel);

    return {
      validChannels,
      invalidChannels,
      stats: { ...this.#stats }
    };
  }

  /**
   * Determina si un error es crítico y debe causar fail-fast
   * @param {Error} error - Error a evaluar
   * @returns {boolean} True si es error crítico
   */
  #isCriticalError(error) {
    // Errores críticos que deben interrumpir todo el proceso
    const criticalPatterns = [
      /ENOTFOUND/i,           // DNS resolution failed
      /ECONNREFUSED/i,        // Connection refused
      /certificate/i,         // SSL certificate errors
      /timeout.*critical/i,   // Critical timeouts
      /auth.*fail/i,          // Authentication failures
      /config.*invalid/i,     // Configuration errors
      /service.*unavailable/i // Service unavailable
    ];
    
    const errorMessage = error.message || '';
    return criticalPatterns.some(pattern => pattern.test(errorMessage)) ||
           error.code === 'CRITICAL_ERROR' ||
           error.severity === 'CRITICAL';
  }

  /**
   * Procesa un lote de canales con workers concurrentes optimizados
   * Usa Promise.allSettled para máxima paralelización sin bloqueos
   * @private
   * @param {Array} batch - Lote de canales
   * @param {number} concurrency - Número de workers
   * @returns {Promise<Array>}
   */
  async #processBatch(batch, concurrency) {
    const effectiveConcurrency = Math.max(1, Math.min(concurrency, batch.length, 20));
    
    // Dividir el lote en chunks para procesamiento paralelo
    const chunks = [];
    const chunkSize = Math.ceil(batch.length / effectiveConcurrency);
    
    for (let i = 0; i < batch.length; i += chunkSize) {
      chunks.push(batch.slice(i, i + chunkSize));
    }
    
    // Procesar todos los chunks en paralelo usando Promise.allSettled
    const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
      const chunkResults = [];
      
      // Procesar canales del chunk secuencialmente para control de recursos
      for (const channel of chunk) {
        try {
          // Solicitar permiso para procesar
          await this.#flowControlService.requestOperation(`validation-chunk-${chunkIndex}`);
          
          const result = await this.validateChannel(channel);
          chunkResults.push(result);
        } catch (error) {
          this.#logger.warn(`Error validando ${channel.id}: ${error.message}`);
          const failedChannel = updateChannelValidationStatus(channel, false);
          chunkResults.push({
            channel: failedChannel,
            isValid: false,
            source: channel.source || 'unknown',
            meta: { error: error.message }
          });
        } finally {
          // Liberar operación
          this.#flowControlService.releaseOperation(`validation-chunk-${chunkIndex}`);
        }
      }
      
      return chunkResults;
    });
    
    // Esperar a que todos los chunks terminen (incluso si algunos fallan)
    const chunkResults = await Promise.allSettled(chunkPromises);
    
    // Consolidar resultados de todos los chunks
    const allResults = [];
    chunkResults.forEach((chunkResult, index) => {
      if (chunkResult.status === 'fulfilled') {
        allResults.push(...chunkResult.value);
      } else {
        this.#logger.error(`Error en chunk ${index}: ${chunkResult.reason?.message || 'Error desconocido'}`);
        // Agregar canales fallidos del chunk como inválidos
        const failedChunk = chunks[index] || [];
        failedChunk.forEach(channel => {
          const failedChannel = updateChannelValidationStatus(channel, false);
          allResults.push({
            channel: failedChannel,
            isValid: false,
            source: channel.source || 'unknown',
            meta: { error: 'Chunk processing failed' }
          });
        });
      }
    });
    
    return allResults;
  }

  /**
   * Valida múltiples canales usando paralelización optimizada
   * Alternativa más eficiente a validateChannelsBatch para lotes grandes
   * @param {Array<import('../entities/Channel.js').Channel>} channels - Canales a validar
   * @param {Object} options - Opciones de validación
   * @returns {Promise<{validChannels: Array, invalidChannels: Array, stats: Object}>}
   */
  async validateChannelsParallel(channels, options = {}) {
    if (!this.isEnabled()) {
      this.#logger.info('Validación temprana deshabilitada, retornando canales sin validar');
      return {
        validChannels: channels,
        invalidChannels: [],
        stats: getEmptyStats(channels.length)
      };
    }

    const config = this.#getValidationConfig();
    const {
      concurrency = config.concurrency,
      showProgress = true,
      maxBatchSize = 50 // Lotes más pequeños para mejor paralelización
    } = options;

    const startTime = Date.now();
    const total = channels.length;
    
    if (showProgress) {
      this.#logger.info(`Iniciando validación paralela de ${total} canales con concurrencia ${concurrency}...`);
    }

    // Resetear estadísticas
    resetStats(this.#stats);

    // Dividir en lotes optimizados para paralelización
    const batches = [];
    for (let i = 0; i < channels.length; i += maxBatchSize) {
      batches.push(channels.slice(i, i + maxBatchSize));
    }

    // Procesar lotes en paralelo con fail-fast para errores críticos
    const batchPromises = batches.map(async (batch, batchIndex) => {
      try {
        return await this.#processBatch(batch, Math.ceil(concurrency / batches.length));
      } catch (error) {
        // Identificar errores críticos que deben interrumpir todo el proceso
        if (this.#isCriticalError(error)) {
          this.#logger.error(`❌ Error crítico en lote ${batchIndex}: ${error.message}`);
          throw error; // Propagar error crítico para fail-fast
        }
        
        // Errores no críticos: log y continuar con fallback
        this.#logger.error(`⚠️  Error no crítico en lote ${batchIndex}: ${error.message}`);
        // Retornar canales del lote como inválidos
        return batch.map(channel => {
          const failedChannel = updateChannelValidationStatus(channel, false);
          return {
            channel: failedChannel,
            isValid: false,
            source: channel.source || 'unknown',
            meta: { error: 'Batch processing failed' }
          };
        });
      }
    });

    // Usar Promise.all para errores críticos, Promise.allSettled para no críticos
    let batchResults;
    try {
      // Intentar con Promise.all primero para detectar errores críticos
      batchResults = await Promise.all(batchPromises);
    } catch (criticalError) {
      // Si hay error crítico, fallar rápido
      this.#logger.error(`❌ Fallo crítico en validación de streams: ${criticalError.message}`);
      throw criticalError;
    }

    // Procesar resultados de lotes exitosos
    
    // Consolidar todos los resultados
    const allResults = [];
    batchResults.forEach((batchResult, index) => {
      if (batchResult.status === 'fulfilled') {
        allResults.push(...batchResult.value);
      } else {
        this.#logger.error(`Lote ${index} falló completamente: ${batchResult.reason?.message}`);
        // Agregar canales del lote fallido como inválidos
        const failedBatch = batches[index] || [];
        failedBatch.forEach(channel => {
          const failedChannel = updateChannelValidationStatus(channel, false);
          allResults.push({
            channel: failedChannel,
            isValid: false,
            source: channel.source || 'unknown',
            meta: { error: 'Batch failed completely' }
          });
        });
      }
    });

    const totalTime = Date.now() - startTime;
    this.#stats.processingTime = totalTime;

    if (showProgress) {
      const validCount = allResults.filter(r => r.isValid).length;
      const validRate = total > 0 ? ((validCount / total) * 100).toFixed(1) : '0.0';
      const avgTime = total > 0 ? (totalTime / total).toFixed(0) : '0';
      
      this.#logger.info(
        `Validación paralela completada: ${validCount}/${total} (${validRate}%) válidos en ${(totalTime/1000).toFixed(1)}s (${avgTime}ms/canal)`
      );
      
      if (this.#stats.cacheHits > 0) {
        const cacheRate = ((this.#stats.cacheHits / total) * 100).toFixed(1);
        this.#logger.info(`Cache hits: ${this.#stats.cacheHits} (${cacheRate}%)`);
      }
    }

    // Separar canales válidos e inválidos
    const validChannels = allResults.filter(result => result.isValid).map(result => result.channel);
    const invalidChannels = allResults.filter(result => !result.isValid).map(result => result.channel);

    return {
      validChannels,
      invalidChannels,
      stats: { ...this.#stats }
    };
  }

  /**
   * Obtiene estadísticas actuales de validación
   * @returns {Object}
   */
  getValidationStats() {
    return {
      ...this.#stats,
      cacheSize: this.#validationCache.size,
      isEnabled: this.isEnabled(),
      config: this.#getValidationConfig()
    };
  }

  /**
   * Limpia el cache de validación
   */
  clearCache() {
    clearCache(this.#validationCache, this.#logger);
  }

  /**
   * Obtiene información del cache
   * @returns {Object}
   */
  getCacheInfo() {
    const config = this.#getValidationConfig();
    return getCacheInfo(this.#validationCache, config.cacheTimeout);
  }
}

export default StreamValidationService;