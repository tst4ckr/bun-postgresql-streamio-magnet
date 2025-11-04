/**
 * @fileoverview UnifiedLoggerService - Servicio de Logging Unificado
 * 
 * RESPONSABILIDAD PRINCIPAL: Proporcionar un único servicio de logging con todas las características
 * 
 * Características consolidadas:
 * - Batching automático de logs (de OptimizedLoggerService)
 * - Throttling para evitar spam (de OptimizedLoggerService) 
 * - Seguimiento de archivos fuente (de EnhancedLoggerService)
 * - Request logging HTTP (de EnhancedLoggerService)
 * - Métricas de rendimiento (de ambos)
 * - Logger hijo con contexto (de ambos)
 * 
 * Arquitectura:
 * - Lógica principal: validación y orquestación
 * - _tools.js: funciones puras y utilidades
 */

import {
  LOG_LEVELS,
  LEVEL_NAMES,
  getEnvironmentLevel,
  shouldLog,
  getThrottleKey,
  shouldThrottleWithMap,
  formatLogMessage,
  getConsoleMethod,
  calculateMetrics,
  validateUnifiedLoggerConfig,
  createInitialMetrics,
  shouldLogBatch,
  createBatchMessage,
  extractSourceInfo,
  createPerformanceMessage,
  createRequestMessage,
  createContextualLogFunction
} from './UnifiedLoggerService_tools.js';

export class UnifiedLoggerService {
  static LEVELS = LOG_LEVELS;
  static LEVEL_NAMES = LEVEL_NAMES;

