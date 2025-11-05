/**
 * @fileoverview HttpsToHttpConversionService - Servicio para conversión automática de HTTPS a HTTP
 * Convierte URLs de canales de HTTPS a HTTP y valida su funcionalidad
 */

export class HttpsToHttpConversionService {
  #config;
  #logger;
  #streamHealthService;

  constructor(config, streamHealthService, logger = console) {
    this.#config = config;
    this.#streamHealthService = streamHealthService;
    this.#logger = logger;
  }

  /**
   * Verifica si la conversión HTTPS a HTTP está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return this.#config.validation?.convertHttpsToHttp === true;
  }

  /**
   * Convierte una URL de HTTPS a HTTP
   * @param {string} url - URL original
   * @returns {string} URL convertida a HTTP
   */
  convertToHttp(url) {
    if (!url || typeof url !== 'string') {
      return url;
    }

    // Solo convertir si la URL es HTTPS
    if (url.startsWith('https://')) {
      return url.replace('https://', 'http://');
    }

    return url;
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
    const httpUrl = this.convertToHttp(originalUrl);
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
      this.#logger.info('🔄 Conversión HTTPS a HTTP deshabilitada');
      return {
        processed: channels,
        stats: {
          total: channels.length,
          converted: 0,
          httpWorking: 0,
          originalWorking: 0,
          failed: 0
        }
      };
    }

    const limit = Math.max(1, Math.min(concurrency, 20));
    const queue = [...channels];
    const results = [];
    const total = channels.length;
    let completed = 0;

    const stats = {
      total,
      converted: 0,
      httpWorking: 0,
      originalWorking: 0,
      failed: 0
    };

    if (showProgress) {
      this.#logger.info(`🔄 Iniciando conversión HTTPS→HTTP de ${total} canales con ${limit} workers...`);
    }

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        if (!channel) break;

        try {
          const result = await this.processChannel(channel);
          results.push(result);

          // Actualizar estadísticas
          if (result.converted) stats.converted++;
          if (result.httpWorks) stats.httpWorking++;
          if (result.originalWorks) stats.originalWorking++;
          if (!result.httpWorks && !result.originalWorks) stats.failed++;

          completed++;

          // Mostrar progreso cada 50 canales o al final
          if (showProgress && (completed % 50 === 0 || completed === total)) {
            const percentage = ((completed / total) * 100).toFixed(1);
            const httpSuccessRate = stats.httpWorking > 0 ? ((stats.httpWorking / completed) * 100).toFixed(1) : '0.0';
            this.#logger.info(
              `📊 Progreso: ${completed}/${total} (${percentage}%) - HTTP funcional: ${stats.httpWorking} (${httpSuccessRate}%)`
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

          this.#logger.warn(`❌ Error procesando canal ${channel.id}: ${error.message}`);
        }
      }
    };

    // Ejecutar workers en paralelo
    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    // Filtrar resultados según configuración
    const processed = onlyWorkingHttp
      ? results.filter(r => r.httpWorks).map(r => r.channel)
      : results.map(r => r.channel);

    if (showProgress) {
      const httpSuccessRate = stats.total > 0 ? ((stats.httpWorking / stats.total) * 100).toFixed(1) : '0.0';
      this.#logger.info(
        `✅ Conversión completada: ${stats.converted} convertidos, ${stats.httpWorking}/${stats.total} (${httpSuccessRate}%) HTTP funcionales`
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
      this.#logger.info('🔄 Conversión HTTPS a HTTP deshabilitada');
      return { processed: [], stats: { total: 0, converted: 0, httpWorking: 0, originalWorking: 0, failed: 0 } };
    }

    let offset = 0;
    let batchCount = 0;
    const allProcessed = [];
    const globalStats = {
      total: 0,
      converted: 0,
      httpWorking: 0,
      originalWorking: 0,
      failed: 0
    };

    if (showProgress) {
      this.#logger.info(`🔄 Iniciando conversión HTTPS→HTTP por lotes (tamaño: ${batchSize})...`);
    }

    while (true) {
      // Obtener siguiente lote
      const channels = await getChannelsFunction(offset, batchSize);
      
      if (!channels || channels.length === 0) {
        break;
      }

      batchCount++;
      
      if (showProgress) {
        this.#logger.info(`📦 Procesando lote ${batchCount}: ${channels.length} canales`);
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
        const batchHttpRate = batchResult.stats.total > 0 
          ? ((batchResult.stats.httpWorking / batchResult.stats.total) * 100).toFixed(1) 
          : '0.0';
        this.#logger.info(
          `✅ Lote ${batchCount}: ${batchResult.stats.httpWorking}/${batchResult.stats.total} (${batchHttpRate}%) HTTP funcionales`
        );
      }

      offset += batchSize;

      // Pausa entre lotes
      if (channels.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (showProgress) {
      const overallHttpRate = globalStats.total > 0 
        ? ((globalStats.httpWorking / globalStats.total) * 100).toFixed(1) 
        : '0.0';
      this.#logger.info(
        `🎯 Conversión completa: ${globalStats.httpWorking}/${globalStats.total} (${overallHttpRate}%) HTTP funcionales en ${batchCount} lotes`
      );
    }

    return { processed: allProcessed, stats: globalStats };
  }
}

export default HttpsToHttpConversionService;