/**
 * @fileoverview IpLatencyValidationService - Servicio para validar latencia de IPs mediante ping
 * 
 * RESPONSABILIDAD PRINCIPAL: Orquestar la validación de latencia de IPs únicas
 * 
 * Arquitectura Clara:
 * - ESTE ARCHIVO: Contiene toda la lógica de negocio y orquestación
 * - _tools.js: Contiene SOLO funciones puras y simples (sin lógica compleja)
 * 
 * Flujo de datos:
 * 1. Recibe lista de IPs únicas
 * 2. Ejecuta ping concurrente con límites configurables
 * 3. Filtra IPs con latencia menor al umbral (50ms por defecto)
 * 4. Retorna IPs válidas y estadísticas detalladas
 * 
 * @author Sistema de Validación de Latencia IP
 * @version 1.0.0
 */

import {
  executePing,
  isLatencyValid,
  createLatencyStats,
  validateLatencyConfig,
  createLatencyLogMessage,
  createIpBatches,
  DEFAULT_LATENCY_CONFIG
} from './IpLatencyValidationService_tools.js';

/**
 * Servicio especializado en la validación de latencia de IPs mediante ping
 * Responsabilidad única: gestionar la validación concurrente de latencia con umbrales configurables
 */
export class IpLatencyValidationService {
  /**
   * @private
   */
  #config;
  #logger;
  #stats;
  #tools;
  #isValidating = false;

  /**
   * Constructor con dependency injection para herramientas
   * @param {Object} config - Configuración del servicio
   * @param {Object} logger - Logger para trazabilidad
   * @param {Object} tools - Herramientas inyectadas (para testing)
   */
  constructor(config = {}, logger = console, tools = null) {
    // Inyección de dependencias para herramientas PURAS
    this.#tools = tools || {
      executePing,
      isLatencyValid,
      createLatencyStats,
      validateLatencyConfig,
      createLatencyLogMessage,
      createIpBatches,
      DEFAULT_LATENCY_CONFIG
    };
    
    // Crear configuración de latencia desde config.validation si está disponible
    const latencyConfig = config.validation ? {
      maxLatencyMs: config.validation.maxLatencyMs || this.#tools.DEFAULT_LATENCY_CONFIG.maxLatencyMs,
      timeoutMs: config.validation.pingTimeoutMs || this.#tools.DEFAULT_LATENCY_CONFIG.timeoutMs,
      retries: config.validation.pingRetries || this.#tools.DEFAULT_LATENCY_CONFIG.retries,
      concurrency: config.validation.pingConcurrency || this.#tools.DEFAULT_LATENCY_CONFIG.concurrency,
      pingCount: config.validation.pingCount || this.#tools.DEFAULT_LATENCY_CONFIG.pingCount
    } : config;
    
