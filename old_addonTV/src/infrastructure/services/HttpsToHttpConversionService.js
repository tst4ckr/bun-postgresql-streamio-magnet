/**
 * @fileoverview HttpsToHttpConversionService - Servicio para conversión automática de HTTPS a HTTP
 * 
 * Flujo de datos principal:
 * 1. Config + Dependencies → Service Instance
 * 2. Channel Input → processChannel() → Validated Channel Result
 * 3. Channels Array → processChannels() → Processed Channels + Stats
 * 4. Paginated Function → processChannelsBatched() → Batched Results + Global Stats
 * 
 * Arquitectura:
 * - Lógica principal: Orquestación y flujo de negocio
 * - Tools: Funciones puras y utilitarias reutilizables
 * - Dependencies: StreamHealthService para validación de streams
 */

import {
  convertToHttp,
  validateConversionEnabled,
  updateProcessingStats,
  formatProgressMessage,
  calculateOptimalConcurrency,
  filterWorkingChannels,
  calculateBatchDelay,
  createInitialStats,
  calculateSuccessRate
} from './HttpsToHttpConversionService_tools.js';

import ProcessFlowControlService from './ProcessFlowControlService.js';

export class HttpsToHttpConversionService {
  #config;
  #logger;
  #streamHealthService;
  #flowControlService;