  constructor(config = {}) {
    // Validar y mergear configuración
    this.#config = validateUnifiedLoggerConfig({
      level: config.level || getEnvironmentLevel(),
      enableBatching: config.enableBatching !== false,
      batchSize: config.batchSize || 50,
      batchTimeout: config.batchTimeout || 100,
      enableThrottling: config.enableThrottling !== false,
      throttleWindow: config.throttleWindow || 1000,
      maxLogsPerWindow: config.maxLogsPerWindow || 10,
      enableSourceTracking: config.enableSourceTracking !== false,
      enableRequestLogging: config.enableRequestLogging || false,
      enablePerformanceMetrics: config.enablePerformanceMetrics || true,
      maxMemoryMB: config.maxMemoryMB || 10,
      ...config
    });

    // Estado interno
    this.#logBatch = [];
    this.#batchTimer = null;
    this.#throttleMap = new Map();
    this.#sourceLocationCache = new Map();
    this.#metrics = createInitialMetrics();

    // Bind methods
    this.error = this.error.bind(this);
    this.warn = this.warn.bind(this);
    this.info = this.info.bind(this);
    this.debug = this.debug.bind(this);
  }

  #config;
  #logBatch;
  #batchTimer;
  #throttleMap;
  #sourceLocationCache;
  #metrics;

  /**
   * Obtiene información del archivo fuente con cache
   */
  #getSourceLocation() {
    if (!this.#config.enableSourceTracking) return '';

    const stack = new Error().stack;
    const sourceInfo = extractSourceInfo(stack);
    
    if (!sourceInfo) return '';

    const cacheKey = `${sourceInfo.fileName}:${sourceInfo.lineNumber}`;
    
    if (this.#sourceLocationCache.has(cacheKey)) {
      this.#metrics.cacheHits++;
      return this.#sourceLocationCache.get(cacheKey);
    }

    this.#metrics.cacheMisses++;
    const location = `[${sourceInfo.shortPath}:${sourceInfo.lineNumber}]`;
    
    // Limitar cache
    if (this.#sourceLocationCache.size >= 100) {
      const firstKey = this.#sourceLocationCache.keys().next().value;
      this.#sourceLocationCache.delete(firstKey);
    }
    
    this.#sourceLocationCache.set(cacheKey, location);
    return location;
  }

  /**
   * Formatea el mensaje de log
   */
  #formatMessage(level, message, ...args) {
    const sourceLocation = this.#getSourceLocation();
    const baseMessage = formatLogMessage(level, message, args);
    return sourceLocation ? `${sourceLocation} ${baseMessage}` : baseMessage;
  }

  /**
   * Procesa el batch de logs
   */
  #processBatch() {
    if (this.#logBatch.length === 0) return;
    
    const batch = [...this.#logBatch];
    this.#logBatch = [];
    this.#metrics.batchesProcessed++;
    
    for (const { level, message } of batch) {
      this.#writeLog(level, message);
    }
  }

  /**
   * Agrega log al batch
   */
  #addToBatch(level, formattedMessage) {
    this.#logBatch.push({ level, message: formattedMessage });
    this.#metrics.batchedLogs++;

    if (this.#logBatch.length >= this.#config.batchSize) {
      this.#processBatch();
    } else if (!this.#batchTimer) {
      this.#batchTimer = setTimeout(() => {
        this.#processBatch();
        this.#batchTimer = null;
      }, this.#config.batchTimeout);
    }
  }

  /**
   * Escribe el log a la consola
   */
  #writeLog(level, formattedMessage) {
    const method = getConsoleMethod(level);
    console[method](formattedMessage);
  }

  /**
   * Método principal de logging
   */
  #log(level, message, ...args) {
    if (!shouldLog(level, this.#config.level)) return;

    // Throttling
    if (this.#config.enableThrottling) {
      const throttleKey = getThrottleKey(message, args);
      if (shouldThrottleWithMap(this.#throttleMap, throttleKey, this.#config.throttleWindow, this.#config.maxLogsPerWindow)) {
        this.#metrics.throttledLogs++;
        return;
      }
    }

    const formattedMessage = this.#formatMessage(level, message, ...args);
    this.#metrics.totalLogs++;

    if (this.#config.enableBatching) {
      this.#addToBatch(level, formattedMessage);
    } else {
      this.#writeLog(level, formattedMessage);
    }
  }

  // Métodos públicos
  error(message, ...args) {
    this.#metrics.errorCount++;
    this.#log(LOG_LEVELS.ERROR, message, ...args);
  }

  warn(message, ...args) {
    this.#metrics.warnCount++;
    this.#log(LOG_LEVELS.WARN, message, ...args);
  }

  info(message, ...args) {
    this.#metrics.infoCount++;
    this.#log(LOG_LEVELS.INFO, message, ...args);
  }

  debug(message, ...args) {
    this.#metrics.debugCount++;
    this.#log(LOG_LEVELS.DEBUG, message, ...args);
  }

  /**
   * Log de batch
   */
  debugBatch(items, message = 'Batch processing') {
    if (!shouldLogBatch(this.#config.level, items)) return;
    const batchMessage = createBatchMessage(message, items);
    this.debug(batchMessage);
  }

  /**
   * Log de progreso
   */
  progress(current, total, operation = 'Processing') {
    const progressMessage = `${operation}: ${current}/${total} (${Math.round((current/total) * 100)}%)`;
    this.info(progressMessage);
  }

  /**
   * Registra métricas de rendimiento
   */
  performance(operation, duration, metadata = {}) {
    if (this.#config.enablePerformanceMetrics) {
      const message = createPerformanceMessage(operation, duration);
      this.info(message, metadata);
    }
  }

  /**
   * Registra información de requests HTTP
   */
  request(method, url, statusCode, duration) {
    if (this.#config.enableRequestLogging) {
      const message = createRequestMessage(method, url, statusCode, duration);
      this.info(message);
    }
  }

  /**
   * Flush manual del batch
   */
  flush() {
    this.#processBatch();
  }

  /**
   * Obtiene métricas
   */
  getMetrics() {
    return calculateMetrics(this.#metrics, this.#throttleMap);
  }

  /**
   * Cambia el nivel de logging
   */
  setLevel(level) {
    if (typeof level === 'string' && LOG_LEVELS[level.toUpperCase()] !== undefined) {
      this.#config.level = LOG_LEVELS[level.toUpperCase()];
    } else if (typeof level === 'number' && level >= 0 && level <= 3) {
      this.#config.level = level;
    }
  }

  /**
   * Crear logger hijo con contexto
   */
  child(context) {
    const childLogger = new UnifiedLoggerService(this.#config);
    const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
    
    // Override métodos para incluir contexto
    ['error', 'warn', 'info', 'debug'].forEach(method => {
      const originalMethod = childLogger[method];
      childLogger[method] = (message, ...args) => {
        originalMethod.call(childLogger, `[${contextStr}] ${message}`, ...args);
      };
    });

    return childLogger;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.#processBatch();
    if (this.#batchTimer) {
      clearTimeout(this.#batchTimer);
      this.#batchTimer = null;
    }
    this.#throttleMap.clear();
    this.#sourceLocationCache.clear();
  }
}

export default UnifiedLoggerService;