    // Validación de configuración usando herramienta pura
    this.#config = this.#tools.validateLatencyConfig(latencyConfig);
    this.#logger = logger;
    this.#stats = {
      totalValidations: 0,
      successfulPings: 0,
      failedPings: 0,
      validIps: 0,
      invalidIps: 0,
      totalProcessingTime: 0,
      avgLatency: 0
    };
  }

  /**
   * LÓGICA PRINCIPAL: Valida latencia de una lista de IPs
   * Esta es la lógica de negocio central del servicio
   * @param {Array} ips - Lista de IPs a validar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado con IPs válidas y estadísticas
   */
  async validateIpsLatency(ips, options = {}) {
    if (this.#isValidating) {
      throw new Error('Ya hay una validación en progreso');
    }

    const startTime = Date.now();
    this.#isValidating = true;

    try {
      this.#logger.info('🏓 Iniciando validación de latencia por ping...');
      
      // 1. Validar entrada
      if (!Array.isArray(ips) || ips.length === 0) {
        throw new Error('La lista de IPs debe ser un array no vacío');
      }

      // 2. Configurar opciones de validación
      const validationConfig = {
        ...this.#config,
        ...options
      };

      this.#logger.info(`📊 IPs a validar: ${ips.length}`);
      this.#logger.info(`⏱️  Umbral de latencia: ${validationConfig.maxLatencyMs}ms`);
      this.#logger.info(`🔄 Concurrencia: ${validationConfig.concurrency}`);

      // 3. LÓGICA DE NEGOCIO: Procesar IPs en lotes concurrentes
      const results = await this.#processIpsInBatches(ips, validationConfig);

      // 4. LÓGICA DE NEGOCIO: Filtrar IPs válidas
      const validIps = this.#filterValidIps(results, validationConfig);

      // 5. LÓGICA DE NEGOCIO: Actualizar estadísticas
      this.#updateStats(results, Date.now() - startTime);

      // 6. Logging detallado
      this.#logValidationResults(ips.length, validIps.length, results);

      // 7. Retornar resultado estructurado
      return {
        success: true,
        validIps,
        invalidIps: results.filter(r => !this.#isIpResultValid(r, validationConfig)).map(r => r.ip),
        results,
        stats: this.#createDetailedStats(results, validationConfig),
        config: validationConfig
      };

    } catch (error) {
      this.#logger.error('❌ Error en validación de latencia:', error.message);
      
      return {
        success: false,
        validIps: [],
        invalidIps: [],
        results: [],
        stats: this.#createDetailedStats([], this.#config),
        error: error.message
      };
    } finally {
      this.#isValidating = false;
    }
  }

  /**
   * LÓGICA DE NEGOCIO: Valida latencia de una IP específica
   * @param {string} ip - IP a validar
   * @param {number} retries - Número de reintentos
   * @returns {Promise<Object>} Resultado de validación
   */
  async validateSingleIp(ip, retries = null) {
    const maxRetries = retries !== null ? retries : this.#config.retries;
    let lastResult = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.#tools.executePing(ip, this.#config);
        
        if (result.success && this.#tools.isLatencyValid(result.latency, this.#config.maxLatencyMs)) {
          return {
            success: true,
            ip,
            latency: result.latency,
            attempt: attempt + 1,
            isValid: true
          };
        }

        lastResult = result;
        
        if (attempt < maxRetries) {
          this.#logger.debug(`🔄 Reintentando ping para ${ip} (intento ${attempt + 2}/${maxRetries + 1})`);
          await this.#delay(500); // Esperar 500ms entre reintentos
        }

      } catch (error) {
        lastResult = {
          success: false,
          ip,
          latency: null,
          error: error.message
        };
      }
    }

    return {
      success: false,
      ip,
      latency: lastResult?.latency || null,
      attempt: maxRetries + 1,
      isValid: false,
      error: lastResult?.error || 'Latencia excede el umbral permitido'
    };
  }

  /**
   * LÓGICA DE NEGOCIO: Procesa IPs en lotes concurrentes
   * @private
   */
  async #processIpsInBatches(ips, config) {
    const batches = this.#tools.createIpBatches(ips, config.concurrency);
    const allResults = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.#logger.info(`🔄 Procesando lote ${i + 1}/${batches.length} (${batch.length} IPs)`);

      // Procesar lote actual concurrentemente
      const batchPromises = batch.map(ip => this.validateSingleIp(ip));
      const batchResults = await Promise.allSettled(batchPromises);

      // Extraer resultados exitosos
      const processedResults = batchResults.map(result => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            ip: 'unknown',
            latency: null,
            error: result.reason?.message || 'Error desconocido'
          };
        }
      });

      allResults.push(...processedResults);

      // Pequeña pausa entre lotes para no saturar la red
      if (i < batches.length - 1) {
        await this.#delay(100);
      }
    }

    return allResults;
  }

  /**
   * LÓGICA DE NEGOCIO: Filtra IPs válidas según resultados
   * @private
   */
  #filterValidIps(results, config) {
    return results
      .filter(result => this.#isIpResultValid(result, config))
      .map(result => result.ip);
  }

  /**
   * Verifica si un resultado de IP es válido
   * @private
   */
  #isIpResultValid(result, config) {
    return result.success && 
           result.latency !== null && 
           this.#tools.isLatencyValid(result.latency, config.maxLatencyMs);
  }

  /**
   * Actualiza estadísticas internas
   * @private
   */
  #updateStats(results, processingTime) {
    const successfulResults = results.filter(r => r.success);
    const validResults = results.filter(r => this.#isIpResultValid(r, this.#config));

    this.#stats.totalValidations += results.length;
    this.#stats.successfulPings += successfulResults.length;
    this.#stats.failedPings += results.length - successfulResults.length;
    this.#stats.validIps += validResults.length;
    this.#stats.invalidIps += results.length - validResults.length;
    this.#stats.totalProcessingTime += processingTime;

    // Calcular latencia promedio de IPs válidas
    const validLatencies = validResults.map(r => r.latency).filter(l => l !== null);
    if (validLatencies.length > 0) {
      this.#stats.avgLatency = Math.round(validLatencies.reduce((sum, lat) => sum + lat, 0) / validLatencies.length);
    }
  }

  /**
   * Registra resultados de validación de latencia
   * Optimizado para evitar logging excesivo en bucles
   * @private
   */
  #logValidationResults(totalIps, validIps, results) {
    const validationRate = totalIps > 0 ? Math.round((validIps / totalIps) * 100) : 0;
    const successfulPings = results.filter(r => r.success).length;
    
    this.#logger.info(`📊 IPs procesadas: ${totalIps}`);
    this.#logger.info(`✅ Pings exitosos: ${successfulPings}/${totalIps}`);
    
    // Mostrar IPs con ping exitoso y su latencia (optimizado)
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length > 0) {
      this.#logger.info(`🔍 IPs con ping exitoso:`);
      
      // Optimización: batch logging para evitar múltiples llamadas
      if (successfulResults.length <= 5) {
        // Para pocas IPs, log individual es aceptable
        successfulResults.forEach(result => {
          this.#logger.info(`   📍 ${result.ip} - ${result.latency}ms`);
        });
      } else {
        // Para muchas IPs, crear mensaje consolidado
        const successMessage = successfulResults
          .map(result => `   📍 ${result.ip} - ${result.latency}ms`)
          .join('\n');
        this.#logger.info(successMessage);
      }
    }
    
    this.#logger.info(`🎯 IPs con latencia válida: ${validIps}`);
    this.#logger.info(`📈 Tasa de validación: ${validationRate}%`);
    
    if (validIps > 0) {
      const validResults = results.filter(r => this.#isIpResultValid(r, this.#config));
      const avgLatency = Math.round(validResults.reduce((sum, r) => sum + r.latency, 0) / validResults.length);
      this.#logger.info(`⚡ Latencia promedio: ${avgLatency}ms`);
      
      // Mostrar específicamente las IPs válidas (optimizado)
      this.#logger.info(`✨ IPs válidas (latencia <${this.#config.maxLatencyMs}ms):`);
      
      // Optimización: batch logging para IPs válidas
      if (validResults.length <= 5) {
        validResults.forEach(result => {
          this.#logger.info(`   ✅ ${result.ip} - ${result.latency}ms`);
        });
      } else {
        const validMessage = validResults
          .map(result => `   ✅ ${result.ip} - ${result.latency}ms`)
          .join('\n');
        this.#logger.info(validMessage);
      }
    }
  }

  /**
   * Crea estadísticas detalladas usando herramientas puras
   * @private
   */
  #createDetailedStats(results, config) {
    return {
      ...this.#stats,
      ...this.#tools.createLatencyStats(results, config)
    };
  }

  /**
   * Utilidad para delay
   * @private
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas del servicio
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return { ...this.#stats };
  }

  /**
   * Obtiene la configuración actual del servicio
   * @returns {Object} Configuración del servicio
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Reinicia las estadísticas del servicio
   */
  resetStats() {
    this.#stats = {
      totalValidations: 0,
      successfulPings: 0,
      failedPings: 0,
      validIps: 0,
      invalidIps: 0,
      totalProcessingTime: 0,
      avgLatency: 0
    };
  }

  /**
   * Verifica si el servicio está actualmente validando
   * @returns {boolean} True si está validando
   */
  isValidating() {
    return this.#isValidating;
  }
}