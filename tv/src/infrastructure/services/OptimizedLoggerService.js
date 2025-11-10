/**
 * @fileoverview OptimizedLoggerService - Servicio de Logging Optimizado
 * 
 * RESPONSABILIDAD PRINCIPAL: Orquestar el logging optimizado con batching y throttling
 * 
 * Arquitectura Clara:
 * - ESTE ARCHIVO: Contiene la lógica de negocio y orquestación del logging
 * - _tools.js: Contiene SOLO funciones puras y simples (sin lógica compleja)
 * 
 * Características:
 * - Niveles de logging configurables (SILENT, ERROR, WARN, INFO, DEBUG)
 * - Throttling automático para evitar spam de logs
 * - Batching de logs para reducir I/O
 * - Formateo eficiente con lazy evaluation
 * - Control de rendimiento con métricas
 */

import {
  LOG_LEVELS,
  LEVEL_NAMES,
  getEnvironmentLevel,
  shouldLog,
  getThrottleKey,
  simpleHash,
  shouldThrottle,
  shouldThrottleWithMap,
  filterValidTimestamps,
  formatLogMessage,
  formatArgs,
  getConsoleMethod,
  calculateMetrics,
  validateOptimizedLoggerConfig,
  createInitialMetrics,
  shouldLogBatch,
  shouldLogProgress,
  createProgressMessage,
  createBatchMessage
} from './OptimizedLoggerService_tools.js';

export class OptimizedLoggerService {
    // Usar constantes del archivo tools
    static LEVELS = LOG_LEVELS;
    static LEVEL_NAMES = LEVEL_NAMES;

    constructor(config = {}) {
        // Validar configuración usando herramientas auxiliares
        this.#config = validateOptimizedLoggerConfig({
            level: config.level || getEnvironmentLevel(),
            ...config
        });

        // Estado interno
        this.#logBatch = [];
        this.#batchTimer = null;
        this.#throttleMap = new Map(); // Para tracking de throttling
        this.#metrics = createInitialMetrics();

        // Bind methods para uso como callbacks
        this.error = this.error.bind(this);
        this.warn = this.warn.bind(this);
        this.info = this.info.bind(this);
        this.debug = this.debug.bind(this);
    }

    #config;
    #logBatch;
    #batchTimer;
    #throttleMap;
    #metrics;

    /**
     * Formatea el mensaje de log usando herramientas auxiliares
     */
    #formatMessage(level, message, ...args) {
        return formatLogMessage(level, message, args);
    }

    /**
     * Procesa un log (con batching opcional)
     */
    #processLog(level, formattedMessage) {
        this.#metrics.totalLogs++;

        if (this.#config.enableBatching) {
            this.#addToBatch(level, formattedMessage);
        } else {
            this.#writeLog(level, formattedMessage);
        }
    }

    /**
     * Agrega log al batch
     */
    #addToBatch(level, formattedMessage) {
        this.#logBatch.push({ level, message: formattedMessage });
        this.#metrics.batchedLogs++;

        // Flush si el batch está lleno
        if (this.#logBatch.length >= this.#config.batchSize) {
            this.#flushBatch();
        } else if (!this.#batchTimer) {
            // Configurar timer para flush automático
            this.#batchTimer = setTimeout(() => {
                this.#flushBatch();
            }, this.#config.batchTimeout);
        }
    }

    /**
     * Flush del batch de logs
     */
    #flushBatch() {
        if (this.#logBatch.length === 0) return;

        const batch = [...this.#logBatch];
        this.#logBatch = [];
        
        if (this.#batchTimer) {
            clearTimeout(this.#batchTimer);
            this.#batchTimer = null;
        }

        // Escribir todos los logs del batch
        for (const { level, message } of batch) {
            this.#writeLog(level, message);
        }
    }

    /**
     * Escribe el log a la consola usando herramientas auxiliares
     */
    #writeLog(level, formattedMessage) {
        const method = getConsoleMethod(level);
        console[method](formattedMessage);
    }

    /**
     * Método principal de logging usando herramientas auxiliares
     */
    #log(level, message, ...args) {
        // Verificar si se debe loggear este nivel
        if (!shouldLog(level, this.#config.level)) {
            return;
        }

        // Verificar throttling usando herramientas auxiliares
        const throttleKey = getThrottleKey(message, args);
        if (shouldThrottleWithMap(this.#throttleMap, throttleKey, this.#config.throttleWindow, this.#config.maxLogsPerWindow)) {
            this.#metrics.throttledLogs++;
            return;
        }

        // Formatear y procesar el log
        const formattedMessage = this.#formatMessage(level, message, ...args);
        this.#processLog(level, formattedMessage);
    }

    // Métodos públicos de logging usando herramientas auxiliares
    error(message, ...args) {
        this.#log(LOG_LEVELS.ERROR, message, ...args);
    }

    warn(message, ...args) {
        this.#log(LOG_LEVELS.WARN, message, ...args);
    }

    info(message, ...args) {
        this.#log(LOG_LEVELS.INFO, message, ...args);
    }

    debug(message, ...args) {
        this.#log(LOG_LEVELS.DEBUG, message, ...args);
    }

    /**
     * Log de batch con validación usando herramientas auxiliares
     */
    debugBatch(items, message = 'Batch processing') {
        if (!shouldLogBatch(this.#config.level, items)) {
            return;
        }

        const batchMessage = createBatchMessage(message, items);
        this.debug(batchMessage);
    }

    /**
     * Log de progreso con validación usando herramientas auxiliares
     */
    progress(current, total, operation = 'Processing') {
        if (!shouldLogProgress(this.#config.level)) {
            return;
        }

        const progressMessage = createProgressMessage(current, total, operation);
        this.info(progressMessage);
    }

    /**
     * Flush manual del batch
     */
    flush() {
        this.#flushBatch();
    }

    /**
     * Obtiene métricas calculadas usando herramientas auxiliares
     */
    getMetrics() {
        return calculateMetrics(this.#metrics, this.#throttleMap);
    }

    /**
     * Cambia el nivel de logging dinámicamente
     */
    setLevel(level) {
        if (typeof level === 'string') {
            const numericLevel = LOG_LEVELS[level.toUpperCase()];
            if (numericLevel !== undefined) {
                this.#config.level = numericLevel;
            }
        } else if (typeof level === 'number' && level >= 0 && level <= 3) {
            this.#config.level = level;
        }
    }

    /**
     * Crear logger hijo con contexto
     */
    child(context) {
        const childLogger = new OptimizedLoggerService(this.#config);
        const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
        
        // Override métodos para incluir contexto
        const originalMethods = ['error', 'warn', 'info', 'debug'];
        originalMethods.forEach(method => {
            const originalMethod = childLogger[method];
            childLogger[method] = (message, ...args) => {
                originalMethod.call(childLogger, `[${contextStr}] ${message}`, ...args);
            };
        });

        return childLogger;
    }

    /**
     * Cleanup al destruir el logger
     */
    destroy() {
        this.#flushBatch();
        if (this.#batchTimer) {
            clearTimeout(this.#batchTimer);
        }
        this.#throttleMap.clear();
    }
}

export default OptimizedLoggerService;