  constructor(config, streamHealthService, logger = console) {
    this.#config = config;
    this.#streamHealthService = streamHealthService;
    this.#logger = logger;
    
    // Inicializar servicio de control de flujo
    this.#flowControlService = new ProcessFlowControlService(logger, {
      memoryThreshold: config.MEMORY_USAGE_THRESHOLD || 70,
      cpuThreshold: 80,
      checkInterval: 3000,
      minConcurrency: 1,
      maxConcurrency: config.HTTPS_TO_HTTP_CONCURRENCY || 3
    });
    
    // Escuchar eventos de throttling
    this.#flowControlService.on('throttlingStarted', (data) => {
      this.#logger.warn(`[HttpsToHttpConversionService] Throttling activado - Reduciendo concurrencia a ${data.newConcurrency}`);
    });
    
    this.#flowControlService.on('throttlingStopped', (data) => {
      this.#logger.info(`[HttpsToHttpConversionService] Throttling desactivado - Concurrencia restaurada a ${data.newConcurrency}`);
    });
  }

  /**
   * Verifica si la conversión HTTPS a HTTP está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return validateConversionEnabled(this.#config);
  }



  /**
   * Valida si una URL HTTP funciona correctamente
   * @param {string} httpUrl - URL HTTP a validar
   * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
   */
  async validateHttpUrl(httpUrl) {
    if (!this.#config.validation?.validateHttpConversion) {
      return { ok: true, reason: 'HTTP_VALIDATION_DISABLED' };
    }

    try {
      const result = await this.#streamHealthService.checkStream(httpUrl);
      return result;
    } catch (error) {
      return {
        ok: false,
        reason: error.message || 'HTTP_VALIDATION_ERROR'
      };
    }
  }

  /**
   * Convierte y valida un canal individual
   * @param {import('../entities/Channel.js').Channel} channel - Canal a procesar
   * @returns {Promise<{channel: Channel, converted: boolean, httpWorks: boolean, originalWorks: boolean, meta?: object}>}
   */
  async processChannel(channel) {
    const originalUrl = channel.streamUrl;
    const httpUrl = convertToHttp(originalUrl);
    const converted = originalUrl !== httpUrl;

    // Si no se convirtió (ya era HTTP), validar directamente
    if (!converted) {
      const validation = await this.validateHttpUrl(originalUrl);
      return {
        channel,
        converted: false,
        httpWorks: validation.ok,
        originalWorks: validation.ok,
        meta: validation
      };
    }

    // Validar ambas versiones: original HTTPS y convertida HTTP
    const [originalValidation, httpValidation] = await Promise.all([
      this.#streamHealthService.checkStream(originalUrl),
      this.validateHttpUrl(httpUrl)
    ]);

    // Crear nuevo canal con URL HTTP si funciona
    let resultChannel = channel;
    if (httpValidation.ok) {
      resultChannel = channel.withUpdatedStream(httpUrl);
    }

    return {
      channel: resultChannel,
      converted: true,
      httpWorks: httpValidation.ok,
      originalWorks: originalValidation.ok,
      meta: {
        originalUrl,
        httpUrl,
        originalValidation,
        httpValidation
      }
    };
  }

  /**
   * Procesa múltiples canales con conversión HTTPS a HTTP
   * @param {Array<import('../entities/Channel.js').Channel>} channels - Canales a procesar
   * @param {Object} options - Opciones de procesamiento
   * @param {number} options.concurrency - Concurrencia máxima
   * @param {boolean} options.showProgress - Mostrar progreso
   * @param {boolean} options.onlyWorkingHttp - Solo retornar canales con HTTP funcional
   * @returns {Promise<{processed: Array, stats: Object}>}
   */
  async processChannels(channels, options = {}) {
    const {
      concurrency = this.#config.validation?.maxValidationConcurrency || 5, // Optimizado para alta latencia
      showProgress = true,
      onlyWorkingHttp = true
    } = options;

    if (!this.isEnabled()) {
      this.#logger.info('Conversión HTTPS a HTTP deshabilitada');
      return {
        processed: channels,
        stats: createInitialStats(channels.length)
      };
    }

    const initialLimit = calculateOptimalConcurrency(concurrency);
    const queue = [...channels];
    const results = [];
    const total = channels.length;
    let completed = 0;

    const stats = createInitialStats(total);

    if (showProgress) {
      this.#logger.info(`Iniciando conversión HTTPS→HTTP de ${total} canales...`);
    }

    const worker = async (workerId) => {
      while (queue.length > 0) {
        // Solicitar permiso para procesar
        await this.#flowControlService.requestOperation(`worker-${workerId}`);
        
        const channel = queue.shift();
        if (!channel) {
          this.#flowControlService.releaseOperation(`worker-${workerId}`);
          break;
        }

        try {
          const result = await this.processChannel(channel);
          results.push(result);

          // Actualizar estadísticas usando función utilitaria
          Object.assign(stats, updateProcessingStats(stats, result));
          completed++;

          // Mostrar progreso cada 50 canales o al final
          if (showProgress && (completed % 50 === 0 || completed === total)) {
            const flowStats = this.#flowControlService.getStats();
            this.#logger.info(
              formatProgressMessage(completed, total, stats.httpWorking) + 
              ` [Concurrencia: ${flowStats.currentConcurrency}, Memoria: ${flowStats.memoryUsage.toFixed(1)}%]`
            );
          }
        } catch (error) {
          completed++;
          stats.failed++;
          results.push({
            channel,
            converted: false,
            httpWorks: false,
            originalWorks: false,
            meta: { error: error.message }
          });

          this.#logger.warn(`Error procesando ${channel.id}: ${error.message}`);
        } finally {
          // Liberar operación
          this.#flowControlService.releaseOperation(`worker-${workerId}`);
        }
      }
    };

    // Ejecutar workers en paralelo con control de flujo
    const workers = Array.from({ length: initialLimit }, (_, i) => worker(i));
    await Promise.all(workers);

    // Filtrar resultados según configuración usando función utilitaria
    const processed = filterWorkingChannels(results, onlyWorkingHttp);

    if (showProgress) {
      const httpSuccessRate = calculateSuccessRate(stats.httpWorking, stats.total);
      this.#logger.info(
        `Conversión completada: ${stats.converted} convertidos, ${stats.httpWorking}/${stats.total} (${httpSuccessRate}%) HTTP funcionales`
      );
    }

    return { processed, stats, results };
  }

  /**
   * Procesa canales por lotes para optimizar memoria
   * @param {Function} getChannelsFunction - Función para obtener canales paginados
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<{processed: Array, stats: Object}>}
   */
  async processChannelsBatched(getChannelsFunction, options = {}) {
    const {
      batchSize = this.#config.validation?.validationBatchSize || 25, // Optimizado para alta latencia
      concurrency = this.#config.validation?.maxValidationConcurrency || 5, // Optimizado para alta latencia
      showProgress = true,
      onlyWorkingHttp = true
    } = options;

    if (!this.isEnabled()) {
      this.#logger.info('Conversión HTTPS a HTTP deshabilitada');
      return { processed: [], stats: createInitialStats(0) };
    }

    let offset = 0;
    let batchCount = 0;
    const allProcessed = [];
    const globalStats = createInitialStats(0);

    if (showProgress) {
      this.#logger.info(`Iniciando conversión HTTPS→HTTP por lotes (tamaño: ${batchSize})...`);
    }

    while (true) {
      // Obtener siguiente lote
      const channels = await getChannelsFunction(offset, batchSize);
      
      if (!channels || channels.length === 0) {
        break;
      }

      batchCount++;
      
      if (showProgress) {
        this.#logger.info(`Procesando lote ${batchCount}: ${channels.length} canales`);
      }

      // Procesar lote actual
      const batchResult = await this.processChannels(channels, {
        concurrency,
        showProgress: false,
        onlyWorkingHttp
      });

      // Acumular resultados
      allProcessed.push(...batchResult.processed);
      globalStats.total += batchResult.stats.total;
      globalStats.converted += batchResult.stats.converted;
      globalStats.httpWorking += batchResult.stats.httpWorking;
      globalStats.originalWorking += batchResult.stats.originalWorking;
      globalStats.failed += batchResult.stats.failed;

      if (showProgress) {
        const batchHttpRate = calculateSuccessRate(batchResult.stats.httpWorking, batchResult.stats.total);
        this.#logger.info(
          `Lote ${batchCount}: ${batchResult.stats.httpWorking}/${batchResult.stats.total} (${batchHttpRate}%) HTTP funcionales`
        );
      }

      offset += batchSize;

      // Pausa entre lotes usando función utilitaria
      const delay = calculateBatchDelay(batchSize, channels.length);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (showProgress) {
      const overallHttpRate = calculateSuccessRate(globalStats.httpWorking, globalStats.total);
      this.#logger.info(
        `Conversión total: ${globalStats.httpWorking}/${globalStats.total} (${overallHttpRate}%) HTTP funcionales en ${batchCount} lotes`
      );
    }

    return { processed: allProcessed, stats: globalStats };
  }
}

export default HttpsToHttpConversionService;