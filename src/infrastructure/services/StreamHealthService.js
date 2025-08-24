/**
 * @fileoverview StreamHealthService - Verificación no intrusiva de salud de streams
 */

import axios from 'axios';

export class StreamHealthService {
  #config;
  #logger;

  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Verifica un stream por URL usando HEAD y fallback GET parcial
   * @param {string} url
   * @returns {Promise<{ok:boolean,status?:number,contentType?:string,reason?:string}>}
   */
  async checkStream(url) {
    const timeoutMs = (this.#config.validation.streamValidationTimeout || 10) * 1000;
    const headers = { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' };
    const isValidStatus = status => status >= 200 && status < 400;

    try {
      // Intento HEAD primero
      const head = await axios.head(url, { timeout: timeoutMs, headers, validateStatus: () => true });
      if (isValidStatus(head.status)) {
        return { ok: true, status: head.status, contentType: head.headers['content-type'] };
      }

      // Fallback GET de un pequeño rango
      const get = await axios.get(url, {
        timeout: timeoutMs,
        headers: { ...headers, Range: 'bytes=0-1024' },
        responseType: 'arraybuffer',
        validateStatus: () => true
      });
      
      return isValidStatus(get.status)
        ? { ok: true, status: get.status, contentType: get.headers['content-type'] }
        : { ok: false, status: get.status, reason: 'HTTP_NOT_OK' };
    } catch (error) {
      return { ok: false, reason: error.code || error.message };
    }
  }

  /**
   * Verifica un canal
   * @param {import('../../domain/entities/Channel.js').Channel} channel
   * @returns {Promise<{id:string,name:string,ok:boolean,meta?:object}>}
   */
  async checkChannel(channel) {
    const result = await this.checkStream(channel.streamUrl);
    return {
      id: channel.id,
      name: channel.name,
      ok: result.ok,
      meta: result
    };
  }

  /**
   * Verifica múltiples canales con límite de concurrencia
   * @param {Array<import('../../domain/entities/Channel.js').Channel>} channels
   * @param {number} concurrency
   * @param {boolean} showProgress - Mostrar progreso en tiempo real
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array}>}
   */
  async checkChannels(channels, concurrency = 10, showProgress = true) {
    const limit = Math.max(1, Math.min(concurrency, this.#config.streaming.maxConcurrentStreams || 20));
    const queue = [...channels];
    const results = [];
    const total = channels.length;
    let completed = 0;
    let ok = 0;
    let fail = 0;

    if (showProgress) {
      this.#logger.info(`🔍 Iniciando validación de ${total} canales con ${limit} workers concurrentes...`);
    }

    const worker = async () => {
      while (queue.length > 0) {
        const channel = queue.shift();
        if (!channel) break;
        
        try {
          const res = await this.checkChannel(channel);
          results.push(res);
          
          completed++;
          res.ok ? ok++ : fail++;

          // Show progress every 100 channels or at the end
          if (showProgress && (completed % 100 === 0 || completed === total)) {            
            const percentage = ((completed / total) * 100).toFixed(1);
            const successRate = ((ok / completed) * 100).toFixed(1);
            this.#logger.info(`📊 Progreso: ${completed}/${total} (${percentage}%) - Éxito: ${ok} (${successRate}%) - Fallos: ${fail}`);
          }
          
        } catch (error) {
          completed++;
          fail++;
          results.push({ 
            id: channel.id, 
            name: channel.name, 
            ok: false, 
            meta: { reason: error.message } 
          });
          
          if (showProgress && (completed % 100 === 0 || completed === total)) {
            this.#logger.info(`❌ [${completed}/${total}] ${channel.name} - ERROR: ${error.message}`);
          }
        }
      }
    };

    const workers = Array.from({ length: limit }, () => worker());
    await Promise.all(workers);

    return { ok, fail, total: results.length, results };
  }

  /**
   * Valida todos los canales disponibles procesándolos por lotes
   * @param {Function} getChannelsFunction - Función para obtener canales paginados
   * @param {Object} options - Opciones de validación
   * @param {number} options.batchSize - Tamaño del lote
   * @param {number} options.concurrency - Concurrencia por lote
   * @param {boolean} options.showProgress - Mostrar progreso
   * @returns {Promise<{ok:number,fail:number,total:number,results:Array,batches:number}>}
   */
  async validateAllChannelsBatched(getChannelsFunction, options = {}) {
    const {
      batchSize = this.#config.validation?.validationBatchSize || 50,
      concurrency = this.#config.validation?.maxValidationConcurrency || 10,
      showProgress = true
    } = options;

    let offset = 0;
    let totalProcessed = 0;
    let totalOk = 0;
    let totalFail = 0;
    let batchCount = 0;
    const allResults = [];

    if (showProgress) {
      this.#logger.info(`🔍 Iniciando validación completa por lotes (tamaño: ${batchSize}, concurrencia: ${concurrency})...`);
    }

    while (true) {
      // Obtener el siguiente lote de canales
      const channels = await getChannelsFunction(offset, batchSize);
      
      if (!channels || channels.length === 0) {
        break; // No hay más canales
      }

      batchCount++;
      
      if (showProgress) {
        this.#logger.info(`📦 Procesando lote ${batchCount}: ${channels.length} canales (offset: ${offset})`);
      }

      // Validar el lote actual
      const batchReport = await this.checkChannels(channels, concurrency, false);
      
      // Acumular resultados
      totalProcessed += batchReport.total;
      totalOk += batchReport.ok;
      totalFail += batchReport.fail;
      allResults.push(...batchReport.results);

      if (showProgress) {
        const batchSuccessRate = ((batchReport.ok / batchReport.total) * 100).toFixed(1);
        this.#logger.info(`✅ Lote ${batchCount} completado: ${batchReport.ok}/${batchReport.total} (${batchSuccessRate}%) válidos`);
      }

      // Preparar para el siguiente lote
      offset += batchSize;

      // Pausa entre lotes para no sobrecargar el sistema
      if (channels.length === batchSize) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (showProgress) {
      const overallSuccessRate = totalProcessed > 0 ? ((totalOk / totalProcessed) * 100).toFixed(1) : '0.0';
      this.#logger.info(`🎯 Validación completa finalizada: ${totalOk}/${totalProcessed} (${overallSuccessRate}%) válidos en ${batchCount} lotes`);
    }

    return {
      ok: totalOk,
      fail: totalFail,
      total: totalProcessed,
      results: allResults,
      batches: batchCount
    };
  }
}
export default StreamHealthService;


