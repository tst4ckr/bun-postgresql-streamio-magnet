/**
 * @fileoverview UnifiedLogger - Logger unificado para el sistema principal
 * 
 * RESPONSABILIDAD PRINCIPAL: Proporcionar un único logger con todas las características del sistema principal
 * 
 * Características consolidadas:
 * - Lazy evaluation y batching (de EnhancedLogger)
 * - Source location tracking (de EnhancedLogger) 
 * - Structured logging (de EnhancedLogger)
 * - Memory management (de EnhancedLogger)
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
  formatLogMessage,
  getConsoleMethod,
  extractSourceInfo,
  createStructuredMessage,
  validateLoggerConfig,
  createInitialMetrics,
  createLazyEvaluator,
  createChildLogger
} from './UnifiedLogger_tools.js';

export class UnifiedLogger {
  static LEVELS = LOG_LEVELS;
  static LEVEL_NAMES = LEVEL_NAMES;

  constructor(config = {}) {
    this.#config = validateLoggerConfig({
      level: config.level || getEnvironmentLevel(),
      enableSourceTracking: config.enableSourceTracking !== false,
      enableStructuredLogging: config.enableStructuredLogging !== false,
      enableLazyEvaluation: config.enableLazyEvaluation !== false,
      maxMemoryMB: config.maxMemoryMB || 5,
      ...config
    });

    // Estado interno
    this.#sourceLocationCache = new Map();
    this.#metrics = createInitialMetrics();
    this.#lazyEvaluator = createLazyEvaluator(this.#config);

    // Bind methods
    this.error = this.error.bind(this);
    this.warn = this.warn.bind(this);
    this.info = this.info.bind(this);
    this.debug = this.debug.bind(this);
  }

  #config;
  #sourceLocationCache;
  #metrics;
  #lazyEvaluator;

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
    
    if (this.#config.enableStructuredLogging && args.length > 0) {
      const structuredMessage = createStructuredMessage(message, args);
      return sourceLocation ? `${sourceLocation} ${structuredMessage}` : structuredMessage;
    }
    
    const baseMessage = formatLogMessage(level, message, args);
    return sourceLocation ? `${sourceLocation} ${baseMessage}` : baseMessage;
  }

  /**
   * Método principal de logging
   */
  #log(level, message, ...args) {
    if (!shouldLog(level, this.#config.level)) return;

    // Lazy evaluation
    if (this.#config.enableLazyEvaluation) {
      const evaluated = this.#lazyEvaluator.evaluate(level, message, args);
      if (!evaluated.shouldLog) return;
      
      message = evaluated.message;
      args = evaluated.args;
    }

    const formattedMessage = this.#formatMessage(level, message, args);
    this.#metrics.totalLogs++;

    const method = getConsoleMethod(level);
    console[method](formattedMessage);
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
   * Log con contexto estructurado
   */
  log(level, message, context = {}) {
    if (!shouldLog(level, this.#config.level)) return;

    const structuredMessage = createStructuredMessage(message, [context]);
    const sourceLocation = this.#getSourceLocation();
    const finalMessage = sourceLocation ? `${sourceLocation} ${structuredMessage}` : structuredMessage;

    this.#metrics.totalLogs++;
    const method = getConsoleMethod(level);
    console[method](finalMessage);
  }

  /**
   * Obtiene métricas
   */
  getMetrics() {
    return {
      ...this.#metrics,
      cacheHitRate: this.#metrics.cacheHits + this.#metrics.cacheMisses > 0 ? 
        ((this.#metrics.cacheHits / (this.#metrics.cacheHits + this.#metrics.cacheMisses)) * 100).toFixed(1) : '0.0'
    };
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
    return createChildLogger(this, context, this.#config);
  }

  /**
   * Cleanup
   */
  destroy() {
    this.#sourceLocationCache.clear();
    this.#lazyEvaluator.cleanup();
  }
}

export default UnifiedLogger;